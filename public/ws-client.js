// WebSocket server URL
// See https://bropat.github.io/eufy-security-ws/#/ or https://github.com/bropat/eufy-security-ws/
let eufywsUrl;
let eufyws;
let stationSn = null;
let lastPreset = null;
let pathToDeviceSnMap = [];
let pendingImageRequest = null;

// General WebSocket functions

/**
 * Toggles the WebSocket connection (connect/disconnect).
 */
function wsToggleConnection() {
    if (!eufyws || !eufyws.OPEN)
        wsConnect(eufywsUrl);
    else
        wsDisconnect();
}

/**
 * Establishes a new WebSocket connection and sets up event handlers.
 * @param {string} url - The WebSocket server URL.
 */
function wsConnect(url) {
    eufyws = new WebSocket(url);
    eufyws.onopen = wsConnected;
    eufyws.onmessage = wsMessage;
    eufyws.onclose = wsDisconnected;
    eufyws.onerror = wsError;
}

/**
 * Closes the WebSocket connection and resets the ws variable.
 */
function wsDisconnect() {
    if (eufyws) {
        eufyws.close();
        videoStopStream();
    }
    eufyws = null;
    stationSn = null;
}

/**
 * Sends data over the WebSocket connection if open.
 * @param {string} data - The data to send (usually JSON string).
 */
function wsSend(data) {
    if (eufyws && eufyws.readyState === WebSocket.OPEN) {
        eufyws.send(data);
    }
}

/**
 * Handler for WebSocket 'open' event. Updates status and resets display.
 */
function wsConnected() {
    uiUpdateStatus('Connected', 'orange');
    uiReset();
}

/**
 * Handler for WebSocket 'close' event. Updates status and resets display.
 */
function wsDisconnected() {
    uiUpdateStatus('Not connected', 'red');
    uiReset();
}

/**
 * Handler for WebSocket 'error' event. Updates status and logs error.
 * @param {Event} err - The error event.
 */
function wsError(err) {
    uiUpdateStatus('Connection error', 'red');
    uiDebugLog('Error: ' + (err && err.message ? err.message : err));
    uiReset();
}

/**
 * Handler for WebSocket 'message' event. Parses and dispatches messages.
 * @param {MessageEvent} event - The message event containing data from the server.
 */
function wsMessage(event) {
    try {
        debugConsoleLog('Message received:', event.data);
        const data = JSON.parse(event.data);

        switch (data.type) {
            case 'version':
                eufyParseVersionMessage(data);
                break;
            case 'result':
                eufyParseResultMessage(data);
                break;
            case 'event':
                eufyParseEventMessage(data);
                break;
            default:
                debugConsoleLog('Unknown message type:', data.type);
                uiDebugLog('Unknown message type:' + data.type);
                uiDebugLog(JSON.stringify(data, null, 2));
        }
    } catch (e) {
        console.error('Error processing message:', e);
        uiDebugLog('Internal Error while processing messsage:');
        uiDebugLog(event.data);
        uiDebugLog(e.toString());
    }
}

// Eufy WebSocket protocol functions

/**
 * Handles 'version' messages from the server, sets API schema version.
 * @param {Object} data - The version message data.
 */
function eufyParseVersionMessage(data) {
    uiUpdateEufyWSVersion(data.driverVersion, data.serverVersion, data.minSchemaVersion, data.maxSchemaVersion);

    // After receiving: set API schema version according to API spec
    if (typeof data.maxSchemaVersion === 'number')
        eufySetApiSchema(data.maxSchemaVersion);
}

/**
 * Handles 'result' messages from the server and updates UI or sends further requests.
 * @param {Object} message - The result message data.
 */
