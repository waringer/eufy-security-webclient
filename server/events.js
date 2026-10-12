/**
 * Station Events Module
 *
 * Reads the event history of a HomeBase (table history_record_info) and the event thumbnails
 * over the SDK's P2P session. The SDK has no API for this, so it uses the session directly:
 *   - CMD_DATABASE_QUERY_BY_DATE (10006): events of ONE day (start_date; end_date must be a later day)
 *   - CMD_DATABASE_IMAGE via session.requestImage(): thumbnail JPEG of an event
 * Both commands are the ones the Eufy app uses; their payloads follow bropat/eufy-security-client (src/http/station.ts).
 *
 * Station time stamps are local station time ("2026-10-11 19:06:29"), shown as they are.
 */

const fs = require('fs');
const path = require('path');
const utils = require('./utils');

const CMD_DATABASE_QUERY_BY_DATE = 10006;
const EVENT_TABLE = 'history_record_info';
const MAX_EVENTS_PER_DAY = 300;
const QUERY_TIMEOUT_MS = 20000;
const IMAGE_TIMEOUT_MS = 20000;
const MAX_LOOKBACK_DAYS = 7;

const THUMB_DIR = path.join(utils.dataDir, 'event-thumbs');
const PICTURE_DIR = path.join(utils.dataDir, 'event-pictures');

let ctx = null;                       // { getClient(), getInfo(sn), listDeviceSerials() }
const queues = new Map();             // station serial -> promise chain (one P2P request at a time)
const eventIndex = new Map();         // recordId -> { stationSn, deviceSn, thumbPath }
const lastRecordByDevice = new Map(); // device serial -> record id of the last picture taken from the station

/**
 * Initialize with accessors of the Eufy client module
 * @param {Object} context - { getClient, getInfo, listDeviceSerials }
 */
function init(context) {
    ctx = context;
}

/**
 * Run a task after all earlier P2P requests of the station (replies cannot be told apart)
 */
function enqueue(stationSn, task) {
    const previous = queues.get(stationSn) || Promise.resolve();
    const next = previous.catch(() => { }).then(task);
    queues.set(stationSn, next);
    return next;
}

/**
 * "YYYYMMDD" of a date (local)
 */
