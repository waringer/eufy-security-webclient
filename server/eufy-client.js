/**
 * Eufy Security Client Module
 *
 * Manages connection to Eufy Security system (via @mega-yfue/eufy-sdk) and provides:
 * - Login handling incl. captcha / 2FA (answered through the web UI)
 * - Device discovery and management
 * - Live streaming control
 * - Event handling and broadcasting
 * - WebSocket API command handlers
 * - Snapshot management and updates
 */

const fs = require('fs');
const path = require('path');
const utils = require('./utils');
const { loadSdk, getSdkVersion } = require('./eufy-sdk');
const { buildDeviceProperties } = require('./property-meta');
const events = require('./events');

const transcode = require('./transcode');
const wsApi = require('./ws-api');

const eufyVersion = getSdkVersion();

// State management
let sdk = null;                             // Loaded SDK module namespace
let eufyClient = null;                      // EufyMega client instance
let loggedIn = false;                       // True once login() resolved with status ok
let loginState = { status: 'idle' };        // Login progress: idle | captcha | 2fa | ok | error
let wsEvnentHandlersRegistered = false;     // Flag to prevent duplicate handler registration
let currentStreamingSN = null;              // Serial number of currently streaming device
let activeStream = null;                    // Live stream consumer of the current device
const stations = new Set();                 // Serial numbers of discovered stations
const devices = new Map();                  // Serial number -> Device (strong refs, the SDK only holds them weakly)

/**
 * Semantic SDK event -> legacy broadcast event name used by the web UI.
 * Events without a SDK equivalent (alarms, jam, temperature, ...) are not emitted anymore.
 */
const EVENT_NAME_MAP = {
    motion: 'motion detected',
    personDetected: 'person detected',
    cryingDetected: 'crying detected',
    petDetection: 'pet detected',
    vehicleDetected: 'vehicle detected',
    soundDetected: 'sound detected',
    doorbellPress: 'rings',
    packageDelivered: 'package delivered',
    packageStranded: 'packet stranded',
    packageTaken: 'package taken',
    strangerDetected: 'stranger person detected',
};

const EVENT_PICTURE_DIR = path.join(utils.dataDir, 'event-pictures');

// Legacy numeric pan/tilt direction (as sent by the UI) -> SDK PtzDirection
const PTZ_DIRECTIONS = { 1: 'left', 2: 'right', 3: 'up', 4: 'down' };

/**
 * Snapshot Saved Event Handler
 * Triggered when transcode module saves a new snapshot to disk.
 * Loads the snapshot and broadcasts it to all WebSocket clients.
 */
transcode.event.on('snapshotSaved', (deviceSN) => {
    const jpg = utils.loadSnapshotFromDisk(deviceSN);
    if (!jpg) {
        utils.log(`❌ Failed to load snapshot from disk for device: ${deviceSN}`, 'warn');
        return;
    }

    // Broadcast updated snapshot to all WebSocket clients
    wsApi.wsBroadcast({
        "type": "event",
        "event": {
            "source": "device",
            "event": "property changed",
            "serialNumber": deviceSN,
            "name": "picture",
            "value": {
                "data": {
                    "type": "Buffer",
                    "data": Array.from(jpg)
                }, "type": {
                    "ext": "jpg",
                    "mime": "image/jpeg"
                },
                "isSnapshot": true,
                "isRecent": "snapshot"
            }
        }
    });

    utils.log(`📡 Broadcasted snapshot update for device: ${deviceSN}`, 'debug');
});

/**
 * Broadcast helper for device events
 */
function broadcastDeviceEvent(event, serialNumber, extra = {}) {
    wsApi.wsBroadcast({
        type: 'event',
        event: { source: 'device', event, serialNumber, ...extra }
    });
}

/**
 * Broadcast helper for system level events (login dialogs etc.)
 */
function broadcastSystemEvent(event, extra = {}) {
    wsApi.wsBroadcast({
        type: 'event',
        event: { source: 'system', event, ...extra }
    });
}

/**
 * Public login state for the web UI
 * @returns {Object} status plus captcha image / 2FA method when applicable
 */
function getLoginState() {
    return { ...loginState };
}

/**
 * Connect to Eufy Security System
 * Creates the SDK client and starts the login flow. Captcha / 2FA are answered later
 * through setCaptcha() / setVerifyCode() (web UI).
 * @param {Object} eufyConfig - Configuration object with username, password, country, persistentDir
 */
