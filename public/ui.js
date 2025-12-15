/**
 * UI Controller Module
 * 
 * Manages all user interface interactions, DOM manipulations, and event handlers.
 * Coordinates between WebSocket client, video player, and REST API.
 * 
 * Features:
 * - Device selection and property display
 * - Video streaming controls
 * - PTZ camera controls (presets, pan/tilt)
 * - Configuration modal
 * - Browser notifications
 * - Keyboard shortcuts
 * - Status indicators and debug logging
 * 
 * Dependencies: ws-client.js, video.js, main.js
 */

// Global UI state
let presetButtons = null;   // Number of preset position buttons to display
let inConfig = false;       // True when config modal is open (disables keyboard shortcuts)

// ============================================================================
// Debug and Initialization
// ============================================================================

/**
 * Debug Log to UI
 * Appends message to debug info panel if debug mode is enabled
 * @param {string} message - Message to log
 */
function uiDebugLog(message) {
    if (debugMode) document.getElementById('info').textContent += message + '\n';
}

/**
 * Initialize UI
 * Sets up all event listeners and initializes UI components
 * Called once on DOMContentLoaded from main.js
 * 
 * Initializes:
 * - Info panel visibility (based on debug mode)
 * - Keyboard shortcuts (arrow keys, numpad)
 * - Browser notification support check
 * - Connect/config/notification button handlers
 * - Status bar collapse/expand toggle
 * - Device dropdown change handler
 * - Update device button handler
 * - Video start/stop button handler
 */
function uiInit() {
    // Configure debug info panel visibility
    uiInitInfoPanel(debugMode);
    uiInitKeyboardShortcuts();
    uiCheckNotificationsSupport();

    // Connect button: toggle WebSocket connection
    document.getElementById('connect-btn').onclick = function () {
        wsToggleConnection();
    };

    // Config button: open configuration modal
    document.getElementById('config-btn').onclick = function () {
        restGetConfig(uiOpenConfigModal);
    }

    // Notification button: request browser notification permission
    document.getElementById('notification-btn').onclick = function () {
        uiInitNotifiactions();
    }

    // Status bar collapse/expand toggle
    document.getElementById('status-toggle-btn').addEventListener('click', function () {
        document.getElementById('status').classList.toggle('collapsed');
    });

    // Device dropdown: load device properties on selection change
    const select = document.getElementById('device-select');
    if (select) {
        select.addEventListener('change', function () {
            const deviceSn = select.value;
            if (deviceSn) {
                // Hide buttons until properties are loaded
                document.getElementById('device-update-btn').style.display = "none";
                document.getElementById('device-video-btn').style.display = "none";
                uiChangePositionPresetError(null);

                // Fetch device properties and available commands
                eufyDeviceGetProperties(deviceSn);
                eufyDeviceGetCommands(deviceSn);
            }
        });
    }

    // Update device button: refresh device properties
    document.getElementById('device-update-btn').addEventListener('click', function () {
        document.getElementById('device-select').dispatchEvent(new Event('change'));
    });

    // Video button: start/stop livestream
    document.getElementById('device-video-btn').addEventListener('click', function () {
        const videoBtn = document.getElementById('device-video-btn');

        if (videoBtn.className === 'connect') {
            // Start video stream
            uiUpdateDeviceVideo();
            videoStartStream(transcodeServerUrl, document.getElementById('device-select').value);
        } else {
            // Stop video stream
            videoStopStream();
            document.getElementById('device-select').dispatchEvent(new Event('change'));
        }
    });
}

/**
 * Initialize Info Panel
 * Shows or hides debug info panel based on debug mode
 * @param {boolean} isEnabled - True to show panel, false to hide
 */
function uiInitInfoPanel(isEnabled) {
    const infoPanel = document.getElementById('info');
    const infoDetails = infoPanel.closest('details');

    if (!isEnabled) {
        infoDetails.style.display = 'none';
        infoPanel.style.display = 'none';
    } else {
        infoDetails.style.display = '';
        infoPanel.style.display = '';
    }
}

/**
 * Initialize Keyboard Shortcuts
 * Sets up keyboard event listeners for PTZ camera control
 * 
 * Shortcuts:
 * - Arrow Keys: Pan/Tilt camera direction
 * - Home: Return to home position
 * - Numpad 1-6: Preset positions
 * 
 * Disabled when config modal is open
 */