function formatDate(date) {
    return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Date of a "YYYYMMDD" string plus an offset in days (local date arithmetic, DST safe)
 */
function shiftDate(dateStr, days) {
    const date = new Date(Number(dateStr.slice(0, 4)), Number(dateStr.slice(4, 6)) - 1, Number(dateStr.slice(6, 8)) + days);
    return formatDate(date);
}

/**
 * Station of a device and the P2P session to it (opened on demand)
 * @param {string} deviceSn - Device serial number
 * @returns {Promise<{session: P2PSession, accountId: string, stationSn: string}>}
 */
async function getStationSession(deviceSn) {
    const client = ctx.getClient();
    if (!client) throw new Error('not connected');
    const info = ctx.getInfo(deviceSn);
    const stationSn = (info && info.stationSn) || deviceSn;

    await client.connectStation(deviceSn);
    const session = client.getP2pSessions().get(stationSn);
    if (!session) throw new Error(`no P2P session for station ${stationSn}`);

    // The station refuses table queries without its admin user id (same lookup getStationFaces uses)
    const accountId = client.adminUserIdOf(stationSn);
    if (!accountId) throw new Error(`no admin_user_id on record for station ${stationSn}`);

    return { session, accountId, stationSn };
}

/**
 * First complete JSON document of a station reply that has a numeric "cmd"
 * (the reply arrives in several fragments, followed by binary padding)
 */
function firstDocument(decoded) {
    for (let start = decoded.indexOf('{'); start >= 0; start = decoded.indexOf('{', start + 1)) {
        let depth = 0, inString = false, escaped = false, end = -1;
        for (let i = start; i < decoded.length; i++) {
            const c = decoded[i];
            if (inString) {
                if (escaped) escaped = false;
                else if (c === '\\') escaped = true;
                else if (c === '"') inString = false;
                continue;
            }
            if (c === '"') inString = true;
            else if (c === '{') depth++;
            else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
        }
        if (end < 0) return undefined;   // not complete yet
        try {
            const parsed = JSON.parse(decoded.slice(start, end + 1));
            if (parsed && parsed.cmd !== undefined) return parsed;
        } catch (e) { /* try the next brace */ }
    }
    return undefined;
}

/**
 * Send a database query and wait for the reply of the same command
 */
function queryDatabase(session, accountId, innerCmd, query) {
    return new Promise((resolve, reject) => {
        let text = '';
        const finish = (fn, value) => {
            clearTimeout(timer);
            session.off('dbChunk', onChunk);
            fn(value);
        };
        const onChunk = (chunk) => {
            text += chunk.text;
            const doc = firstDocument(Buffer.from(text, 'latin1').toString('utf8'));
            if (doc && doc.cmd === innerCmd) finish(resolve, doc);
        };
        const timer = setTimeout(() => finish(reject, new Error('station did not answer the database query')), QUERY_TIMEOUT_MS);
        session.on('dbChunk', onChunk);
        try {
            // channel 0 like the old client (the SDK default 255 is for its own table reads)
            session.queryDatabase(EVENT_TABLE, { accountId, channel: 0, innerCmd, query });
        } catch (error) {
            finish(reject, error);
        }
    });
}

/**
 * Events of one day
 * @param {string} deviceSn - Device serial number (events of this device only)
 * @param {string} [date] - "YYYYMMDD", default today
 * @returns {Promise<Array>} Events, newest first
 */
async function getEvents(deviceSn, date) {
    const day = date || formatDate(new Date());
    if (!/^\d{8}$/.test(day)) throw new Error('invalid date');

    const { session, accountId, stationSn } = await getStationSession(deviceSn);

    // All cameras of the station: the filter by device is done afterwards
    const cameras = ctx.listDeviceSerials().filter(sn => {
        const info = ctx.getInfo(sn);
        return info && info.stationSn === stationSn && sn !== stationSn;
    });

    const doc = await enqueue(stationSn, () => queryDatabase(session, accountId, CMD_DATABASE_QUERY_BY_DATE, {
        count: MAX_EVENTS_PER_DAY,
        detection_type: 0,
        device_info: (cameras.length > 0 ? cameras : [deviceSn]).map(sn => ({ device_sn: sn })),
        end_date: shiftDate(day, 1),    // must be later than start_date, the reply only holds start_date's day
        event_type: 0,
        flag: 0,
        res_unzip: 1,
        start_date: day,
        start_time: `${day}000000`,
        storage_cloud: -1,
        ai_type: 0
    }));

    const rows = Array.isArray(doc.data) ? doc.data : [];   // "" when the day has no events
    if (rows.length >= MAX_EVENTS_PER_DAY) utils.log(`⚠️ Event list of ${day} may be truncated (${rows.length} events)`, 'warn');

    const events = rows
        .filter(row => row.device_sn === deviceSn)
        .map(row => {
            eventIndex.set(String(row.record_id), { stationSn, deviceSn: row.device_sn, thumbPath: row.thumb_path });
            return {
                recordId: row.record_id,
                deviceSn: row.device_sn,
                start: row.start_time,
                end: row.end_time,
                durationSec: Math.max(0, Math.round((new Date(row.end_time) - new Date(row.start_time)) / 1000)),
                triggerType: row.trigger_type,
                size: row.folder_size,
                hasThumbnail: !!row.thumb_path,
                cipherId: row.cipher_id,
                storagePath: row.storage_path
            };
        })
        .sort((a, b) => (a.start < b.start ? 1 : a.start > b.start ? -1 : b.recordId - a.recordId));

    utils.log(`📅 ${events.length} events of ${deviceSn} on ${day}`, 'debug');
    return events;
}

/**
 * Download one station image (thumbnail)
 */
async function fetchImage(deviceSn, stationSn, filePath) {
    const { session, accountId } = await getStationSession(deviceSn);
    return enqueue(stationSn, () => new Promise((resolve, reject) => {
        const finish = (fn, value) => {
            clearTimeout(timer);
            session.off('image', onImage);
            fn(value);
        };
        const onImage = (e) => { if (e.file === filePath) finish(resolve, e.data); };
        const timer = setTimeout(() => finish(reject, new Error('station did not send the image')), IMAGE_TIMEOUT_MS);
        session.on('image', onImage);
        try {
            session.requestImage(filePath, { accountId });
        } catch (error) {
            finish(reject, error);
        }
    }));
}

/**
 * Thumbnail of an event (JPEG), cached on disk. Only event ids from a list this server delivered
 * (or already cached) are served: the station path never comes from the client.
 * @param {string} recordId - Record id
 * @returns {Promise<Buffer|null>} JPEG or null if unknown
 */
async function getThumbnail(recordId) {
    const file = path.join(THUMB_DIR, `${recordId}.jpg`);
    if (fs.existsSync(file)) return fs.readFileSync(file);

    const entry = eventIndex.get(String(recordId));
    if (!entry || !entry.thumbPath) return null;

    const data = await fetchImage(entry.deviceSn, entry.stationSn, entry.thumbPath);
    fs.mkdirSync(THUMB_DIR, { recursive: true });
    fs.writeFileSync(file, data);
    return data;
}

/**
 * Newest event of a device within the last days
 * @param {string} deviceSn - Device serial number
 * @returns {Promise<Object|null>} Event or null
 */
async function getLatestEvent(deviceSn) {
    const today = formatDate(new Date());
    for (let back = 0; back < MAX_LOOKBACK_DAYS; back++) {
        const events = await getEvents(deviceSn, shiftDate(today, -back));
        const withThumb = events.find(e => e.hasThumbnail);
        if (withThumb) return withThumb;
    }
    return null;
}

/**
 * Thumbnail of the device's latest event, stored in data/event-pictures/<sn>.jpg (the "event picture")
 * @param {string} deviceSn - Device serial number
 * @returns {Promise<{data: Buffer, type: Object}|null>} Picture if it is NEW since the last call, else null
 */
async function refreshLatestEventPicture(deviceSn) {
    const event = await getLatestEvent(deviceSn);
    if (!event) return null;
    if (lastRecordByDevice.get(deviceSn) === event.recordId) return null;

    const data = await getThumbnail(event.recordId);
    if (!data) return null;

    lastRecordByDevice.set(deviceSn, event.recordId);

    // Same image as already stored (e.g. first look after a restart): nothing new to tell the UI
    const file = path.join(PICTURE_DIR, `${deviceSn}.jpg`);
    if (fs.existsSync(file) && fs.readFileSync(file).equals(data)) return null;

    fs.mkdirSync(PICTURE_DIR, { recursive: true });
    fs.writeFileSync(file, data);
    return { data, type: { ext: 'jpg', mime: 'image/jpeg' }, event };
}

module.exports = { init, getEvents, getThumbnail, refreshLatestEventPicture };