async function connect(eufyConfig) {
    try {
        utils.log('Initializing Eufy Security Client...', 'info');

        // Prevent duplicate connections
        if (eufyClient && isConnected()) {
            utils.log('✓ Eufy client is already connected.', 'warn');
            return;
        }

        // Validate required configuration parameters
        if (!(eufyConfig.username && eufyConfig.password && eufyConfig.persistentDir && eufyConfig.country)) {
            throw new Error('Eufy configuration parameters are missing. Please check the settings.');
        }

        sdk = await loadSdk();

        // Event history and event thumbnails come from the station (not part of the SDK API)
        events.init({
            getClient: () => eufyClient,
            getInfo: (sn) => deviceInfo.get(sn),
            listDeviceSerials: () => Array.from(deviceInfo.keys())
        });

        // WebSocket handlers must exist before login finishes, otherwise the UI
        // cannot connect to answer captcha / 2FA requests
        registerWebSocketHandlers();

        loggedIn = false;
        loginState = { status: 'idle' };

        eufyClient = new sdk.EufyMega({
            email: eufyConfig.username,
            password: eufyConfig.password,
            countryCode: eufyConfig.country,
            store: new sdk.FileSessionStore(path.join(eufyConfig.persistentDir, 'eufy-session.json')),
            logger: utils.createSdkLogger(),   // filtered by SDK_LOG_LEVEL
        });
        registerClientEvents(eufyClient);

        await handleLoginResult(await eufyClient.login());
    } catch (error) {
        loginState = { status: 'error', message: error.message };
        utils.log('❌ Error during initialization: ' + error.message, 'error');
    }
}

/**
 * Register SDK client level event handlers
 * @param {EufyMega} client - SDK client instance
 */
function registerClientEvents(client) {
    client.on('connect', () => utils.log('🔌 Eufy realtime connection established.', 'debug'));
    client.on('disconnect', () => utils.log('⚠️ Eufy realtime connection closed.', 'warn'));
    client.on('pushConnect', () => utils.log('🔌 Eufy push connection established.', 'debug'));
    client.on('pushDisconnect', () => utils.log('⚠️ Eufy push connection closed.', 'warn'));

    client.on('error', (error) => utils.log('❌ Eufy error: ' + (error && error.message ? error.message : error), 'error'));

    client.on('sessionExpired', (error) => {
        utils.log('❌ Eufy session expired: ' + (error && error.message ? error.message : error), 'error');
        loggedIn = false;
        loginState = { status: 'error', message: 'Session expired' };
        stations.clear();
        devices.clear();
        broadcastSystemEvent('login error', { message: loginState.message });
    });

    // Device discovery after the initial listing
    client.on('deviceAdded', (info) => {
        client.getDevice(info.sn).then(device => addDevice(device, info)).catch((error) =>
            utils.log(`❌ Failed to load new device ${info.sn}: ${error.message}`, 'error'));
    });
    client.on('deviceRemoved', (info) => {
        devices.delete(info.sn);
        utils.log(`⚠️ Device removed: ${info.name} (${info.sn})`, 'warn');
    });

    // Catch-all for all semantic device events
    client.on('event', (e) => handleDeviceEvent(e));
}

/**
 * Drive the login state machine
 * @param {Object} result - LoginResult returned by login() / solveCaptcha() / submitVerifyCode()
 */
async function handleLoginResult(result) {
    switch (result.status) {
        case sdk.LoginStatus.Ok:
            utils.log('✓ Successfully connected to Eufy!', 'info');
            await loadDevices();
            loggedIn = true;
            loginState = { status: 'ok' };
            broadcastSystemEvent('login ok');
            break;
        case sdk.LoginStatus.Captcha:
            loginState = { status: 'captcha', image: result.image };
            utils.log('🔐 Eufy requires a captcha - waiting for user input in the web UI.', 'warn');
            broadcastSystemEvent('captcha request', { image: result.image });
            break;
        case sdk.LoginStatus.TwoFactor:
            loginState = { status: '2fa', method: result.method };
            utils.log(`🔐 Eufy requires a 2FA code (${result.method}) - waiting for user input in the web UI.`, 'warn');
            broadcastSystemEvent('verify code request', { method: result.method });
            break;
        default:
            throw new Error(`Unexpected login status: ${JSON.stringify(result)}`);
    }
}

/**
 * Submit captcha answer from the web UI
 * @param {string} answer - Captcha text
 */