function uiInitKeyboardShortcuts() {
    document.addEventListener('keydown', function (event) {
        // Disable shortcuts when config modal is open
        if (inConfig) return;

        switch (event.code) {
            case 'ArrowUp':     // Pan up
                eufyPanAndTilt(uiGetDeviceSn(), 3);
                event.preventDefault();
                break;
            case 'ArrowDown':   // Pan down
                eufyPanAndTilt(uiGetDeviceSn(), 4);
                event.preventDefault();
                break;
            case 'ArrowLeft':   // Pan left
                eufyPanAndTilt(uiGetDeviceSn(), 1);
                event.preventDefault();
                break;
            case 'ArrowRight':  // Pan right
                eufyPanAndTilt(uiGetDeviceSn(), 2);
                event.preventDefault();
                break;
            case 'Home':        // Start Guard/Patrol Mode
                eufyPanAndTilt(uiGetDeviceSn(), 0);
                event.preventDefault();
                break;
            case 'Numpad1':     // Preset position 1
                eufyPresetPosition(uiGetDeviceSn(), 0);
                event.preventDefault();
                break;
            case 'Numpad2':     // Preset position 2
                eufyPresetPosition(uiGetDeviceSn(), 1);
                event.preventDefault();
                break;
            case 'Numpad3':     // Preset position 3
                eufyPresetPosition(uiGetDeviceSn(), 2);
                event.preventDefault();
                break;
            case 'Numpad4':     // Preset position 4
                eufyPresetPosition(uiGetDeviceSn(), 3);
                event.preventDefault();
                break;
            case 'Numpad5':     // Preset position 5
                eufyPresetPosition(uiGetDeviceSn(), 4);
                event.preventDefault();
                break;
            case 'Numpad6':     // Preset position 6
                eufyPresetPosition(uiGetDeviceSn(), 5);
                event.preventDefault();
                break;
        }
    });
}

/**
 * Check Notifications Support
 * Checks browser notification support and permission status
 * Hides notification button if not supported or already granted/denied
 */
function uiCheckNotificationsSupport() {
    const notificationBtn = document.getElementById('notification-btn');

    // Check if browser supports notifications API
    if (!("Notification" in window)) {
        notificationBtn.style.display = 'none';
    }

    // Hide button based on current permission status
    switch (Notification.permission) {
        case "granted":   // User already granted permission
            notificationBtn.style.display = 'none';
            break;
        case "denied":    // User denied permission
            notificationBtn.style.display = 'none';
            break;
        case "default":   // Permission not yet requested
            notificationBtn.style.display = 'block';
            break;
    }
}

/**
 * Initialize Notifications
 * Requests browser notification permission from user
 * Called when user clicks notification button
 */
function uiInitNotifiactions() {
    // Check if browser supports notifications
    if ("Notification" in window) {
        // Request permission from user
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                debugConsoleLog("Notifications permission granted");
            } else if (permission === "denied") {
                debugConsoleLog("Notifications permission denied");
            }

            // Update button visibility
            uiCheckNotificationsSupport();
        });
    }
}

// ============================================================================
// UI State Management
// ============================================================================

/**
 * Reset UI
 * Resets all UI elements to default/empty state
 * Called on connection lost or disconnect
 */
function uiReset() {
    document.getElementById('ws-version').textContent = '';
    document.getElementById('station-sn').textContent = '';
    document.getElementById('station-version').textContent = '';
    document.getElementById('device-info').replaceChildren();
    document.getElementById('device-picture').replaceChildren();
    document.getElementById('device-select-container').style.display = "none"
    document.getElementById('device-update-btn').style.display = "none"
    document.getElementById('device-video-btn').style.display = "none"
    uiUpdateConnectButtonState();
    uiShowPositionPresetControls(false);
    uiChangePositionPresetError(null);
    uiShowConfigButton(!!transcodeConfig);
}

/**
 * Send Browser Notification
 * Shows browser notification if permission is granted
 * @param {string} title - Notification title
 * @param {string} body - Notification body text
 */
function uiSendNotification(title, body) {
    if (Notification.permission === "granted") {
        new Notification(title, {
            body: body,
            requireInteraction: false,
            icon: 'favicon.ico'
        });
        debugConsoleLog("Notification sent:", title, body);
    }
}

// ============================================================================
// Status and Connection Info Updates
// ============================================================================

/**
 * Update Eufy WebSocket Version
 * Displays client and server version info in status bar
 * @param {string} clientVersion - eufy-security-client library version
 * @param {string} serverVersion - eufy-security-ws server version
 */
function uiUpdateEufyWSVersion(clientVersion, serverVersion) {
    document.getElementById('ws-version').textContent = `Eufy-Client: ${clientVersion}, Server: ${serverVersion}`;
};

/**
 * Update Station Serial Number
 * Displays station SN in status bar
 * @param {string} stationSn - Station serial number or null to clear
 */
function uiUpdateStationSn(stationSn) {
    document.getElementById('station-sn').textContent = stationSn ? `Station SN: ${stationSn}` : '';
}

/**
 * Update Station Info
 * Displays detailed station information in status bar
 * Shows: Name, Model, HW/SW versions, MAC, IP, HDD free space
 * @param {Object} props - Station properties object
 */
