/**
 * Station Events Module
 *
 * Reads the event history of a HomeBase (table history_record_info) and the event thumbnails
 * over the SDK's P2P session. The SDK has no API for this, so it uses the session directly:
 *   - CMD_DATABASE_QUERY_COMBINATION_WITH_AI (10011): events of ONE day together with the detections of the
 *     station's AI (person / vehicle / pet, recognised persons); payload as the SDK sends for its table reads
 *   - CMD_DATABASE_QUERY_BY_DATE (10006): events of ONE day without detections, if the station refuses 10011
 *   - CMD_DATABASE_IMAGE via session.requestImage(): thumbnail JPEG of an event, detection pictures
 * The commands are the ones the Eufy app uses; the payloads of 10006 and the image request follow
 * bropat/eufy-security-client (src/http/station.ts).
 *
 * Station time stamps are local station time ("2026-10-11 19:06:29"), shown as they are.
 */

const fs = require('fs');
const path = require('path');
const utils = require('./utils');

const CMD_DATABASE_QUERY_BY_DATE = 10006;
const CMD_DATABASE_QUERY_COMBINATION_WITH_AI = 10011;
const STATION_CHANNEL = 255;
const EVENT_TABLE = 'history_record_info';
const MAX_EVENTS_PER_DAY = 300;
const QUERY_TIMEOUT_MS = 20000;
const IMAGE_TIMEOUT_MS = 20000;
const MAX_LOOKBACK_DAYS = 7;
const REQUEST_DEADLINE_MS = 60000;      // a whole event list request, waiting in the station queue included
const STALE_SESSION_TIMEOUTS = 2;       // unanswered database queries in a row after which the session is dropped

// detection_type bits of a crop picture row. Person (face / body), vehicle, pet and sound were compared with the app,
// crying and package are taken from bropat/eufy-security-client (FilterDetectType) and are not verified.
const DETECTION_BITS = [[1, 'person'], [2, 'person'], [4, 'vehicle'], [8, 'pet'], [128, 'sound'], [256, 'crying'], [512, 'package'], [1024, 'package']];

const THUMB_DIR = path.join(utils.dataDir, 'event-thumbs');
const CROP_DIR = path.join(utils.dataDir, 'event-crops');
const PICTURE_DIR = path.join(utils.dataDir, 'event-pictures');

let ctx = null;                       // { getClient(), getInfo(sn), listDeviceSerials() }
const queues = new Map();             // station serial -> promise chain (one P2P request at a time)
const queued = new Map();             // station serial -> number of requests queued or running
const timeoutsInRow = new Map();      // station serial -> unanswered database queries in a row
const refreshes = new Map();          // device serial -> running refreshLatestEventPicture()
const eventIndex = new Map();         // recordId -> { stationSn, deviceSn, thumbPath }
const cropIndex = new Map();          // pictureId -> { stationSn, deviceSn, cropPath }
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
 * @param {number} [deadline] - Time stamp (ms) after which the task is dropped instead of run
 */
function enqueue(stationSn, task, deadline) {
    const previous = queues.get(stationSn) || Promise.resolve();
    queued.set(stationSn, (queued.get(stationSn) || 0) + 1);
    const next = previous.catch(() => { }).then(() => {
        if (deadline && Date.now() >= deadline) throw timeoutError('station busy, the request expired in its queue');
        return task();
    }).finally(() => queued.set(stationSn, queued.get(stationSn) - 1));
    queues.set(stationSn, next);
    return next;
}

/**
 * Error of a request the station did not answer in time
 */
function timeoutError(message) {
    const error = new Error(message);
    error.code = 'ETIMEDOUT';
    return error;
}

/**
 * Reject a promise that is not settled by the deadline
 */
function withDeadline(promise, deadline, message) {
    let timer;
    const expired = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(timeoutError(message)), Math.max(0, deadline - Date.now()));
    });
    return Promise.race([promise, expired]).finally(() => clearTimeout(timer));
}

/**
 * Count unanswered database queries of a station. The SDK keeps a session it once connected even when the station
 * stopped answering (it does not notice a lost link), so after several timeouts in a row the session is closed:
 * the next request opens a new one.
 */