async function setCaptcha(answer) {
    if (!eufyClient || loginState.status !== 'captcha') throw new Error('No captcha requested');
    await handleLoginResult(await eufyClient.solveCaptcha(answer));
}

/**
 * Submit 2FA verification code from the web UI
 * @param {string} code - Verification code
 */
async function setVerifyCode(code) {
    if (!eufyClient || loginState.status !== '2fa') throw new Error('No verification code requested');
    await handleLoginResult(await eufyClient.submitVerifyCode(code));
}

/**
 * Load all devices of the account after a successful login
 */
async function loadDevices() {
    stations.clear();
    devices.clear();
    for (const info of await eufyClient.getDevices()) {
        try {
            addDevice(await eufyClient.getDevice(info.sn), info);
        } catch (error) {
            utils.log(`❌ Failed to load device ${info.sn}: ${error.message}`, 'error');
        }
    }
}

/**
 * Add Device
 * Registers a discovered device and derives its station
 * @param {Device} device - SDK device object
 * @param {Object} [info] - Cloud device info (name, stationSn)
 */
function addDevice(device, info) {
    const sn = device.sn;
    utils.log(`📷 Device found: ${(info && info.name) || ''} (${sn})`, 'debug');
    devices.set(sn, device);
    if (info) deviceInfo.set(sn, info);
    stationSnByDevice.set(sn, (info && info.stationSn) || sn);
    stations.add(stationSnByDevice.get(sn));
}
const stationSnByDevice = new Map();
const deviceInfo = new Map();                 // Serial number -> cloud device info (name, model, stationSn)

/**
 * Device name by serial number (empty if the device has none)
 * @param {string} sn - Device serial number
 * @returns {string} Name or ''
 */
function getDeviceName(sn) {
    const info = deviceInfo.get(sn);
    return (info && info.name) || '';
}

/**
 * Serial numbers of all devices in a stable order: by name (case-insensitive, numbers natural),
 * devices without a name last, ties by serial number. The SDK's own order changes between runs.
 * @returns {string[]} Sorted serial numbers
 */
function getSortedDeviceSerials() {
    return Array.from(devices.keys()).sort((a, b) => {
        const nameA = getDeviceName(a);
        const nameB = getDeviceName(b);
        if (!nameA !== !nameB) return nameA ? -1 : 1;
        return nameA.localeCompare(nameB, undefined, { sensitivity: 'base', numeric: true }) || a.localeCompare(b);
    });
}

/**
 * Serial number -> name for all devices that have one
 * @returns {Object} Map of serial number to name
 */
function getDeviceNames() {
    const names = {};
    for (const sn of devices.keys()) {
        const name = getDeviceName(sn);
        if (name) names[sn] = name;
    }
    return names;
}

/**
 * Presets stored on a pan/tilt camera (the camera reports 10 slots, the used ones are "enabled")
 * @param {Device} device - SDK device object with the ptz capability
 * @returns {Promise<Array<{id: number, isDefault: boolean}>|null>} Used presets, null if they cannot be read
 */
async function getStoredPresets(device) {
    const info = deviceInfo.get(device.sn);
    const stationSn = (info && info.stationSn) || device.sn;

    // The station's answer is not tied to the request: two lists in flight at once (two cameras of one
    // station) both get the first answer. So one list at a time per station.
    const previous = presetQueues.get(stationSn) || Promise.resolve();
    const result = previous.catch(() => { }).then(() => readPresets(device));
    presetQueues.set(stationSn, result);
    return result;
}

const presetQueues = new Map();   // station serial -> promise chain of preset list requests

/**
 * Read the preset list of a camera (one request, see getStoredPresets for the queue)
 * @param {Device} device - SDK device object with the ptz capability
 * @returns {Promise<Array<{id: number, isDefault: boolean}>|null>} Used presets, null if they cannot be read
 */