function uiUpdateStationInfo(props) {
    // Calculate HDD free space percentage
    let hddFreePercent = '';
    if (props.storageInfoHdd && props.storageInfoHdd.disk_size && props.storageInfoHdd.disk_used) {
        const free = props.storageInfoHdd.disk_size - props.storageInfoHdd.disk_used;
        hddFreePercent = Math.round((free / props.storageInfoHdd.disk_size) * 100);
    }

    // Build status line with station details
    const statusLine2 =
        `Name: ${props.name || ''} | Model: ${props.model || ''} | HW: ${props.hardwareVersion || ''} | SW: ${props.softwareVersion || ''} | ` +
        `MAC: ${props.macAddress || ''} | IP: ${props.lanIpAddress || ''}` +
        (hddFreePercent !== '' ? ` | HDD free: ${hddFreePercent}%` : '');

    document.getElementById('station-version').textContent = statusLine2;
}

/**
 * Update Connect Button State
 * Changes button text and style based on WebSocket connection status
 */
function uiUpdateConnectButtonState() {
    const connectBtn = document.getElementById('connect-btn');
    const connected = eufyws && eufyws.readyState === WebSocket.OPEN;

    if (connected) {
        connectBtn.textContent = 'Disconnect';
        connectBtn.className = 'disconnect';
    } else {
        if (isAutoReconnecting) {
            connectBtn.textContent = 'Reconnecting...';
            connectBtn.className = 'reconnect';
        } else {
            if (eufyws && eufyws.readyState === WebSocket.CONNECTING) {
                connectBtn.textContent = 'Connecting...';
                connectBtn.className = 'connecting';
            } else {
                connectBtn.textContent = 'Connect';
                connectBtn.className = 'connect';
            }
        }
    }
};

/**
 * Show Config Button
 * Shows or hides configuration button based on config availability
 * @param {boolean} show - True to show button, false to hide
 */
function uiShowConfigButton(show) {
    document.getElementById('config-btn').style.display = show ? 'block' : 'none';
}

/**
 * Update Connection Status
 * Updates status text and color in UI
 * @param {string} text - Status message to display
 * @param {string} color - CSS color for status text (red|orange|darkseagreen|black)
 */
function uiUpdateStatus(text, color = 'black') {
    const statusEl = document.getElementById('connection-status');

    statusEl.textContent = text;
    statusEl.style.color = color;
}

// ============================================================================
// Device Info Display
// ============================================================================

/**
 * Update Device Info Table
 * Replaces device info table with new properties
 * @param {Object} props - Device properties object
 */
/**
 * Update Device Info Table
 * Replaces device info table with new properties
 * @param {Object} props - Device properties object
 */
function uiUpdateDeviceInfoTable(props) {
    document.getElementById('device-info').innerHTML = uiMakeDeviceInfoTable(props);
}

/**
 * Make Device Info Table
 * Generates HTML table from device properties
 * 
 * Features:
 * - XSS protection via HTML escaping
 * - Boolean values as ✓/✗ icons
 * - Conditional rows (only show if property exists)
 * - Formatted sensitivity values (x/5 scale)
 * - Live-updating WiFi RSSI and signal level
 * 
 * Property categories:
 * - Basic info (name, model, SN, versions)
 * - WiFi status (RSSI, signal level)
 * - Device state (enabled, snooze)
 * - Video/audio settings (quality, nightvision, watermark)
 * - Motion detection (sensitivity, types, range)
 * - Detection events (person, pet, vehicle, sound)
 * - Light settings (brightness, modes, timers)
 * - Notifications (types, intervals)
 * - Recording settings (continuous, RTSP)
 * - Statistics (working days, events)
 * 
 * @param {Object} props - Device properties object
 * @returns {string} HTML table string
 */