function eufyParseResultMessage(message) {
    switch (message.messageId) {
        case 'set_api_schema':
            if (message.success) {
                debugConsoleLog('API schema version set successfully.');
                eufyStartListening();
            } else {
                debugConsoleLog('Error setting API schema version:', message.error);
            }
            break;
        case 'start_listening':
            // Show info for start_listening
            if (message.success && message.result && message.result.state) {
                uiUpdateStatus('Listening started', 'darkseagreen');
                uiDebugLog('Listening started successfully.');

                // Show station SN (only one is assumed)
                const stations = message.result.state.stations;
                stationSn = Array.isArray(stations) && stations.length > 0 ? stations[0] : '';
                uiUpdateStationSn(stationSn);

                // Get station properties if SN exists
                if (stationSn)
                    eufyStationGetProperties(stationSn);

                // Fill devices dropdown
                uiMakeDeviceList(message.result.state.devices || []);
            } else {
                uiUpdateStatus('Listening error', 'red');
                uiDebugLog('Listening error: ' + (message.error || ''));
                uiUpdateStationSn(null);
                uiMakeDeviceList([]);
            }
            break;
        case 'device.get_properties':
            if (message.result && message.result.properties &&
                message.result.serialNumber === uiGetDeviceSn()) {
                const props = message.result.properties;
                uiUpdateDeviceInfoTable(props);
                uiShowPicture(props.picture);
                if (props.picture && props.picture.data)
                    message.result.properties.picture.data.data = '[Binary Data Hidden]';
            }

            uiDebugLog(`Properties for device ${message.result.serialNumber}:`);
            uiDebugLog(JSON.stringify(message.result, null, 2));

            break;
        case 'device.get_commands':
            if (message.result && message.result.serialNumber === uiGetDeviceSn()) {
                if (Array.isArray(message.result.commands)) {
                    uiShowVideoButton(message.result.commands.includes('start_livestream'));
                    uiShowPositionPresetControls(message.result.commands.includes('preset_position'));
                    uiShowPanTiltControls(message.result.commands.includes('pan_and_tilt'));
                }
            }
            break;
        case 'station.get_properties':
            if (message.result && message.result.properties)
                uiUpdateStationInfo(message.result.properties);

            uiDebugLog(`Properties for station ${message.result.serialNumber}:`);
            uiDebugLog(JSON.stringify(message.result, null, 2));
            break;
        case 'station.database_query_latest_info':
            break;
        case 'station.download_image':
            break;
        case 'device.preset_position':
            if (message.success) {
                uiChangePositionPresetError(null);
                uiDebugLog('Preset position command sent successfully.');
            } else {
                uiChangePositionPresetError(message.errorCode || 'Unknown error');
                uiDebugLog(`Error sending preset position command. Error: ${message.errorCode}`);
            }
            break;
        case 'device.pan_and_tilt':
            break;
        default:
            debugConsoleLog('Unknown result messageId:', message.messageId);
            break;
    }
}

/**
 * Handles 'event' messages from the server, such as device or image updates.
 * @param {Object} message - The event message data.
 */
function eufyParseEventMessage(message) {
    switch (message.event.event) {
        case 'database query latest': {
            // cache result for path to device SN mapping
            if (Array.isArray(message.event.data)) {
                pathToDeviceSnMap = message.event.data.map(d => ({
                    deviceSn: d.device_sn,
                    cropLocalPath: d.crop_local_path
                }));
            }

            if (pendingImageRequest) {
                console.log('Processing pending image request after database query.');
                eufyHandleImageDonloadedEvent(pendingImageRequest, true);
                pendingImageRequest = null;
            } else {
                console.log('No pending image request to process after database query.');
                const selectedDeviceSn = uiGetDeviceSn();
                if (selectedDeviceSn && Array.isArray(message.event.data)) {
                    const found = message.event.data.find(d => d.device_sn === selectedDeviceSn);
                    if (found && found.crop_local_path) {
                        if (stationSn)
                            eufyStationDownloadImage(stationSn, found.crop_local_path);
                    } else {
                        debugConsoleLog('No crop_local_path found for the selected device.');
                    }
                }
            }
            break;
        }
        case 'image downloaded':
            eufyHandleImageDonloadedEvent(message.event);
            break;
        case 'property changed':
            switch (message.event.source) {
                case 'device':
                    switch (message.event.name) {
                        case 'picture':
                            if (message.event.serialNumber === uiGetDeviceSn())
                                uiUpdateDevicePicture(message.event.value);
                            break;
                        case 'wifiRssi':
                            uiUpdateDeviceWifiRssi(message.event.serialNumber, message.event.value);
                            break;
                        case 'wifiSignalLevel':
                            uiUpdateDeviceWifiSignalLevel(message.event.serialNumber, message.event.value);
                            break;
                    }
                    break;
            }
            break;
        case 'livestream video data':
        case 'livestream audio data':
            // ignore - handled in video.js and transcoding ws
            break;
        case 'motion detected':
        case 'person detected':
        case 'stranger detected':
        case 'sound detected':
        case 'pet detected':
        case 'verhicle detected':
            if (message.event.state === true)
                uiSendNotification(`Eufy Event: ${message.event.event}`, `Device SN: ${message.event.serialNumber}`);
            break;
        case 'command result':
            break;
        default:
            debugConsoleLog('Unknown event type:', message.event.event);
            break;
    }
}