async function readPresets(device) {
    try {
        const ptz = device.ptz && device.ptz();
        const preset = ptz && ptz.preset();
        if (!preset || !preset.list) return null;

        await eufyClient.connectStation(device.sn);
        const list = await Promise.race([
            preset.list(),
            new Promise((resolve, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
        ]);
        return (list || [])
            .filter(p => p.raw && p.raw.enable === 1)
            .map(p => ({ id: p.id, isDefault: p.raw.isdefault === 1 }))
            .sort((a, b) => a.id - b.id);
    } catch (error) {
        utils.log(`Presets of ${device.sn} not readable: ${error.message}`, 'debug');
        return null;
    }
}

/**
 * Get Stored Picture
 * Latest push thumbnail retained by the SDK, in the format of the old 'picture' property
 * @param {Device} device - SDK device object
 * @param {boolean} [fresh] - Skip the persisted fallback (only a picture the SDK holds counts)
 * @returns {Promise<Object|null>} { data: Buffer, type: { ext, mime } } or null if none retained
 */
async function getStoredPicture(device, fresh = false) {
    const file = path.join(EVENT_PICTURE_DIR, `${device.sn}.jpg`);
    const type = { ext: 'jpg', mime: 'image/jpeg' };

    try {
        const camera = device.camera && device.camera();
        if (camera && camera.snapshotStored) {
            const data = await camera.snapshotStored();
            if (data) {
                // The SDK cache lives in memory only - keep the last picture across restarts
                try {
                    fs.mkdirSync(EVENT_PICTURE_DIR, { recursive: true });
                    fs.writeFileSync(file, data);
                } catch (error) {
                    utils.log(`❌ Failed to persist event picture for ${device.sn}: ${error.message}`, 'warn');
                }
                return { data, type };
            }
        }
    } catch (error) {
        // StoredSnapshotUnavailableError: not-observed / pending / download-failed / invalid-image
        utils.log(`No stored picture for device ${device.sn}: ${error.reason || error.message}`, 'debug');
    }

    // Fallback: picture persisted from an earlier event
    if (fresh) return null;
    try {
        if (fs.existsSync(file)) return { data: fs.readFileSync(file), type };
    } catch (error) {
        utils.log(`❌ Failed to read persisted event picture for ${device.sn}: ${error.message}`, 'warn');
    }
    return null;
}

// Picture fingerprint per device, to broadcast each thumbnail only once
const lastPictureHash = new Map();

/**
 * Broadcast the stored picture of a device after a detection event.
 * The thumbnail is downloaded asynchronously after the push arrives, so retry a few times.
 * @param {string} sn - Device serial number
 */
async function broadcastStoredPicture(sn) {
    const device = devices.get(sn);
    if (!device) return;

    // Try the SDK's push thumbnail first; if it does not arrive, ask the station for its newest event
    // (the event is written to the station's history once its recording started)
    for (const delay of [0, 2000, 4000, 8000, 15000, 30000]) {
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));

        let picture = await getStoredPicture(device, true);
        if (!picture && delay >= 8000) {
            try {
                picture = await events.refreshLatestEventPicture(sn);
            } catch (error) {
                utils.log(`No station event picture for ${sn}: ${error.message}`, 'debug');
            }
        }
        if (!picture) continue;

        if (broadcastPicture(sn, picture)) return;
    }
}

/**
 * Broadcast a new event picture of a device (once per distinct image)
 * @param {string} sn - Device serial number
 * @param {Object} picture - { data: Buffer, type: { ext, mime } }
 * @returns {boolean} True if it was sent
 */
function broadcastPicture(sn, picture) {
    const hash = utils.generateChecksum(picture.data);
    if (lastPictureHash.get(sn) === hash) return false;   // still the previous event's image
    lastPictureHash.set(sn, hash);

    broadcastDeviceEvent('property changed', sn, {
        name: 'picture',
        value: checkDevicePictureProperty(sn, picture)
    });
    return true;
}

/**
 * Look up the newest event picture on the station in the background and send it if it is newer than
 * the one the UI got with the properties.
 * @param {string} sn - Device serial number
 */
function refreshEventPictureInBackground(sn) {
    events.refreshLatestEventPicture(sn)
        .then(picture => { if (picture) broadcastPicture(sn, picture); })
        .catch(error => utils.log(`No station event picture for ${sn}: ${error.message}`, 'debug'));
}

/**
 * Handle Device Event
 * Translates SDK semantic events into the event names the web UI knows and broadcasts them
 * @param {Object} e - Semantic event tagged with eventName
 */