function uiMakeDeviceInfoTable(props) {
    // Helper to escape HTML special characters to prevent XSS
    function escapeHtml(str) {
        if (str === undefined || str === null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Helper function to format boolean values as icons
    const formatBool = (val) => {
        if (val === true) return '<span class="true">✓</span>';
        if (val === false) return '<span class="false">✗</span>';
        return '-';
    };

    // Helper function to format detection sensitivity (1-5 scale typically)
    const formatSensitivity = (val) => {
        if (val === undefined || val === null) return '-';
        return `${escapeHtml(val)}/5`;
    };

    // Helper function to add a row only if property exists
    const addRow = (label, value, unit = '') => {
        if (value !== undefined && value !== null) {
            let displayValue;
            if (typeof value === 'boolean') {
                displayValue = formatBool(value);
            } else {
                displayValue = escapeHtml(value);
            }
            return `<tr><td class="label">${escapeHtml(label)}:</td><td class="value">${displayValue}${escapeHtml(unit)}</td></tr>`;
        }
        return '';
    };

    let html = `<table class="device-info-table"><tbody>`;

    // Basic device info (always shown)
    html += addRow('Name', props.name);
    html += addRow('Model', props.model);
    html += addRow('Serial Number', props.serialNumber);
    html += addRow('HW Version', props.hardwareVersion);
    html += addRow('SW Version', props.softwareVersion);
    html += addRow('Type', props.type);

    // WiFi info (if available)
    if (props.wifiRssi !== undefined) {
        html += `<tr><td class="label">WiFi RSSI:</td><td class="value"><span id='wifiRssi'>${escapeHtml(props.wifiRssi)}</span> dBm</td></tr>`;
    }
    if (props.wifiSignalLevel !== undefined) {
        html += `<tr><td class="label">WiFi Signal Level:</td><td class="value"><span id='wifiSignalLevel'>${escapeHtml(props.wifiSignalLevel)}</span></td></tr>`;
    }

    // Device state
    html += addRow('Enabled', props.enabled);
    html += addRow('Snooze', props.snooze);
    if (props.snooze && props.snoozeTime) {
        html += addRow('Snooze Time', props.snoozeTime, ' min');
    }

    // Video/Audio settings
    html += addRow('Auto Nightvision', props.autoNightvision);
    html += addRow('Nightvision', props.nightvision);
    html += addRow('Status LED', props.statusLed);
    html += addRow('Image Mirrored', props.imageMirrored);
    html += addRow('Watermark', props.watermark);

    if (props.videoStreamingQuality !== undefined) {
        html += addRow('Video Streaming Quality', props.videoStreamingQuality);
    }
    if (props.videoRecordingQuality !== undefined) {
        html += addRow('Video Recording Quality', props.videoRecordingQuality);
    }

    // Audio settings
    html += addRow('Microphone', props.microphone);
    html += addRow('Speaker', props.speaker);
    if (props.speakerVolume !== undefined) {
        html += addRow('Speaker Volume', props.speakerVolume, '%');
    }
    html += addRow('Audio Recording', props.audioRecording);

    // Motion detection
    html += addRow('Motion Detection', props.motionDetection);
    if (props.motionDetection) {
        html += addRow('Motion Sensitivity', formatSensitivity(props.motionDetectionSensitivity));
        html += addRow('Motion Detected', props.motionDetected);
        html += addRow('Motion Tracking', props.motionTracking);
        html += addRow('Motion Auto Cruise', props.motionAutoCruise);
        html += addRow('Motion Out of View', props.motionOutOfViewDetection);
        html += addRow('Motion Test Mode', props.motionDetectionTestMode);

        // Motion detection types
        html += addRow('Detect Human', props.motionDetectionTypeHuman);
        html += addRow('Human Recognition', props.motionDetectionTypeHumanRecognition);
        html += addRow('Detect Pet', props.motionDetectionTypePet);
        html += addRow('Detect Vehicle', props.motionDetectionTypeVehicle);
        html += addRow('Detect Other Motion', props.motionDetectionTypeAllOtherMotions);

        // Motion detection range
        if (props.motionDetectionRange !== undefined) {
            html += addRow('Motion Range', props.motionDetectionRange);
        }
        if (props.motionDetectionRangeStandardSensitivity !== undefined) {
            html += addRow('Range Standard Sens.', props.motionDetectionRangeStandardSensitivity);
        }
        if (props.motionDetectionRangeAdvancedLeftSensitivity !== undefined) {
            html += addRow('Range Advanced Left', props.motionDetectionRangeAdvancedLeftSensitivity);
        }
        if (props.motionDetectionRangeAdvancedRightSensitivity !== undefined) {
            html += addRow('Range Advanced Right', props.motionDetectionRangeAdvancedRightSensitivity);
        }
    }

    // Detection events
    html += addRow('Person Detected', props.personDetected);
    if (props.personName) {
        html += addRow('Person Name', props.personName);
    }
    html += addRow('Identity Person', props.identityPersonDetected);
    html += addRow('Stranger Detected', props.strangerPersonDetected);
    html += addRow('Pet Detected', props.petDetected);
    html += addRow('Pet Detection', props.petDetection);
    html += addRow('Vehicle Detected', props.vehicleDetected);
    html += addRow('Dog Detected', props.dogDetected);
    html += addRow('Dog Lick Detected', props.dogLickDetected);
    html += addRow('Dog Poop Detected', props.dogPoopDetected);

    // Sound detection
    html += addRow('Sound Detection', props.soundDetection);
    if (props.soundDetection) {
        html += addRow('Sound Type', props.soundDetectionType);
        html += addRow('Sound Sensitivity', formatSensitivity(props.soundDetectionSensitivity));
    }
    html += addRow('Sound Detected', props.soundDetected);
    html += addRow('Crying Detected', props.cryingDetected);

    // Light settings
    html += addRow('Light', props.light);
    if (props.lightSettingsEnable !== undefined) {
        html += addRow('Light Settings Enable', props.lightSettingsEnable);
        html += addRow('Light Brightness Manual', props.lightSettingsBrightnessManual, '%');
        html += addRow('Light Brightness Motion', props.lightSettingsBrightnessMotion, '%');
        html += addRow('Light Brightness Schedule', props.lightSettingsBrightnessSchedule, '%');
        html += addRow('Light Motion Triggered', props.lightSettingsMotionTriggered);
        html += addRow('Light Activation Mode', props.lightSettingsMotionActivationMode);
        html += addRow('Light Motion Timer', props.lightSettingsMotionTriggeredTimer, 's');
    }

    // Notifications
    html += addRow('Notification Type', props.notificationType);
    html += addRow('Notification Interval', props.notificationIntervalTime, ' min');
    html += addRow('Notify Person', props.notificationPerson);
    html += addRow('Notify Pet', props.notificationPet);
    html += addRow('Notify Other Motion', props.notificationAllOtherMotion);
    html += addRow('Notify Vehicle', props.notificationVehicle);

    // Recording settings
    html += addRow('Continuous Recording', props.continuousRecording);
    if (props.continuousRecording) {
        html += addRow('Continuous Rec. Type', props.continuousRecordingType);
    }
    html += addRow('Video Type Store to NAS', props.videoTypeStoreToNAS);

    // RTSP settings
    html += addRow('RTSP Stream', props.rtspStream);
    if (props.rtspStream && props.rtspStreamUrl) {
        html += addRow('RTSP URL', props.rtspStreamUrl);
    }

    // Other settings
    html += addRow('Rotation Speed', props.rotationSpeed);
    html += addRow('Auto Calibration', props.autoCalibration);
    if (props.dualCamWatchViewMode !== undefined) {
        html += addRow('Dual Cam View Mode', props.dualCamWatchViewMode);
    }

    // Statistics
    if (props.detectionStatisticsWorkingDays !== undefined) {
        html += addRow('Working Days', props.detectionStatisticsWorkingDays);
        html += addRow('Detected Events', props.detectionStatisticsDetectedEvents);
        html += addRow('Recorded Events', props.detectionStatisticsRecordedEvents);
    }

    html += `</tbody></table>`;
    return html;
}

// ============================================================================
// Device Selection and Control
// ============================================================================

/**
 * Make Device List
 * Populates device dropdown and auto-selects first device
 * @param {string[]} devices - Array of device serial numbers
 */
function uiMakeDeviceList(devices) {
    const selectContainer = document.getElementById('device-select-container');
    const select = document.getElementById('device-select');

    // Clear and rebuild dropdown options
    select.replaceChildren();
    devices.forEach(dev => {
        const opt = document.createElement('option');
        opt.value = dev;
        opt.textContent = dev;
        select.appendChild(opt);
    });

    if (devices.length > 0) {
        selectContainer.style.display = 'block ruby';

        // Auto-select and load first device
        select.selectedIndex = 0;
        select.dispatchEvent(new Event('change'));
    } else {
        selectContainer.style.display = 'none';
    }
}

/**
 * Lock Device List
 * Disables device dropdown during video streaming
 * @param {boolean} lock - True to disable, false to enable
 */
function uiLockDeviceList(lock) {
    const select = document.getElementById('device-select');
    select.disabled = lock;
}

/**
 * Update Video Button
 * Changes button text and style based on streaming state
 * @param {boolean} playing - True if video is streaming
 */
function uiUpdateVideoButton(playing) {
    const videoBtn = document.getElementById('device-video-btn');
    videoBtn.textContent = playing ? 'Stop Video' : 'Start Video';
    videoBtn.className = playing ? 'disconnect' : 'connect';
}

/**
 * Update Device WiFi RSSI
 * Updates live WiFi signal strength for selected device
 * @param {string} deviceSn - Device serial number
 * @param {number} rssi - WiFi RSSI value in dBm
 */
function uiUpdateDeviceWifiRssi(deviceSn, rssi) {
    const rssiEl = document.getElementById('wifiRssi');
    if (rssiEl && deviceSn === uiGetDeviceSn()) {
        rssiEl.textContent = ` ${rssi} `;
    }
}

/**
 * Update Device WiFi Signal Level
 * Updates live WiFi signal level (0-4 scale) for selected device
 * @param {string} deviceSn - Device serial number
 * @param {number} signalLevel - WiFi signal level (0-4)
 */
function uiUpdateDeviceWifiSignalLevel(deviceSn, signalLevel) {
    const signalEl = document.getElementById('wifiSignalLevel');
    if (signalEl && deviceSn === uiGetDeviceSn()) {
        signalEl.textContent = ` ${signalLevel} `;
    }
}

// ============================================================================
// Device Image and Video Display
// ============================================================================

/**
 * Cleanup Device Picture
 * Revokes all blob URLs in device picture container to prevent memory leaks
 * Should be called before replacing image content
 */
function uiCleanupDevicePicture() {
    const picDiv = document.getElementById('device-picture');
    const oldImgs = picDiv.querySelectorAll('img');
    oldImgs.forEach(img => {
        if (img.src.startsWith('blob:')) {
            URL.revokeObjectURL(img.src);
        }
    });
}

/**
 * Extract Event Picture from Existing Blob
 * Attempts to retrieve existing event image data from DOM for reuse
 * Checks both flip-card back side and standalone images
 * @returns {Promise<{data: Array, mime: string}|null>} Event picture object or null if not found
 */
async function uiExtractEventPictureFromBlob() {
    const picDiv = document.getElementById('device-picture');

    // Try to get event image from existing flip card back side OR standalone image
    let existingEventImg = picDiv.querySelector('.flip-card-back img');
    if (!existingEventImg) {
        // No flip card found, try to get standalone event image
        existingEventImg = picDiv.querySelector('.device-picture-img');
    }

    if (existingEventImg && existingEventImg.src.startsWith('blob:')) {
        // Fetch blob data from existing image
        try {
            const response = await fetch(existingEventImg.src);
            const blob = await response.blob();
            const arrayBuffer = await blob.arrayBuffer();
            const eventPicture = {
                data: Array.from(new Uint8Array(arrayBuffer)),
                mime: blob.type || 'image/jpeg'
            };
            debugConsoleLog('Successfully extracted event image from existing blob.');
            return eventPicture;
        } catch (e) {
            debugConsoleLog('Failed to extract event image from blob: ' + e.message);
            return null;
        }
    } else {
        debugConsoleLog('No existing event image blob found.');
        return null;
    }
}

/**
 * Show Picture
 * Displays device picture if available, otherwise requests latest from station
 * Only updates when video is not streaming
 * @param {Object} picture - Picture object with binary data
 */
function uiShowPicture(picture) {
    const videoBtn = document.getElementById('device-video-btn');

    // Only update image when not streaming video
    if (videoBtn.className === 'connect') {
        if (picture) {
            uiUpdateDevicePicture(picture);
        } else {
            // No picture in properties, request latest from station database
            if (stationSn)
                eufyStationDatabaseQueryLatestInfo(stationSn);
        }
    }

    // Show update button
    document.getElementById('device-update-btn').style.display = "block";
}

/**
 * Update Device Picture
 * Converts binary image data to blob URL and displays in UI
 * 
 * Security:
 * - XSS protection: only allows safe image MIME types
 * - Memory management: revokes old blob URLs to prevent leaks
 * 
 * @param {Object} message - Image data object with type and binary data
 */
async function uiUpdateDevicePicture(message) {
    if (message && message.data.data && Array.isArray(message.data.data)) {
        const videoBtn = document.getElementById('device-video-btn');

        // Only update picture when not streaming video
        if (videoBtn.className === 'connect') {
            const pictureMime = uiParseMimeType(message.type);
            const picDiv = document.getElementById('device-picture');

            let eventPicture = null;
            let eventMime = null;
            if (message.isSnapshot) {
                if (!message.eventData) {
                    debugConsoleLog('Snapshot image received without event data, attempting to extract from existing blob.');
                    const extracted = await uiExtractEventPictureFromBlob();
                    if (extracted) {
                        eventPicture = { data: extracted.data };
                        eventMime = extracted.mime;
                    }
                } else {
                    eventPicture = message.eventData;
                    eventMime = uiParseMimeType(message.eventType);
                }
            }

            // Revoke old blob URLs to prevent memory leak
            uiCleanupDevicePicture();

            if (message.isSnapshot) {
                if (eventPicture) {
                    const eventMime = uiParseMimeType(message.eventType);
                    const flipCard = uiShowSnapshot(message.data, eventPicture, pictureMime, eventMime, message.isRecent === 'event');
                    picDiv.replaceChildren(flipCard);
                } else {
                    // Single snapshot image (no event picture available)
                    const eventText = document.createElement('div');
                    eventText.className = 'device-picture-text';
                    eventText.textContent = 'Snapshot Image';

                    const img = document.createElement('img');
                    img.src = URL.createObjectURL(new Blob([new Uint8Array(message.data.data)], { type: pictureMime }));
                    img.alt = 'Snapshot Image';
                    img.className = 'device-picture-img';

                    picDiv.replaceChildren(eventText, img);
                }
            } else {
                // Single event image (no snapshot available)
                const eventText = document.createElement('div');
                eventText.className = 'device-picture-text';
                eventText.textContent = 'Event Image';

                const img = document.createElement('img');
                img.src = URL.createObjectURL(new Blob([new Uint8Array(message.data.data)], { type: pictureMime }));
                img.alt = 'Event Image';
                img.className = 'device-picture-img';

                picDiv.replaceChildren(eventText, img);
            }

        } else {
            // Skip picture update while video is streaming
            debugConsoleLog('Skipping picture update while video is streaming.');
        }
    }
}

/**
 * Parse MIME Type
 * Validates and returns safe image MIME type from type object
 * 
 * Security:
 * - Whitelist validation to prevent XSS attacks
 * - Falls back to 'image/jpeg' if type is invalid or unsafe
 * 
 * @param {Object} type - Type object with mime property
 * @returns {string} Safe MIME type string (e.g., 'image/jpeg')
 */
function uiParseMimeType(type) {
    // Whitelist safe image MIME types to prevent XSS
    let mime = 'image/jpeg';
    if (type && typeof type.mime === 'string') {
        const safeMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp'];
        if (safeMimes.includes(type.mime.trim().toLowerCase())) {
            mime = type.mime.trim().toLowerCase();
        }
    }
    return mime;
}

/**
 * Show Snapshot with Flip Card
 * Creates interactive flip card UI element displaying snapshot and event images
 * 
 * Features:
 * - 3D flip animation on click
 * - Front side: Video snapshot
 * - Back side: Event image
 * - Converts binary data to blob URLs for display
 * 
 * @param {Object} picture - Snapshot image data object with data array
 * @param {Object} eventData - Event image data object with data array
 * @param {string} pictureType - MIME type for snapshot image
 * @param {string} eventType - MIME type for event image
 * @returns {HTMLElement} Flip card container element ready to append to DOM
 */
function uiShowSnapshot(picture, eventData, pictureType, eventType, isPictureRecent = false) {
    // Create flip card container for snapshot + event image
    const flipCard = document.createElement('div');
    flipCard.className = 'flip-card';

    const flipCardInner = document.createElement('div');
    flipCardInner.className = 'flip-card-inner';

    // Front side: Video Snapshot
    const flipCardFront = document.createElement('div');
    flipCardFront.className = 'flip-card-front';

    const snapshotText = document.createElement('div');
    snapshotText.className = 'device-picture-text';
    snapshotText.textContent = 'Video Snapshot';

    const snapshotImg = document.createElement('img');
    snapshotImg.src = URL.createObjectURL(new Blob([new Uint8Array(picture.data)], { type: pictureType }));
    snapshotImg.alt = 'Video Snapshot';
    snapshotImg.className = 'device-picture-img';

    flipCardFront.appendChild(snapshotText);
    flipCardFront.appendChild(snapshotImg);

    // Back side: Event Image
    const flipCardBack = document.createElement('div');
    flipCardBack.className = 'flip-card-back';

    const eventText = document.createElement('div');
    eventText.className = 'device-picture-text';
    eventText.textContent = 'Event Image';

    const eventImg = document.createElement('img');
    eventImg.src = URL.createObjectURL(new Blob([new Uint8Array(eventData.data)], { type: eventType }));
    eventImg.alt = 'Event Image';
    eventImg.className = 'device-picture-img';

    flipCardBack.appendChild(eventText);
    flipCardBack.appendChild(eventImg);

    // Assemble flip card
    flipCardInner.appendChild(flipCardFront);
    flipCardInner.appendChild(flipCardBack);
    flipCard.appendChild(flipCardInner);

    // Click handler to flip card
    flipCard.addEventListener('click', function () {
        flipCardInner.classList.toggle('flipped');
    });

    if (isPictureRecent) {
        flipCardInner.classList.toggle('flipped');
    }

    return flipCard;
}

/**
 * Update Device Video
 * Creates video element with buffer display for livestream playback
 * Replaces static image with video player interface
 */
function uiUpdateDeviceVideo() {
    const picDiv = document.getElementById('device-picture');

    // Revoke old blob URLs to prevent memory leak
    uiCleanupDevicePicture();

    // Create video element with controls
    const video = document.createElement('video');
    video.id = 'device-video-video';
    video.controls = true;
    video.autoplay = true;

    // Create buffer size display
    const p = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = 'Buffer:';
    const bufferSpan = document.createElement('span');
    bufferSpan.id = 'device-video-buffer';
    bufferSpan.textContent = '0s';
    p.appendChild(strong);
    p.appendChild(bufferSpan);

    // Create error message overlay
    const errorDiv = document.createElement('div');
    errorDiv.id = 'device-video-errorMessage';

    // Replace image with video player interface
    picDiv.replaceChildren(video, p, errorDiv);
}

// ============================================================================
// PTZ Camera Controls
// ============================================================================

/**
 * Show Video Button
 * Shows or hides livestream start/stop button
 * @param {boolean} show - True to show button, false to hide
 */
function uiShowVideoButton(show) {
    document.getElementById('device-video-btn').style.display = show ? 'block' : 'none';
}

/**
 * Show Position Preset Controls
 * Creates and displays preset position buttons for PTZ camera
 * Button count is determined by global presetButtons variable
 * @param {boolean} show - True to show controls, false to hide
 */
function uiShowPositionPresetControls(show) {
    const presetsContainer = document.getElementById('device-presets');
    presetsContainer.style.display = show ? 'grid' : 'none';

    if (show) {
        // Add label
        const span = document.createElement('span');
        span.className = 'preset-label';
        span.textContent = 'Pos:';
        presetsContainer.replaceChildren(span);

        // Create preset buttons (typically 4-8 positions)
        for (let i = 0; i < presetButtons; i++) {
            const btn = document.createElement('button');
            btn.value = i;
            btn.textContent = i + 1;  // Display 1-based numbering
            btn.className = 'preset-btn';

            // Execute preset position on click
            btn.addEventListener('click', function () {
                const deviceSn = uiGetDeviceSn();
                if (deviceSn && btn.value) {
                    eufyPresetPosition(deviceSn, parseInt(btn.value));
                }
            });

            presetsContainer.appendChild(btn);
        }
    }
}

/**
 * Change Position Preset Error
 * Updates visual state of preset button to show success/error
 * @param {string|null} errorMessage - Error message to display as tooltip, or null for success
 */
function uiChangePositionPresetError(errorMessage) {
    const isError = !!errorMessage;
    const btn = document.querySelector(`.preset-btn[value="${lastPreset}"]`);
    if (btn) {
        btn.className = isError ? 'preset-btn error' : 'preset-btn';
        btn.title = isError ? errorMessage : '';
    }
}

/**
 * Show Pan/Tilt Controls
 * Future implementation for manual pan/tilt direction controls
 * @param {boolean} show - True to show controls, false to hide
 */
function uiShowPanTiltControls(show) {
    // TODO: implement pan/tilt controls UI
    // document.getElementById('device-pan-tilt-controls').style.display = show ? 'block' : 'none';
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get Device Serial Number
 * Returns currently selected device SN from dropdown
 * @returns {string|null} Device serial number or null
 */
function uiGetDeviceSn() {
    const select = document.getElementById('device-select');
    return select ? select.value : null;
}

// ============================================================================
// Configuration Modal
// ============================================================================

/**
 * Open Configuration Modal
 * Displays configuration modal with current settings
 * 
 * Configurable settings:
 * - Eufy account (username, password, country, language)
 * - Video scaling resolution
 * - FFmpeg transcoding preset (ultrafast, veryfast, fast, medium)
 * - FFmpeg CRF quality (0-51, lower = better quality)
 * - FFmpeg thread count
 * - Short keyframe intervals (for lower latency)
 * 
 * @param {Object} config - Current configuration object
 */
function uiOpenConfigModal(config) {
    if (!config) {
        uiShowConfigButton(false);
        alert('Configuration not available');
        return;
    }

    // Populate modal form fields with current configuration
    document.getElementById('config-eufy-username').value = config.EUFY_CONFIG?.username || '';
    document.getElementById('config-eufy-password').value = config.EUFY_CONFIG?.password || '';
    document.getElementById('config-eufy-country').value = config.EUFY_CONFIG?.country || 'DE';
    document.getElementById('config-eufy-language').value = config.EUFY_CONFIG?.language || 'en';
    document.getElementById('config-video-scale').value = config.VIDEO_SCALE || '';
    document.getElementById('config-transcoding-preset').value = config.TRANSCODING_PRESET || 'ultrafast';
    document.getElementById('config-transcoding-crf').value = config.TRANSCODING_CRF || '';
    document.getElementById('config-ffmpeg-threads').value = config.FFMPEG_THREADS || '';
    document.getElementById('config-short-keyframes').checked = config.FFMPEG_SHORT_KEYFRAMES || false;

    // Display modal
    const modal = document.getElementById('config-modal');
    modal.classList.add('show');
    inConfig = true;  // Disable keyboard shortcuts

    // Setup password visibility toggle
    const passwordToggleBtn = document.getElementById('password-toggle-btn');
    const passwordInput = document.getElementById('config-eufy-password');

    passwordToggleBtn.onclick = () => {
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            passwordToggleBtn.textContent = '🙈';  // Hide password icon
        } else {
            passwordInput.type = 'password';
            passwordToggleBtn.textContent = '👁';   // Show password icon
        }
    };

    // Setup modal event listeners
    const closeBtn = modal.querySelector('.modal-close');
    const cancelBtn = document.getElementById('config-cancel-btn');
    const saveBtn = document.getElementById('config-save-btn');

    // Close modal helper
    const closeModal = () => {
        modal.classList.remove('show');
        inConfig = false;  // Re-enable keyboard shortcuts

        // Reset password field type
        passwordInput.type = 'password';
        passwordToggleBtn.textContent = '👁';
    };

    // Close button handler
    closeBtn.onclick = closeModal;
    cancelBtn.onclick = closeModal;

    // Close modal when clicking outside content area
    modal.onclick = (e) => {
        if (e.target === modal) {
            closeModal();
        }
    };

    // Save configuration handler
    saveBtn.onclick = () => {
        // Build new configuration object from form inputs
        const newConfig = {
            EUFY_CONFIG: {
                username: document.getElementById('config-eufy-username').value,
                password: document.getElementById('config-eufy-password').value,
                country: document.getElementById('config-eufy-country').value,
                language: document.getElementById('config-eufy-language').value
            },
            VIDEO_SCALE: document.getElementById('config-video-scale').value,
            TRANSCODING_PRESET: document.getElementById('config-transcoding-preset').value,
            TRANSCODING_CRF: document.getElementById('config-transcoding-crf').value,
            FFMPEG_THREADS: document.getElementById('config-ffmpeg-threads').value,
            FFMPEG_SHORT_KEYFRAMES: document.getElementById('config-short-keyframes').checked
        };

        // Send updated config to server
        const err = restPostConfig(newConfig);
        if (err) {
            alert('Error saving configuration: ' + err);
        } else {
            closeModal();
        }
    };
}