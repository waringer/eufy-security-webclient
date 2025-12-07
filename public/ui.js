let presetButtons = null;
let inConfig = false;

function uiDebugLog(message) {
    if (debugMode) document.getElementById('info').textContent += message + '\n';
}

// Initializes the UI and event listeners when the DOM is loaded.
function uiInit() {
    // Hide info panel if debugMode is false
    uiInitInfoPanel(debugMode);
    uiInitKeyboardShortcuts();
    uiCheckNotificationsSupport();

    document.getElementById('connect-btn').onclick = function () {
        wsToggleConnection();
    };

    document.getElementById('config-btn').onclick = function () {
        uiOpenConfigModal();
    }

    document.getElementById('notification-btn').onclick = function () {
        uiInitNotifiactions();
    }

    // Status bar collapse/expand toggle
    document.getElementById('status-toggle-btn').addEventListener('click', function () {
        document.getElementById('status').classList.toggle('collapsed');
    });

    // Device dropdown change event
    const select = document.getElementById('device-select');
    if (select) {
        select.addEventListener('change', function () {
            const deviceSn = select.value;
            if (deviceSn) {
                document.getElementById('device-update-btn').style.display = "none";
                document.getElementById('device-video-btn').style.display = "none";
                uiChangePositionPresetError(null);
                eufyDeviceGetProperties(deviceSn);
                eufyDeviceGetCommands(deviceSn);
            }
        });
    }

    // Update device button event
    document.getElementById('device-update-btn').addEventListener('click', function () {
        document.getElementById('device-select').dispatchEvent(new Event('change'));
    });

    // Video button event
    document.getElementById('device-video-btn').addEventListener('click', function () {
        const videoBtn = document.getElementById('device-video-btn');

        if (videoBtn.className === 'connect') {
            uiUpdateDeviceVideo();
            videoStartStream(transcodeServerUrl, document.getElementById('device-select').value);
        } else {
            videoStopStream();
            document.getElementById('device-select').dispatchEvent(new Event('change'));
        }
    });
}

// Shows or hides the info panel depending on debugMode.
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

function uiInitKeyboardShortcuts() {
    document.addEventListener('keydown', function (event) {
        if (inConfig) return;
        switch (event.code) {
            case 'ArrowUp':
                eufyPanAndTilt(uiGetDeviceSn(), 3);
                event.preventDefault();
                break;
            case 'ArrowDown':
                eufyPanAndTilt(uiGetDeviceSn(), 4);
                event.preventDefault();
                break;
            case 'ArrowLeft':
                eufyPanAndTilt(uiGetDeviceSn(), 1);
                event.preventDefault();
                break;
            case 'ArrowRight':
                eufyPanAndTilt(uiGetDeviceSn(), 2);
                event.preventDefault();
                break;
            case 'Home':
                eufyPanAndTilt(uiGetDeviceSn(), 0);
                event.preventDefault();
                break;
            case 'Numpad1':
                eufyPresetPosition(uiGetDeviceSn(), 0);
                event.preventDefault();
                break;
            case 'Numpad2':
                eufyPresetPosition(uiGetDeviceSn(), 1);
                event.preventDefault();
                break;
            case 'Numpad3':
                eufyPresetPosition(uiGetDeviceSn(), 2);
                event.preventDefault();
                break;
            case 'Numpad4':
                eufyPresetPosition(uiGetDeviceSn(), 3);
                event.preventDefault();
                break;
            case 'Numpad5':
                eufyPresetPosition(uiGetDeviceSn(), 4);
                event.preventDefault();
                break;
            case 'Numpad6':
                eufyPresetPosition(uiGetDeviceSn(), 5);
                event.preventDefault();
                break;
        }
    });
}

function uiCheckNotificationsSupport() {
    const notificationBtn = document.getElementById('notification-btn');
    if (!("Notification" in window)) {
        // Browser does not support notifications
        notificationBtn.style.display = 'none';
    }

    switch (Notification.permission) {
        case "granted":
            notificationBtn.style.display = 'none';
            break;
        case "denied":
            notificationBtn.style.display = 'none';
            break;
        case "default":
            notificationBtn.style.display = 'block';
            break;
    }
}

// Initializes browser notifications by requesting permission from the user.
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

            uiCheckNotificationsSupport();
        });
    }
}

// Resets all UI display fields to their default/empty state.
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

// Updates the Eufy WebSocket version info in the UI.
function uiUpdateEufyWSVersion(driverVersion, serverVersion, minSchemaVersion, maxSchemaVersion) {
    document.getElementById('ws-version').textContent = `Driver: ${driverVersion}, Server: ${serverVersion}, Schema: ${minSchemaVersion}-${maxSchemaVersion}`;
};

// Updates the station serial number in the UI.
function uiUpdateStationSn(stationSn) {
    document.getElementById('station-sn').textContent = stationSn ? `Station SN: ${stationSn}` : '';
}