function handleDeviceEvent(e) {
    const sn = e.deviceSn;

    switch (e.eventName) {
        case 'propertyChanged':
            utils.log(`Property changed on device ${sn} - ${e.property}: ${JSON.stringify(e.value)}`, 'debug');
            broadcastDeviceEvent('property changed', sn, { name: e.property, value: e.value });
            return;
        case 'dogDetected': {
            const name = e.kind === 'lick' ? 'dog lick detected' : e.kind === 'poop' ? 'dog poop detected' : 'dog detected';
            broadcastDeviceEvent(name, sn, { state: true });
            return;
        }
        case 'lockState':
            broadcastDeviceEvent('locked', sn, { state: true });
            return;
        case 'contactState':
            broadcastDeviceEvent('open', sn, { state: e.open === true });
            return;
    }

    const legacyName = EVENT_NAME_MAP[e.eventName];
    if (legacyName) {
        utils.log(`${legacyName} on device ${sn}`, 'debug');
        broadcastDeviceEvent(legacyName, sn, { state: true });
        broadcastStoredPicture(sn).catch(error =>
            utils.log(`❌ Failed to broadcast picture for ${sn}: ${error.message}`, 'error'));
    } else {
        utils.log(`Unmapped Eufy event '${e.eventName}' on device ${sn}`, 'trace');
    }
}

/**
 * Start Stream for Device
 * Initiates livestream for specified device serial number
 * Checks connection status and prevents duplicate streams
 * @param {string} serialNumber - Device serial number to start streaming
 */
async function startStreamForDevice(serialNumber) {
    // Verify Eufy client is connected
    if (!isConnected()) {
        currentStreamingSN = null;
        utils.log('❌ Eufy client is not connected. Cannot start livestream.', 'error');
        return;
    }

    // Already streaming this device
    if (activeStream && currentStreamingSN === serialNumber) {
        utils.log(`ℹ️ Livestream for device ${serialNumber} is already active.`, 'warn');
        return;
    }

    // Only one stream at a time (single transcoder)
    if (activeStream) stopActiveStream();
    currentStreamingSN = null;

    utils.log(`📲 Starting livestream for device: ${serialNumber}`, 'debug');
    const device = devices.get(serialNumber) || await eufyClient.getDevice(serialNumber);
    const camera = device.camera && device.camera();
    if (!camera || !camera.live) {
        utils.log(`❌ Device ${serialNumber} has no livestream capability.`, 'error');
        return;
    }

    currentStreamingSN = serialNumber;
    let stream;
    try {
        stream = await camera.live();
    } catch (error) {
        currentStreamingSN = null;
        utils.log(`❌ Failed to start livestream for ${serialNumber}: ${error.message}`, 'error');
        return;
    }
    activeStream = stream;

    // Coded video configuration (changes mid-session, authority for geometry)
    let videoConfig = { codec: 'h264', width: 0, height: 0 };

    stream.on('video-config', (config) => {
        videoConfig = config;
    });

    stream.on('video', (frame) => {
        utils.log(`📹 Video frame received - Size: ${frame.data.length} bytes`, 'trace');
        transcode.handleVideoData(frame.data, {
            videoCodec: frame.codec === 'h264' ? 'H264' : 'HEVC',
            videoFPS: 0,    // not reported by the SDK
            videoHeight: videoConfig.height || frame.height,
            videoWidth: videoConfig.width || frame.width,
        });
    });

    stream.on('audio', (frame) => {
        // ffmpeg input is ADTS AAC, G.711 is not supported by the pipeline
        if (frame.codec !== 'aac-lc' && frame.codec !== 'aac-eld') return;
        utils.log(`🎵 Audio frame received - Size: ${frame.data.length} bytes`, 'trace');
        transcode.handleAudioData(frame.data, { audioCodec: 'AAC' });
    });

    stream.on('error', (error) => {
        utils.log(`❌ Livestream error for ${serialNumber}: ${error && error.message ? error.message : error}`, 'error');
    });

    stream.on('stop', () => {
        utils.log(`⏹️ Livestream stopped for device: ${serialNumber}`, 'debug');
        if (activeStream !== stream) return; // stopped by us (stop/switch)
        activeStream = null;

        // Source ended while clients are still watching (e.g. connection issues)
        if (utils.getActiveStreamClients().size !== 0) {
            utils.log('⚠️ Warning: Livestream stopped, but there are still active clients', 'warn');
            transcode.stopTranscoding();

            const currentClients = utils.getActiveStreamClients();
            broadcastSystemEvent('stream_stopped_by_station', { serialNumber });
            currentClients.forEach(client => client.response.end());
        }
        if (currentStreamingSN === serialNumber) currentStreamingSN = null;
    });

    utils.log(`▶️ Livestream started for device: ${serialNumber}`, 'info');
}

/**
 * Detach and forget the active livestream consumer
 */