async function watchSession(stationSn, session, request) {
    try {
        const result = await request;
        timeoutsInRow.delete(stationSn);
        return result;
    } catch (error) {
        if (error.code !== 'ETIMEDOUT') {
            timeoutsInRow.delete(stationSn);   // a refusal is an answer: the station is there
            throw error;
        }
        const count = (timeoutsInRow.get(stationSn) || 0) + 1;
        utils.log(`⚠️ Station ${stationSn} did not answer a database query (${count} in a row, ${queued.get(stationSn) || 0} requests queued)`, 'warn');
        if (count >= STALE_SESSION_TIMEOUTS) {
            timeoutsInRow.delete(stationSn);
            utils.log(`⚠️ Closing the P2P session of station ${stationSn}, it is opened again on the next request`, 'warn');
            session.close().catch(e => utils.log(`Closing the P2P session of ${stationSn} failed: ${e.message}`, 'debug'));
        } else {
            timeoutsInRow.set(stationSn, count);
        }
        throw error;
    }
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
 * Serial number of the station a device belongs to (the device itself if it has no station)
 */
function stationOf(deviceSn) {
    const info = ctx.getInfo(deviceSn);
    return (info && info.stationSn) || deviceSn;
}

/**
 * Station of a device and the P2P session to it (opened on demand). Called inside the station's queue,
 * so a session closed by an earlier request is not used.
 * @param {string} deviceSn - Device serial number
 * @param {number} [deadline] - Time stamp (ms) by which the session must be connected
 * @returns {Promise<{session: P2PSession, accountId: string, stationSn: string}>}
 */
async function getStationSession(deviceSn, deadline) {
    const client = ctx.getClient();
    if (!client) throw new Error('not connected');
    const stationSn = stationOf(deviceSn);

    const signal = deadline ? AbortSignal.timeout(Math.max(1, deadline - Date.now())) : undefined;
    try {
        await client.connectStation(deviceSn, signal);
    } catch (error) {
        if (signal && signal.aborted) throw timeoutError(`no P2P connection to station ${stationSn}`);
        throw error;
    }
    const session = client.getP2pSessions().get(stationSn);
    if (!session) throw new Error(`no P2P session for station ${stationSn}`);

    // The station refuses table queries without its admin user id (same lookup getStationFaces uses)
    const accountId = client.adminUserIdOf(stationSn);
    if (!accountId) throw new Error(`no admin_user_id on record for station ${stationSn}`);

    return { session, accountId, stationSn };
}

/**
 * First complete JSON document of a station reply that has a numeric "cmd" (or is a refusal: "mIntRet" only)
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
            if (parsed && (parsed.cmd !== undefined || parsed.mIntRet !== undefined)) return parsed;
        } catch (e) { /* try the next brace */ }
    }
    return undefined;
}

/**
 * Send a database query and wait for the reply of the same command
 */
function queryDatabase(session, accountId, innerCmd, query, channel = 0) {
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
            else if (doc && doc.cmd === undefined) finish(reject, new Error(`station refused the database query: ${doc.msg || doc.mIntRet}`));
        };
        const timer = setTimeout(() => finish(reject, timeoutError('station did not answer the database query')), QUERY_TIMEOUT_MS);
        session.on('dbChunk', onChunk);
        try {
            // channel 0 like the old client; the combined query of the app goes to the station channel
            session.queryDatabase(EVENT_TABLE, { accountId, channel, innerCmd, query });
        } catch (error) {
            finish(reject, error);
        }
    });
}

/**
 * Rows of one day: the events and, if the station supports it, what its AI found in them
 * @returns {Promise<{rows: Array, crops: Array, persons: Array}>} history_record_info, record_crop_picture_info, person_basic_info
 */