function uiUpdateStationInfo(props) {
    // 2nd status line: Name, Model, Versions, MAC, IP, HDD free
    let hddFreePercent = '';
    if (props.storageInfoHdd && props.storageInfoHdd.disk_size && props.storageInfoHdd.disk_used) {
        const free = props.storageInfoHdd.disk_size - props.storageInfoHdd.disk_used;
        hddFreePercent = Math.round((free / props.storageInfoHdd.disk_size) * 100);
    }

    const statusLine2 =
        `Name: ${props.name || ''} | Model: ${props.model || ''} | HW: ${props.hardwareVersion || ''} | SW: ${props.softwareVersion || ''} | ` +
        `MAC: ${props.macAddress || ''} | IP: ${props.lanIpAddress || ''}` +
        (hddFreePercent !== '' ? ` | HDD free: ${hddFreePercent}%` : '');

    document.getElementById('station-version').textContent = statusLine2;
}

// Updates the connect button's text and class based on connection state.
function uiUpdateConnectButtonState() {
    const connectBtn = document.getElementById('connect-btn');
    const connected = eufyws && eufyws.readyState === WebSocket.OPEN;

    connectBtn.textContent = connected ? 'Disconnect' : 'Connect';
    connectBtn.className = connected ? 'disconnect' : 'connect';
};

function uiShowConfigButton(show) {
    document.getElementById('config-btn').style.display = show ? 'block' : 'none';
}

/**
 * Updates the connection status text and color in the UI.
 * @param {string} text - The status message to display.
 * @param {string} color - The color for the status text.
 */
function uiUpdateStatus(text, color = 'black') {
    const statusEl = document.getElementById('connection-status');

    statusEl.textContent = text;
    statusEl.style.color = color;
}

// Updates the device info table in the UI.
function uiUpdateDeviceInfoTable(props) {
    document.getElementById('device-info').innerHTML = uiMakeDeviceInfoTable(props);
}

// Creates the HTML for the device info table.
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

// Creates the device list dropdown and triggers change event for the first device.
function uiMakeDeviceList(devices) {
    const selectContainer = document.getElementById('device-select-container');
    const select = document.getElementById('device-select');
    select.replaceChildren();
    devices.forEach(dev => {
        const opt = document.createElement('option');
        opt.value = dev;
        opt.textContent = dev;
        select.appendChild(opt);
    });
    if (devices.length > 0) {
        selectContainer.style.display = 'block ruby';

        // Trigger change event for first device
        select.selectedIndex = 0;
        select.dispatchEvent(new Event('change'));
    } else {
        selectContainer.style.display = 'none';
    }
}

function uiLockDeviceList(lock) {
    const select = document.getElementById('device-select');
    select.disabled = lock;
}

function uiUpdateVideoButton(playing) {
    const videoBtn = document.getElementById('device-video-btn');
    videoBtn.textContent = playing ? 'Stop Video' : 'Start Video';
    videoBtn.className = playing ? 'disconnect' : 'connect';
}

// Updates the device WiFi RSSI value in the UI.
function uiUpdateDeviceWifiRssi(deviceSn, rssi) {
    const rssiEl = document.getElementById('wifiRssi');
    if (rssiEl && deviceSn === uiGetDeviceSn()) {
        rssiEl.textContent = ` ${rssi} `;
    }
}

// Updates the device WiFi signal level in the UI.
function uiUpdateDeviceWifiSignalLevel(deviceSn, signalLevel) {
    const signalEl = document.getElementById('wifiSignalLevel');
    if (signalEl && deviceSn === uiGetDeviceSn()) {
        signalEl.textContent = ` ${signalLevel} `;
    }
}

// Shows the device image if available and not streaming.
function uiShowPicture(picture) {
    // Show image if available and not streaming
    const videoBtn = document.getElementById('device-video-btn');
    if (videoBtn.className === 'connect') {
        if (picture) {
            uiUpdateDevicePicture(picture);
        } else {
            if (stationSn)
                eufyStationDatabaseQueryLatestInfo(stationSn);
        }
    }
    document.getElementById('device-update-btn').style.display = "block";
}

/**
 * Updates the device image in the UI from a binary message object.
 * @param {Object} message - The image data object.
 */
function uiUpdateDevicePicture(message) {
    if (message && message.data.data && Array.isArray(message.data.data)) {
        const videoBtn = document.getElementById('device-video-btn');
        if (videoBtn.className === 'connect') {
            // Only allow safe image mime types to avoid XSS
            let mime = 'image/jpeg';
            if (message.type && typeof message.type.mime === 'string') {
                if (['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp'].includes(message.type.mime.trim().toLowerCase())) {
                    mime = message.type.mime.trim().toLowerCase();
                }
            }

            const picDiv = document.getElementById('device-picture');

            // Revoke old blob URL if exists to prevent memory leak
            const oldImg = picDiv.querySelector('img');
            if (oldImg && oldImg.src.startsWith('blob:')) {
                URL.revokeObjectURL(oldImg.src);
            }

            const img = document.createElement('img');
            img.src = URL.createObjectURL(new Blob([new Uint8Array(message.data.data)], { type: mime }));
            img.alt = 'Device image';
            img.className = 'device-picture-img';
            picDiv.replaceChildren(img);
        } else {
            // Skip picture update while video is streaming
            debugConsoleLog('Skipping picture update while video is streaming.');
        }
    }
}