function stopActiveStream() {
    const stream = activeStream;
    activeStream = null;
    if (stream) {
        try {
            stream.stop();
        } catch (error) {
            utils.log(`❌ Error stopping livestream: ${error.message}`, 'error');
        }
    }
}

/**
 * Stop Stream for Device
 * Stops active livestream for specified device serial number
 * @param {string} serialNumber - Device serial number to stop streaming
 */
async function stopStreamForDevice(serialNumber) {
    if (!activeStream || currentStreamingSN !== serialNumber) {
        utils.log(`ℹ️ Livestream for device ${serialNumber} is not active, no stop required.`, 'warn');
        return;
    }

    utils.log(`📲 Stopping livestream for device: ${serialNumber}`, 'debug');
    stopActiveStream();
    currentStreamingSN = null;
    utils.log(`⏹️ Livestream stop request sent for device: ${serialNumber}`, 'info');
}

/**
 * Register WebSocket Handlers
 * Registers all WebSocket API command handlers for client communication
 * Prevents duplicate registration
 */
function registerWebSocketHandlers() {
    // Prevent duplicate handler registration
    if (wsEvnentHandlersRegistered) {
        return;
    }

    /**
     * start_listening Command
     * Returns current system state with stations, devices and login state.
     * Stays successful while login is pending so the UI can show the captcha / 2FA dialog.
     */
    wsApi.registerMessageHandler('start_listening', (message, ws) => {
        return {
            type: 'result',
            messageId: 'start_listening',
            success: true,
            result: {
                state: {
                    client: {
                        version: eufyVersion,
                    },
                    login: getLoginState(),
                    stations: Array.from(stations),
                    devices: getSortedDeviceSerials(),
                    deviceNames: getDeviceNames()
                }
            }
        };
    });

    /**
     * driver.set_captcha / driver.set_verify_code Commands
     * Answers for a pending login
     */
    wsApi.registerMessageHandler('driver.set_captcha', async (message) => {
        try {
            await setCaptcha(message.captcha);
            return { type: 'result', messageId: 'driver.set_captcha', success: true, result: { login: getLoginState() } };
        } catch (error) {
            utils.log(`❌ Captcha error: ${error.message}`, 'error');
            return { type: 'result', messageId: 'driver.set_captcha', success: false, errorCode: error.message };
        }
    });

    wsApi.registerMessageHandler('driver.set_verify_code', async (message) => {
        try {
            await setVerifyCode(message.verifyCode);
            return { type: 'result', messageId: 'driver.set_verify_code', success: true, result: { login: getLoginState() } };
        } catch (error) {
            utils.log(`❌ Verify code error: ${error.message}`, 'error');
            return { type: 'result', messageId: 'driver.set_verify_code', success: false, errorCode: error.message };
        }
    });

    /**
     * station.get_properties Command
     * The SDK has no station objects, but a station is a regular device of the account
     */
    wsApi.registerMessageHandler('station.get_properties', async (message, ws) => {
        const device = devices.get(message.serialNumber);
        const { properties, meta } = device ? buildDeviceProperties(device, deviceInfo.get(device.sn)) : { properties: {}, meta: { groups: [] } };
        return {
            type: 'result',
            messageId: 'station.get_properties',
            success: true,
            result: {
                serialNumber: message.serialNumber,
                properties: properties,
                meta: meta
            }
        };
    });

    // Not supported by the SDK yet - answer so the UI does not wait
    ['station.download_image', 'station.database_query_latest_info'].forEach(command => {
        wsApi.registerMessageHandler(command, async () => ({
            type: 'result',
            messageId: command,
            success: false,
            errorCode: 'not supported'
        }));
    });

    /**
     * device.get_properties Command
     * Returns all properties for a specific device
     * Includes special handling for picture property to provide latest snapshot
     */
    wsApi.registerMessageHandler('device.get_properties', async (message, ws) => {
        if (!isConnected()) { ws.close(); }

        const device = devices.get(message.serialNumber) || await eufyClient.getDevice(message.serialNumber);
        // Plain values under SDK names plus the SDK's description of them (labels, units, enum texts)
        const { properties, meta } = buildDeviceProperties(device, deviceInfo.get(device.sn));

        // Latest event thumbnail retained by the SDK (replaces the old 'picture' property)
        const picture = await getStoredPicture(device);
        if (picture) properties.picture = picture;

        // Check if a newer snapshot is available for picture property
        properties.picture = checkDevicePictureProperty(device.sn, properties.picture);

        // The station may know a newer event than the stored picture; it is sent as a picture update
        if (deviceInfo.has(device.sn) && device.camera && device.camera()) {
            refreshEventPictureInBackground(device.sn);
        }

        return {
            type: 'result',
            messageId: 'device.get_properties',
            success: true,
            result: {
                serialNumber: device.sn,
                properties: properties,
                meta: meta
            }
        };
    });

    /**
     * device.get_events Command
     * Events of one day (default today) from the station's history, newest first
     * message: { serialNumber, date: 'YYYYMMDD' }
     */
    wsApi.registerMessageHandler('device.get_events', async (message, ws) => {
        if (!isConnected()) { ws.close(); }

        try {
            const date = message.date ? String(message.date) : undefined;
            const list = await events.getEvents(message.serialNumber, date);
            return {
                type: 'result',
                messageId: 'device.get_events',
                success: true,
                result: { serialNumber: message.serialNumber, date: date || null, events: list }
            };
        } catch (error) {
            utils.log(`❌ Failed to read events of ${message.serialNumber}: ${error.message}`, 'error');
            return {
                type: 'result',
                messageId: 'device.get_events',
                success: false,
                errorCode: error.message,
                result: { serialNumber: message.serialNumber, date: message.date || null, events: [] }
            };
        }
    });

    /**
     * device.get_commands Command
     * Derives the command names the UI looks for from the device capabilities
     */
    wsApi.registerMessageHandler('device.get_commands', async (message, ws) => {
        if (!isConnected()) { ws.close(); }

        const device = devices.get(message.serialNumber) || await eufyClient.getDevice(message.serialNumber);
        const commands = [];
        const camera = device.camera && device.camera();
        if (camera && camera.live) commands.push('deviceStartLivestream', 'deviceStopLivestream');
        let presets = null;
        if (device.has && device.has('ptz')) {
            commands.push('devicePanAndTilt', 'devicePresetPosition');
            presets = await getStoredPresets(device);
        }

        return {
            type: 'result',
            messageId: 'device.get_commands',
            success: true,
            result: {
                serialNumber: device.sn,
                commands: commands,
                presets: presets
            }
        };
    });

    /**
     * device.preset_position Command
     * Moves PTZ camera to a stored preset position
     */
    wsApi.registerMessageHandler('device.preset_position', async (message, ws) => {
        if (!isConnected()) { ws.close(); }

        try {
            const device = devices.get(message.serialNumber) || await eufyClient.getDevice(message.serialNumber);
            const ptz = device.ptz && device.ptz();
            if (!ptz) throw new Error('not supported');
            // 'preview' sends the command the old client used for these cameras (6035, {value: slot}) and is
            // the one that moves a camera behind a HomeBase; 'goto' (6032) did nothing on a T8425
            const preset = ptz.preset();
            await (preset.preview ? preset.preview(message.position) : preset.goto(message.position));
        } catch (error) {
            utils.log(`❌ Error presetting position for device ${message.serialNumber}: ${error.message}`, 'error');
            return {
                type: "result",
                success: false,
                messageId: "device.preset_position",
                errorCode: error.message,
                value: message.position
            };
        }
        return {
            type: "result",
            success: true,
            messageId: "device.preset_position",
            result: {
                async: true
            }
        };
    });

    /**
     * device.pan_and_tilt Command
     * Controls PTZ camera movement in specified direction
     */
    wsApi.registerMessageHandler('device.pan_and_tilt', async (message, ws) => {
        if (!isConnected()) { ws.close(); }

        try {
            const device = devices.get(message.serialNumber) || await eufyClient.getDevice(message.serialNumber);
            const ptz = device.ptz && device.ptz();
            if (!ptz) throw new Error('not supported');
            // UI sends the legacy numeric directions (1=left, 2=right, 3=up, 4=down)
            const direction = PTZ_DIRECTIONS[message.direction];
            if (!direction) throw new Error('unsupported direction');
            await ptz.rotate(direction);
        } catch (error) {
            utils.log(`❌ Error moving device ${message.serialNumber}: ${error.message}`, 'error');
            return {
                type: "result",
                success: false,
                messageId: "device.pan_and_tilt",
                errorCode: error.message
            };
        }
        return {
            type: "result",
            success: true,
            messageId: "device.pan_and_tilt",
            result: {
                async: true
            }
        };
    });

    wsEvnentHandlersRegistered = true;
    utils.log('📝 Eufy WebSocket handlers registered', 'debug');
}