async function queryDay(session, accountId, stationSn, deviceSn, day) {
    const nextDay = shiftDate(day, 1);   // end_date must be later than start_date, the reply only holds start_date's day

    // The query of the app's event list: the events together with their detections (one reply, a table each)
    try {
        const doc = await watchSession(stationSn, session, queryDatabase(session, accountId, CMD_DATABASE_QUERY_COMBINATION_WITH_AI, {
            count: MAX_EVENTS_PER_DAY,
            start_date: day,
            end_date: nextDay,
            start_id: 0,
            end_id: 1,
            flag: 0,
            need_ai: 1,
            res_unzip: 1,
            update_time: '0',
            start_time: `${day}000000`,
            alarm_id: ''
        }, STATION_CHANNEL));
        const tables = Array.isArray(doc.data) ? doc.data : [];   // "[]" when the day has no events
        const table = (name) => {
            const found = tables.find(entry => entry.table_name === name);
            return found && Array.isArray(found.payload) ? found.payload : [];
        };
        return { rows: table(EVENT_TABLE), crops: table('record_crop_picture_info'), persons: table('person_basic_info') };
    } catch (error) {
        if (error.code === 'ETIMEDOUT') throw error;   // no answer at all: the plain list would not come either
        utils.log(`Event detections of ${stationSn} not available (${error.message}), reading the plain event list`, 'debug');
    }

    // Plain event list (payload as in bropat/eufy-security-client), for all cameras of the station
    const cameras = ctx.listDeviceSerials().filter(sn => {
        const info = ctx.getInfo(sn);
        return info && info.stationSn === stationSn && sn !== stationSn;
    });
    const doc = await watchSession(stationSn, session, queryDatabase(session, accountId, CMD_DATABASE_QUERY_BY_DATE, {
        count: MAX_EVENTS_PER_DAY,
        detection_type: 0,
        device_info: (cameras.length > 0 ? cameras : [deviceSn]).map(sn => ({ device_sn: sn })),
        end_date: nextDay,
        event_type: 0,
        flag: 0,
        res_unzip: 1,
        start_date: day,
        start_time: `${day}000000`,
        storage_cloud: -1,
        ai_type: 0
    }));
    return { rows: Array.isArray(doc.data) ? doc.data : [], crops: [], persons: [] };   // "" when the day has no events
}

/**
 * What the station's AI found in an event
 * @param {Array} crops - record_crop_picture_info rows of the event
 * @param {Array} persons - person_basic_info rows of the station
 * @returns {{detections: string[], persons: string[], crops: Array}} Kinds of detections, names of recognised
 *          persons and the detection pictures ({ pictureId, detections, person })
 */