// Updates the device video element in the UI.
function uiUpdateDeviceVideo() {
    const picDiv = document.getElementById('device-picture');

    const video = document.createElement('video');
    video.id = 'device-video-video';
    video.controls = true;
    video.autoplay = true;

    const p = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = 'Buffer:';
    const bufferSpan = document.createElement('span');
    bufferSpan.id = 'device-video-buffer';
    bufferSpan.textContent = '0s';
    p.appendChild(strong);
    p.appendChild(bufferSpan);

    const errorDiv = document.createElement('div');
    errorDiv.id = 'device-video-errorMessage';

    picDiv.replaceChildren(video, p, errorDiv);
}

// Shows or hides the video button.
function uiShowVideoButton(show) {
    document.getElementById('device-video-btn').style.display = show ? 'block' : 'none';
}

// Shows or hides the position preset controls and creates preset buttons.
function uiShowPositionPresetControls(show) {
    const presetsContainer = document.getElementById('device-presets');
    presetsContainer.style.display = show ? 'grid' : 'none';
    if (show) {
        const span = document.createElement('span');
        span.className = 'preset-label';
        span.textContent = 'Pos:';
        presetsContainer.replaceChildren(span);

        for (let i = 0; i < presetButtons; i++) {
            const btn = document.createElement('button');
            btn.value = i;
            btn.textContent = i + 1;
            btn.className = 'preset-btn';

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

// Changes the error state of the last position preset button.
function uiChangePositionPresetError(errorMessage) {
    const isError = !!errorMessage;
    const btn = document.querySelector(`.preset-btn[value="${lastPreset}"]`);
    if (btn) {
        btn.className = isError ? 'preset-btn error' : 'preset-btn';
        btn.title = isError ? errorMessage : '';
    }
}

// Shows or hides the pan/tilt controls (not yet implemented).
function uiShowPanTiltControls(show) {
    // TODO: implement pan/tilt controls UI
    // document.getElementById('device-pan-tilt-controls').style.display = show ? 'block' : 'none';
}

// Gets the currently selected device serial number from the dropdown.
function uiGetDeviceSn() {
    const select = document.getElementById('device-select');
    return select ? select.value : null;
}

// Opens the configuration modal and populates it with current config values
function uiOpenConfigModal() {
    if (!transcodeConfig) {
        uiShowConfigButton(false);
        alert('Configuration not available');
        return;
    }

    // Populate modal fields with current config
    document.getElementById('config-eufy-ws-url').value = transcodeConfig.EUFY_WS_URL || '';
    document.getElementById('config-video-scale').value = transcodeConfig.VIDEO_SCALE || '';
    document.getElementById('config-transcoding-preset').value = transcodeConfig.TRANSCODING_PRESET || 'ultrafast';
    document.getElementById('config-transcoding-crf').value = transcodeConfig.TRANSCODING_CRF || '';
    document.getElementById('config-ffmpeg-threads').value = transcodeConfig.FFMPEG_THREADS || '';
    document.getElementById('config-short-keyframes').checked = transcodeConfig.FFMPEG_SHORT_KEYFRAMES || false;

    // Show modal
    const modal = document.getElementById('config-modal');
    modal.classList.add('show');
    inConfig = true;

    // Setup event listeners
    const closeBtn = modal.querySelector('.modal-close');
    const cancelBtn = document.getElementById('config-cancel-btn');
    const saveBtn = document.getElementById('config-save-btn');

    const closeModal = () => {
        modal.classList.remove('show');
        inConfig = false;
    };

    closeBtn.onclick = closeModal;
    cancelBtn.onclick = closeModal;

    // Close modal when clicking outside
    modal.onclick = (e) => {
        if (e.target === modal) {
            closeModal();
        }
    };

    // Save configuration
    saveBtn.onclick = () => {
        const newConfig = {
            EUFY_WS_URL: document.getElementById('config-eufy-ws-url').value,
            VIDEO_SCALE: document.getElementById('config-video-scale').value,
            TRANSCODING_PRESET: document.getElementById('config-transcoding-preset').value,
            TRANSCODING_CRF: document.getElementById('config-transcoding-crf').value,
            FFMPEG_THREADS: document.getElementById('config-ffmpeg-threads').value,
            FFMPEG_SHORT_KEYFRAMES: document.getElementById('config-short-keyframes').checked
        };

        const err = restPostConfig(newConfig);
        if (err) {
            alert('Error saving configuration: ' + err);
        } else {
            closeModal();
        }
    };
}