/**
 * Check Device Picture Property
 * Determines if a newer snapshot is available and returns updated picture data
 * Uses MD5 checksums and timestamps to detect changes
 * @param {string} deviceSN - Device serial number
 * @param {Object} properties - Current picture properties
 * @returns {Object} Updated picture properties or original if no update available
 */
function checkDevicePictureProperty(deviceSN, properties) {
    try {
        // No event picture (e.g. after a restart, the SDK keeps them in memory only):
        // fall back to the latest snapshot saved from a video stream
        if (!properties || !properties.data) {
            const snapshot = utils.loadSnapshotFromDisk(deviceSN);
            if (snapshot) {
                return {
                    "data": {
                        "type": "Buffer",
                        "data": Array.from(snapshot)
                    },
                    "type": {
                        "ext": "jpg",
                        "mime": "image/jpeg"
                    },
                    "isSnapshot": true,
                    "isRecent": "snapshot"
                };
            }
        }

        if (properties && properties.data) {
            properties.isSnapshot = false;
            let isPictureRecent = true;

            // Calculate checksum of current picture data
            const checksum = utils.generateChecksum(properties.data);
            let previousChecksum = utils.loadPictureHash(deviceSN);

            // First time seeing this device
            if (!previousChecksum) {
                utils.log(`No previous picture checksum found for device ${deviceSN}, saving current checksum.`, 'debug');
                previousChecksum = utils.savePictureHash(deviceSN, checksum);
            } else if (checksum !== previousChecksum.hash) {
                // Picture data has changed - use current data
                utils.log(`🆕 Picture checksum changed for device ${deviceSN}`, 'debug');
                previousChecksum = utils.savePictureHash(deviceSN, checksum);
            }

            // Check if a newer snapshot file exists
            const snapshotTime = utils.loadSnapshotDatetime(deviceSN);
            if (snapshotTime) {
                utils.log(`Previous snapshot time for device ${deviceSN}: ${snapshotTime}`, 'debug');

                // Snapshot is newer than picture property - use snapshot
                if (new Date(previousChecksum.datetime) < new Date(snapshotTime)) {
                    utils.log(`New snapshot available for device ${deviceSN}, loading from disk.`, 'debug');

                    isPictureRecent = false;
                }

                const snapshot = utils.loadSnapshotFromDisk(deviceSN);
                if (snapshot) {
                    utils.log(`Replacing picture data with snapshot for device ${deviceSN}`, 'debug');
                    // Return snapshot data in expected format
                    return {
                        "data": {
                            "type": "Buffer",
                            "data": Array.from(snapshot)
                        },
                        "type": {
                            "ext": "jpg",
                            "mime": "image/jpeg"
                        },
                        "eventData": {
                            "type": "Buffer",
                            "data": Array.from(properties.data)
                        },
                        "eventType": {
                            "ext": properties.type.ext,
                            "mime": properties.type.mime
                        },
                        "isSnapshot": true,
                        "isRecent": isPictureRecent ? "event" : "snapshot"
                    }
                }
            }
        }
    } catch (error) {
        utils.log(`❌ Error checking picture property for device ${deviceSN}: ${error.message}`, 'error');
    }

    return properties;
}

/**
 * Is Connected
 * Checks if Eufy client is logged in
 * @returns {boolean} True if connected, false otherwise
 */
function isConnected() {
    return !!eufyClient && loggedIn && eufyClient.loggedIn;
}

/**
 * Close Connection
 * Gracefully closes connection to Eufy Security system
 * @returns {Promise} Promise that resolves when connection is closed
 */
async function close() {
    if (eufyClient) {
        utils.log('Closing connection to Eufy...', 'info');
        stopActiveStream();
        currentStreamingSN = null;
        loggedIn = false;
        loginState = { status: 'idle' };
        stations.clear();
        devices.clear();
        const client = eufyClient;
        eufyClient = null;
        return await client.disconnect();
    } else {
        utils.log('Eufy client is not initialized.', 'warn');
        return Promise.resolve();
    }
}

/**
 * Module Exports
 * Exposes Eufy client management functions
 */
module.exports = {
    connect,
    isConnected,
    getLoginState,
    setCaptcha,
    setVerifyCode,
    startStreamForDevice,
    stopStreamForDevice,
    getEventThumbnail: (recordId) => events.getThumbnail(recordId),
    getEventCropPicture: (pictureId) => events.getCropPicture(pictureId),
    close
};
