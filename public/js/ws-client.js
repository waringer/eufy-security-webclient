/**
 * WebSocket Client for Eufy Security
 * 
 * Manages bidirectional WebSocket communication with Eufy Security WebSocket server.
 * Handles device discovery, property queries, command execution, and real-time events.
 * 
 * Protocol Documentation:
 * - https://bropat.github.io/eufy-security-ws/#/
 * - https://github.com/bropat/eufy-security-ws/
 * 
 * Dependencies: ui.js, main.js
 */

// WebSocket connection state
let eufywsUrl;                      // WebSocket server URL (set from main.js)
let eufyws;                         // Active WebSocket connection instance
let stationSn = null;               // Currently connected station serial number
let lastPreset = null;              // Last executed preset position number
let pathToDeviceSnMap = [];         // Cache for image path to device SN mapping
let pendingImageRequest = null;     // Queued image request awaiting database query
let userDisconnectedWs = false;     // Flag to prevent auto-reconnect after manual disconnect
let isAutoReconnecting = false;     // Flag indicating if auto-reconnect is in progress

// ============================================================================
// General WebSocket Functions
// ============================================================================

/**
 * Toggle WebSocket Connection
 * Connects if disconnected, disconnects if connected
 */
function wsToggleConnection() {
    if (!eufyws) {
        debugConsoleLog('WebSocket is not connected, attempting to connect...');
        wsConnect(eufywsUrl);
        uiUpdateConnectButtonState();
    } else {
        if (isAutoReconnecting) {
            // Cancel auto-reconnect attempt
            userDisconnectedWs = true;
            isAutoReconnecting = false;
            debugConsoleLog('Auto-reconnect attempt cancelled by user.');
            uiUpdateConnectButtonState();
        } else {
            switch (eufyws.readyState) {
                case WebSocket.CONNECTING:
                    debugConsoleLog('WebSocket is connecting, please wait...');
                    uiUpdateConnectButtonState();
                    break;
                case WebSocket.OPEN:
                    debugConsoleLog('Disconnecting WebSocket as per user request...');
                    wsDisconnect();
                    uiUpdateConnectButtonState();
                    break;
                case WebSocket.CLOSING:
                    debugConsoleLog('WebSocket is closing, please wait...');
                    uiUpdateConnectButtonState();
                    break;
                case WebSocket.CLOSED:
                    debugConsoleLog('WebSocket is closed, reconnecting as per user request...');
                    wsConnect(eufywsUrl);
                    uiUpdateConnectButtonState();
                    break;
                default:
                    break;
            }
        }
    }
}

/**
 * Establish WebSocket Connection
 * Creates new WebSocket instance and attaches event handlers
 * @param {string} url - WebSocket server URL
 * @param {boolean} isUserInitiated - True if user triggered, false for auto-reconnect
 */
function wsConnect(url, isUserInitiated = true) {
    eufyws = new WebSocket(url);

    // Attach WebSocket lifecycle handlers
    eufyws.onopen = wsConnected;
    eufyws.onmessage = wsMessage;
    eufyws.onclose = wsDisconnected;
    eufyws.onerror = wsError;

    // Track manual disconnects to prevent unwanted auto-reconnect
    if (isUserInitiated) userDisconnectedWs = false;
    uiUpdateStatus('Connecting...', 'orange');
}

/**
 * Disconnect WebSocket
 * Closes connection and stops any active video streams
 */
function wsDisconnect() {
    if (eufyws) {
        userDisconnectedWs = true;  // Prevent auto-reconnect
        isAutoReconnecting = false;
        eufyws.close();
        videoStopStream();          // Stop livestream if active
    }
}

/**
 * Send WebSocket Message
 * Sends data if connection is open, otherwise silently fails
 * @param {string} data - JSON string to send
 */
function wsSend(data) {
    if (eufyws && eufyws.readyState === WebSocket.OPEN) {
        eufyws.send(data);
    }
}

/**
 * WebSocket Connected Handler
 * Called when connection is successfully established
 */
function wsConnected() {
    isAutoReconnecting = false;
    uiUpdateStatus('Connected', 'orange');
    uiReset();
}

/**
 * WebSocket Disconnected Handler
 * Implements auto-reconnect logic for unintended disconnects
 */
function wsDisconnected() {
    uiUpdateStatus('Not connected', 'red');
    eufyws = null;
    stationSn = null;
    isAutoReconnecting = !userDisconnectedWs;
    uiReset();

    // Auto-reconnect after 5 seconds (unless user manually disconnected)
    if (!userDisconnectedWs) {
        // Show countdown for reconnecting
        let countdown = 5;
        uiUpdateStatus(`Reconnecting in ${countdown} seconds...`, 'orange');
        const interval = setInterval(() => {
            countdown--;
            if (countdown > 0) {
                uiUpdateStatus(`Reconnecting in ${countdown} seconds...`, 'orange');
            } else {
                clearInterval(interval);
            }
        }, 1000);

        setTimeout(() => {
            if (!eufyws) {
                debugConsoleLog('Attempting to reconnect WebSocket...');
                wsConnect(eufywsUrl, false);  // Auto-reconnect flag
            } else {
                debugConsoleLog('WebSocket already connected, skipping auto-reconnect.');
            }
        }, 5000);
    }
}