function eufyHandleImageDonloadedEvent(event, isPendingRequest = false) {
    // check cached path to device SN mapping, if not found, query database again - but avoid loop!
    const mapping = pathToDeviceSnMap.find(m => m.cropLocalPath === event.file);
    if (mapping) {
        pendingImageRequest = null;
        if (mapping.deviceSn === uiGetDeviceSn()) {
            uiUpdateDevicePicture(event.image);
        } else {
            debugConsoleLog('Downloaded image does not match the selected device.');
        }
    }
    else {
        if (isPendingRequest) {
            debugConsoleLog('Downloaded image does not match the selected device, even after querying latest info.');
            pendingImageRequest = null;
        } else {
            debugConsoleLog('Downloaded image does not match the selected device, querying latest info.');
            pendingImageRequest = event;
            eufyStationDatabaseQueryLatestInfo(stationSn);
        }
    }
}

/**
 * Sends a set_api_schema command to the server.
 * @param {number} version - The API schema version to set.
 */
function eufySetApiSchema(version) {
    wsSend(JSON.stringify({
        messageId: 'set_api_schema',
        command: 'set_api_schema',
        schemaVersion: version
    }));
}

/**
 * Sends a start_listening command to the server.
 */
function eufyStartListening() {
    wsSend(JSON.stringify({
        messageId: 'start_listening',
        command: 'start_listening'
    }));
}

/**
 * Requests properties for a station.
 * @param {string} stationSn - The serial number of the station.
 */
function eufyStationGetProperties(stationSn) {
    wsSend(JSON.stringify({
        messageId: 'station.get_properties',
        command: 'station.get_properties',
        serialNumber: stationSn
    }));
    uiDebugLog(`Requested properties for station ${stationSn}.`);
}

/**
 * Requests the latest info from the station database.
 * @param {string} stationSn - The serial number of the station.
 */
function eufyStationDatabaseQueryLatestInfo(stationSn) {
    wsSend(JSON.stringify({
        messageId: 'station.database_query_latest_info',
        command: 'station.database_query_latest_info',
        serialNumber: stationSn
    }));
}

/**
 * Requests to download an image from the station.
 * @param {string} stationSn - The serial number of the station.
 * @param {string} imagePath - The path to the image file.
 */
function eufyStationDownloadImage(stationSn, imagePath) {
    wsSend(JSON.stringify({
        messageId: 'station.download_image',
        command: 'station.download_image',
        serialNumber: stationSn,
        file: imagePath
    }));
}

/**
 * Requests properties for a device.
 * @param {string} deviceSn - The serial number of the device.
 */
function eufyDeviceGetProperties(deviceSn) {
    wsSend(JSON.stringify({
        messageId: 'device.get_properties',
        command: 'device.get_properties',
        serialNumber: deviceSn
    }));

    uiDebugLog(`Requested properties for device ${deviceSn}.`);
}

/**
 * Requests available commands for a device.
 * @param {string} deviceSn - The serial number of the device.
 */
function eufyDeviceGetCommands(deviceSn) {
    wsSend(JSON.stringify({
        messageId: 'device.get_commands',
        command: 'device.get_commands',
        serialNumber: deviceSn
    }));

    uiDebugLog(`Requested commands for device ${deviceSn}.`);
}

/**
 * Sends a preset position command to a device.
 * @param {string} deviceSn - The serial number of the device.
 * @param {number} presetNumber - The preset position number.
 */
function eufyPresetPosition(deviceSn, presetNumber) {
    lastPreset = presetNumber;
    wsSend(JSON.stringify({
        messageId: 'device.preset_position',
        command: 'device.preset_position',
        serialNumber: deviceSn,
        position: presetNumber
    }));
    uiDebugLog(`Sent preset position ${presetNumber} command to device ${deviceSn}.`);
}

// Example for future pan/tilt command implementation:
function eufyPanAndTilt(deviceSn, panDirection) {
    wsSend(JSON.stringify({
        messageId: 'device.pan_and_tilt',
        command: 'device.pan_and_tilt',
        serialNumber: deviceSn,
        direction: panDirection
    }));
    uiDebugLog(`Sent pan and tilt command to device ${deviceSn}: panDirection ${panDirection}.`);
}