function describeDetections(crops, persons) {
    const order = DETECTION_BITS.map(([, kind]) => kind);
    const sorted = (kinds) => [...kinds].sort((a, b) => order.indexOf(a) - order.indexOf(b));

    const detections = new Set();
    const names = new Set();
    const pictures = [];
    for (const crop of crops) {
        const kinds = new Set(DETECTION_BITS.filter(([bit]) => crop.detection_type & bit).map(([, kind]) => kind));
        kinds.forEach(kind => detections.add(kind));

        // Strangers have a person too, named "stranger<n>" by the station
        const person = persons.find(entry => entry.person_id === crop.person_id);
        const name = person && person.name && !/^stranger\d*$/i.test(person.name) ? person.name : null;
        if (name) names.add(name);

        if (crop.crop_path) pictures.push({ pictureId: crop.picture_id, detections: sorted(kinds), person: name });
    }
    return { detections: sorted(detections), persons: [...names], crops: pictures };
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

    const deadline = Date.now() + REQUEST_DEADLINE_MS;
    const stationSn = stationOf(deviceSn);

    const { rows, crops, persons } = await withDeadline(
        enqueue(stationSn, async () => {
            const { session, accountId } = await getStationSession(deviceSn, deadline);
            return queryDay(session, accountId, stationSn, deviceSn, day);
        }, deadline),
        deadline, `station ${stationSn} busy, no event list within ${REQUEST_DEADLINE_MS / 1000}s`);
    if (rows.length >= MAX_EVENTS_PER_DAY) utils.log(`⚠️ Event list of ${day} may be truncated (${rows.length} events)`, 'warn');

    const events = rows
        .filter(row => row.device_sn === deviceSn && String(row.start_time).slice(0, 10).replace(/-/g, '') === day)
        .map(row => {
            eventIndex.set(String(row.record_id), { stationSn, deviceSn: row.device_sn, thumbPath: row.thumb_path });
            const eventCrops = crops.filter(crop => crop.record_id === row.record_id);
            eventCrops.forEach(crop => cropIndex.set(String(crop.picture_id), { stationSn, deviceSn: row.device_sn, cropPath: crop.crop_path }));
            return {
                recordId: row.record_id,
                deviceSn: row.device_sn,
                start: row.start_time,
                end: row.end_time,
                durationSec: Math.max(0, Math.round((new Date(row.end_time) - new Date(row.start_time)) / 1000)),
                triggerType: row.trigger_type,
                ...describeDetections(eventCrops, persons),
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
    const deadline = Date.now() + REQUEST_DEADLINE_MS;
    return enqueue(stationSn, async () => {
        const { session, accountId } = await getStationSession(deviceSn, deadline);
        return requestImage(session, accountId, filePath);
    }, deadline);
}

/**
 * Request one image of the station and wait for it
 */
function requestImage(session, accountId, filePath) {
    return new Promise((resolve, reject) => {
        const finish = (fn, value) => {
            clearTimeout(timer);
            session.off('image', onImage);
            fn(value);
        };
        const onImage = (e) => { if (e.file === filePath) finish(resolve, e.data); };
        const timer = setTimeout(() => finish(reject, timeoutError('station did not send the image')), IMAGE_TIMEOUT_MS);
        session.on('image', onImage);
        try {
            session.requestImage(filePath, { accountId });
        } catch (error) {
            finish(reject, error);
        }
    });
}

/**
 * Thumbnail of an event (JPEG), cached on disk. Only event ids from a list this server delivered
 * (or already cached) are served: the station path never comes from the client.
 * @param {string} recordId - Record id
 * @returns {Promise<Buffer|null>} JPEG or null if unknown
 */
async function getThumbnail(recordId) {
    const entry = eventIndex.get(String(recordId));
    return getCachedImage(THUMB_DIR, recordId, entry && { ...entry, imagePath: entry.thumbPath });
}

/**
 * Detection picture of an event (JPEG): the part of the image the station's AI recognised something in.
 * Cached on disk and only served for picture ids of a list this server delivered, like the thumbnails.
 * @param {string} pictureId - Picture id
 * @returns {Promise<Buffer|null>} JPEG or null if unknown
 */
async function getCropPicture(pictureId) {
    const entry = cropIndex.get(String(pictureId));
    return getCachedImage(CROP_DIR, pictureId, entry && { ...entry, imagePath: entry.cropPath });
}

/**
 * Station image from the disk cache, else from the station
 * @param {string} dir - Cache directory
 * @param {string} id - Id the image is cached under
 * @param {Object} [entry] - { stationSn, deviceSn, imagePath } if the image is known
 * @returns {Promise<Buffer|null>} JPEG or null if unknown
 */
async function getCachedImage(dir, id, entry) {
    const file = path.join(dir, `${id}.jpg`);
    if (fs.existsSync(file)) return fs.readFileSync(file);
    if (!entry || !entry.imagePath) return null;

    const data = await fetchImage(entry.deviceSn, entry.stationSn, entry.imagePath);
    fs.mkdirSync(dir, { recursive: true });
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
 * Thumbnail of the device's latest event, stored in data/event-pictures/<sn>.jpg (the "event picture").
 * A background lookup: one per device at a time, and none while the station is busy with other requests
 * (a station that does not answer would otherwise collect lookups in its queue and hold up the event list).
 * @param {string} deviceSn - Device serial number
 * @returns {Promise<{data: Buffer, type: Object}|null>} Picture if it is NEW since the last call, else null
 */
function refreshLatestEventPicture(deviceSn) {
    const running = refreshes.get(deviceSn);
    if (running) return running;

    if (queued.get(stationOf(deviceSn)) > 0) return Promise.resolve(null);

    const refresh = lookUpLatestEventPicture(deviceSn).finally(() => refreshes.delete(deviceSn));
    refreshes.set(deviceSn, refresh);
    return refresh;
}

/**
 * Look up the latest event picture of a device (see refreshLatestEventPicture)
 */
async function lookUpLatestEventPicture(deviceSn) {
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

module.exports = { init, getEvents, getThumbnail, getCropPicture, refreshLatestEventPicture };