/**
 * WebSocket Error Handler
 * Handles connection errors and updates UI
 * @param {Event} err - Error event from WebSocket
 */
function wsError(err) {
    uiUpdateStatus('Connection error', 'red');
    uiDebugLog('WebSocket error: ' + (err && err.message ? err.message : JSON.stringify(err)));
    debugConsoleLog('WebSocket error:', err);
    uiUpdateStatus('Connection error', 'red');
    uiReset();
}

/**
 * WebSocket Message Handler
 * Parses incoming messages and dispatches to appropriate handlers
 * @param {MessageEvent} event - Message event with JSON data
 */
function wsMessage(event) {
    try {
        debugConsoleLog('Message received:', event.data);
        const data = JSON.parse(event.data);

        // Route message by type to specialized handlers
        switch (data.type) {
            case 'version':
                eufyParseVersionMessage(data);  // Server version info
                break;
            case 'result':
                eufyParseResultMessage(data);   // Command responses
                break;
            case 'event':
                eufyParseEventMessage(data);    // Real-time events
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

// ============================================================================
// Eufy Protocol Message Handlers
// ============================================================================

/**
 * Parse Version Message
 * Handles initial version handshake and starts listening
 * @param {Object} data - Version message with client/server versions
 */
function eufyParseVersionMessage(data) {
    uiUpdateEufyWSVersion(data.clientVersion, data.serverVersion, 0, 0);
    eufyStartListening();  // Begin receiving device events
}

/**
 * Parse Result Message
 * Handles responses to client commands (get_properties, preset_position, etc.)
 * @param {Object} message - Result message with messageId and success/error fields
 */
function eufyParseResultMessage(message) {
    switch (message.messageId) {
        case 'start_listening':  // Initial connection established
            if (message.success && message.result && message.result.state) {
                uiUpdateStatus('Listening started', 'darkseagreen');
                uiDebugLog('Listening started successfully.');

                // Extract station SN (assumes single station setup)
                const stations = message.result.state.stations;
                stationSn = Array.isArray(stations) && stations.length > 0 ? stations[0] : '';
                uiUpdateStationSn(stationSn);

                // Load station properties automatically
                if (stationSn)
                    eufyStationGetProperties(stationSn);

                // Populate device dropdown with discovered devices
                uiMakeDeviceList(message.result.state.devices || []);
            } else {
                // Connection failed
                uiUpdateStatus('Listening error', 'red');
                uiDebugLog('Listening error: ' + (message.error || ''));
                uiUpdateStationSn(null);
                uiMakeDeviceList([]);
            }
            break;
        case 'device.get_properties':  // Device property response
            if (message.result && message.result.properties &&
                message.result.serialNumber === uiGetDeviceSn()) {
                const props = message.result.properties;

                // Update UI with device properties
                uiUpdateDeviceInfoTable(props);
                uiShowPicture(props.picture);

                // Hide binary data from debug log to prevent flooding
                if (props.picture && props.picture.data)
                    message.result.properties.picture.data.data = '[Binary Data Hidden]';
            }

            uiDebugLog(`Properties for device ${message.result.serialNumber}:`);
            uiDebugLog(JSON.stringify(message.result, null, 2));
            break;

        case 'device.get_commands':  // Available device commands  // Available device commands
            if (message.result && message.result.serialNumber === uiGetDeviceSn()) {
                if (Array.isArray(message.result.commands)) {
                    // Show/hide UI controls based on device capabilities
                    uiShowVideoButton(message.result.commands.includes('deviceStartLivestream'));
                    uiShowPositionPresetControls(message.result.commands.includes('devicePresetPosition'));
                    uiShowPanTiltControls(message.result.commands.includes('devicePanAndTilt'));
                }
            }
            break;

        case 'station.get_properties':  // Station property response
            if (message.result && message.result.properties)
                uiUpdateStationInfo(message.result.properties);

            uiDebugLog(`Properties for station ${message.result.serialNumber}:`);
            uiDebugLog(JSON.stringify(message.result, null, 2));
            break;

        case 'station.database_query_latest_info':  // Database query result
            // Handled via event message 'database query latest'
            break;

        case 'station.download_image':  // Image download result
            // Handled via event message 'image downloaded'
            break;

        case 'device.preset_position':  // Preset position command result  // Preset position command result
            if (message.success) {
                uiChangePositionPresetError(null);
                uiDebugLog('Preset position command sent successfully.');
            } else {
                uiChangePositionPresetError(message.errorCode || 'Unknown error');
                uiDebugLog(`Error sending preset position command. Error: ${message.errorCode}`);
            }
            break;

        case 'device.pan_and_tilt':  // Pan/tilt command result
            // Future implementation for manual pan/tilt control
            break;

        default:
            debugConsoleLog('Unknown result messageId:', message.messageId);
            break;
    }
}

/**
 * Parse Event Message
 * Handles real-time events from devices/stations (motion detection, images, etc.)
 * @param {Object} message - Event message with event type and data
 */
function eufyParseEventMessage(message) {
    switch (message.event.event) {
        case 'database query latest': {  // Latest image metadata from station database
            // Cache path-to-deviceSn mapping for image download matching
            if (Array.isArray(message.event.data)) {
                pathToDeviceSnMap = message.event.data.map(d => ({
                    deviceSn: d.device_sn,
                    cropLocalPath: d.crop_local_path
                }));
            }

            // Process pending image request if waiting for database query
            if (pendingImageRequest) {
                console.log('Processing pending image request after database query.');
                eufyHandleImageDonloadedEvent(pendingImageRequest, true);
                pendingImageRequest = null;
            } else {
                // Auto-download latest image for currently selected device
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
        case 'image downloaded':  // Image binary data received
            eufyHandleImageDonloadedEvent(message.event);
            break;

        case 'property changed':  // Device/station property update
            switch (message.event.source) {
                case 'device':
                    switch (message.event.name) {
                        case 'picture':  // Device thumbnail updated
                            if (message.event.serialNumber === uiGetDeviceSn())
                                uiUpdateDevicePicture(message.event.value);
                            break;
                        case 'wifiRssi':  // WiFi signal strength (dBm)
                            uiUpdateDeviceWifiRssi(message.event.serialNumber, message.event.value);
                            break;
                        case 'wifiSignalLevel':  // WiFi signal level (0-4)
                            uiUpdateDeviceWifiSignalLevel(message.event.serialNumber, message.event.value);
                            break;
                    }
                    break;
            }
            break;
        case 'livestream video data':  // Raw H.264/H.265 video frames
        case 'livestream audio data':  // Raw audio frames
            // Handled by video.js and transcode server WebSocket
            break;

        case 'motion detected':     // Motion sensor triggered
        case 'person detected':     // Person AI detection
        case 'stranger detected':   // Unknown person detected
        case 'sound detected':      // Audio detection
        case 'pet detected':        // Pet AI detection
        case 'verhicle detected':   // Vehicle AI detection (typo in original API)
            // Show browser notification on detection event
            if (message.event.state === true)
                uiSendNotification(`Eufy Event: ${message.event.event}`, `Device SN: ${message.event.serialNumber}`);
            break;

        case 'command result':  // Generic command execution result
            // Additional processing can be added here
            break;

        default:
            debugConsoleLog('Unknown event type:', message.event.event);
            break;
    }
}

/**
 * Handle Image Downloaded Event
 * Matches downloaded image to device and updates UI
 * Uses cached path-to-device mapping to resolve device SN
 * @param {Object} event - Image downloaded event with file path and binary data
 * @param {boolean} isPendingRequest - True if resolving queued request after DB query
 */
function eufyHandleImageDonloadedEvent(event, isPendingRequest = false) {
    // Match image file path to device using cached mapping
    const mapping = pathToDeviceSnMap.find(m => m.cropLocalPath === event.file);
    if (mapping) {
        pendingImageRequest = null;

        // Update UI only if image belongs to currently selected device
        if (mapping.deviceSn === uiGetDeviceSn()) {
            uiUpdateDevicePicture(event.image);
        } else {
            debugConsoleLog('Downloaded image does not match the selected device.');
        }
    }
    else {
        // Mapping not found - query database to refresh cache
        if (isPendingRequest) {
            // Already tried querying, give up
            debugConsoleLog('Downloaded image does not match the selected device, even after querying latest info.');
            pendingImageRequest = null;
        } else {
            // Queue request and refresh database cache
            debugConsoleLog('Downloaded image does not match the selected device, querying latest info.');
            pendingImageRequest = event;
            eufyStationDatabaseQueryLatestInfo(stationSn);
        }
    }
}

// ============================================================================
// Eufy Command Functions
// ============================================================================

/**
 * Start Listening
 * Begins receiving events and device/station state from server
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
 * Get Device Properties
 * Requests all properties for a device (name, model, battery, WiFi, capabilities, etc.)
 * @param {string} deviceSn - Device serial number
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
 * Get Device Commands
 * Requests list of available commands for device (livestream, preset, pan/tilt, etc.)
 * @param {string} deviceSn - Device serial number
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
 * Execute Preset Position
 * Moves PTZ camera to saved preset position
 * @param {string} deviceSn - Device serial number
 * @param {number} presetNumber - Preset position (1-8)
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

/**
 * Pan and Tilt Control
 * Manual PTZ camera movement control
 * @param {string} deviceSn - Device serial number
 * @param {number} panDirection - Direction code (implementation specific)
 */
function eufyPanAndTilt(deviceSn, panDirection) {
    wsSend(JSON.stringify({
        messageId: 'device.pan_and_tilt',
        command: 'device.pan_and_tilt',
        serialNumber: deviceSn,
        direction: panDirection
    }));
    uiDebugLog(`Sent pan and tilt command to device ${deviceSn}: panDirection ${panDirection}.`);
}