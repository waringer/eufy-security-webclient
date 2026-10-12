/**
 * Device Properties for the Web UI
 *
 * Combines the live property values of an @mega-yfue/eufy-sdk device with the
 * SDK's own description of them (device.describe()), so the UI can render any
 * device generically using the SDK property names - no translation table.
 *
 * Result format:
 *   properties: { <sdk name>: <plain value>, '$name': ..., '$model': ... }
 *   meta.groups: [{ id, label, properties: [{ name, label, type, kind, unit, values, labels, writable, description }] }]
 *
 * Properties starting with '$' are static device information (not SDK properties).
 */

const INFO_GROUP = 'info';
const OTHER_GROUP = 'other';

// Capability name -> group label (everything else is title-cased)
const GROUP_LABELS = {
    info: 'Device Information',
    rtsp: 'RTSP',
    ptz: 'Pan / Tilt / Zoom',
};

// Raw SDK parameters without a proper name
const RAW_NAME = /^(param\d+|unknown_\d+|version\d+)$/;

/**
 * Properties the SDK reports but does not describe in device.describe().
 * Those that are useful in the UI get a group, label and unit here; they are merged into a
 * described group with the same id (e.g. 'motion') or create a new one.
 */
const GROUP_ORDER_EXTRA = ['network', 'status', 'recording', 'guard', 'doorbell', 'hub', 'statistics', 'storage'];

// 'requires': only shown when the device has this capability (otherwise the cloud reports meaningless defaults)
const KNOWN_RAW = {
    // Device information / status
    systemVersion: { group: INFO_GROUP, label: 'Software Version', type: 'text' },
    deviceStatus: { group: 'status', label: 'Device Status', type: 'boolean' },
    devUpgrade: { group: 'status', label: 'Firmware Upgrade', type: 'boolean' },
    devCloudStatus: { group: 'status', label: 'Cloud Status', type: 'boolean' },
    devHomekitStatus: { group: 'status', label: 'HomeKit Status', type: 'boolean' },
    hubStatus: { group: 'status', label: 'Hub Status', type: 'boolean' },
    hubUpgrade: { group: 'status', label: 'Hub Firmware Upgrade', type: 'boolean' },

    // Network
    wifiRssi: { group: 'network', label: 'WiFi RSSI', type: 'number', unit: 'dBm' },
    ipAddress: { group: 'network', label: 'IP Address', type: 'text' },
    wanMode: { group: 'network', label: 'WAN Mode', type: 'boolean' },

    // Motion
    motionSensitivity: { group: 'motion', label: 'Sensitivity', type: 'number' },
    motionDetectionType: { group: 'motion', label: 'Detection Type', type: 'boolean' },
    pirSensitivityRaw: { group: 'motion', label: 'PIR Sensitivity (raw)', type: 'number' },
    indoorMotionEnable: { group: 'motion', label: 'Indoor Motion Detection', type: 'boolean' },
    indoorSensitivity: { group: 'motion', label: 'Indoor Sensitivity', type: 'number' },

    // Recording
    continuousRecording: { group: 'recording', label: 'Continuous Recording', type: 'boolean' },
    recordQuality: { group: 'recording', label: 'Recording Quality', type: 'boolean' },
    pkgDetRecSwitch: { group: 'recording', label: 'Package Detection Recording', type: 'boolean' },
    hubDisableRecord: { group: 'recording', label: 'Hub: Recording Disabled', type: 'boolean' },

    // Camera / light / battery details
    liveviewLedSwitch: { group: 'camera', label: 'Live View LED', type: 'boolean' },
    privacyparam: { group: 'camera', label: 'Privacy Zones', type: 'text' },
    lightCtrlPirSwitch: { group: 'light', label: 'Light Controlled by PIR', type: 'boolean' },
    floodlightColorTemperatureValue: { group: 'light', label: 'Color Temperature', type: 'number' },
    powerSourceInfo: { group: 'battery', label: 'Power Source Info', type: 'text' },

    // Audio
    promptVolume: { group: 'audio', label: 'Prompt Volume', type: 'number' },

    // Guard mode settings (per mode: home / away / custom 1-3)
    homeAction: { group: 'guard', label: 'Home Action', type: 'number' },
    awayAction: { group: 'guard', label: 'Away Action', type: 'number' },
    custom1Action: { group: 'guard', label: 'Custom 1 Action', type: 'number' },
    custom2Action: { group: 'guard', label: 'Custom 2 Action', type: 'boolean' },
    custom3Action: { group: 'guard', label: 'Custom 3 Action', type: 'boolean' },
    alarmDelayHome: { group: 'guard', label: 'Alarm Delay (Home)', type: 'boolean' },
    alarmDelayAway: { group: 'guard', label: 'Alarm Delay (Away)', type: 'boolean' },
    alarmDelayCustom1: { group: 'guard', label: 'Alarm Delay (Custom 1)', type: 'boolean' },
    alarmDelayCustom2: { group: 'guard', label: 'Alarm Delay (Custom 2)', type: 'boolean' },
    alarmDelayCustom3: { group: 'guard', label: 'Alarm Delay (Custom 3)', type: 'boolean' },
    leavingDelayHome: { group: 'guard', label: 'Leaving Delay (Home)', type: 'boolean' },
    leavingDelayAway: { group: 'guard', label: 'Leaving Delay (Away)', type: 'boolean' },
    leavingDelayCustom1: { group: 'guard', label: 'Leaving Delay (Custom 1)', type: 'boolean' },
    leavingDelayCustom2: { group: 'guard', label: 'Leaving Delay (Custom 2)', type: 'boolean' },
    leavingDelayCustom3: { group: 'guard', label: 'Leaving Delay (Custom 3)', type: 'boolean' },

    // Doorbell
    doorbellRingtoneVolume: { group: 'doorbell', label: 'Ringtone Volume', type: 'number', requires: 'doorbell' },
    doorbellSetNotificationMode: { group: 'doorbell', label: 'Notification Mode', type: 'text', requires: 'doorbell' },
    batDoorbellChimeSwitch: { group: 'doorbell', label: 'Chime', type: 'boolean', requires: 'doorbell' },
    batDoorbellMechanicalChimeSwitch: { group: 'doorbell', label: 'Mechanical Chime', type: 'boolean', requires: 'doorbell' },
    batDoorbellWdrSwitch: { group: 'doorbell', label: 'WDR', type: 'boolean', requires: 'doorbell' },
    batDoorbellSetElectronicRingtoneTime: { group: 'doorbell', label: 'Electronic Ringtone Time', type: 'boolean', requires: 'doorbell' },
    batDoorbellSetDingdongVolume: { group: 'doorbell', label: 'Ding-Dong Volume', type: 'number', requires: 'doorbell' },
    batDoorbellSetDingdongRingtone: { group: 'doorbell', label: 'Ding-Dong Ringtone', type: 'number', requires: 'doorbell' },

    // Hub (HomeBase)
    hubNotifyAlarm: { group: 'hub', label: 'Notify on Alarm', type: 'boolean' },
    keypadIsPswSet: { group: 'hub', label: 'Keypad Password Set', type: 'boolean' },
    silentOtaSwitch: { group: 'hub', label: 'Silent Firmware Update', type: 'boolean' },
    deviceCrossCamAssistanceSwitch: { group: 'hub', label: 'Cross Camera Assistance', type: 'boolean' },
    deviceCrossCamInterval: { group: 'hub', label: 'Cross Camera Interval', type: 'number' },

    // Statistics
    detectedEvents: { group: 'statistics', label: 'Detected Events', type: 'number' },
    workingDays: { group: 'statistics', label: 'Working Days', type: 'number' },
    recordingDays: { group: 'statistics', label: 'Recording Days', type: 'number' },

    // Storage
    tfcardStatus: { group: 'storage', label: 'SD Card Status', type: 'boolean' },
};

// Raw properties that only repeat something shown elsewhere
const HIDDEN_RAW = new Set(['deviceName']);

const GROUP_LABELS_EXTRA = {
    network: 'Network',
    status: 'Status',
    recording: 'Recording',
    guard: 'Guard Mode Settings',
    doorbell: 'Doorbell',
    hub: 'Hub',
    statistics: 'Statistics',
    storage: 'Storage',
};

/**
 * "nightVision" -> "Night Vision", "person_detection" -> "Person Detection"
 * @param {string} name - camelCase or snake_case identifier
 * @returns {string} Human readable label
 */
function toLabel(name) {
    return name
        .replace(/[_-]+/g, ' ')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Plain value of an SDK property ({ name, paramType, value, ts } -> value)
 * @param {*} prop - Entry of device.getProperties()
 * @returns {*} Plain value
 */
function plainValue(prop) {
    return prop && typeof prop === 'object' && 'value' in prop ? prop.value : prop;
}

/**
 * UI type of an undescribed value
 * @param {*} value - Property value
 * @returns {string} 'boolean' | 'number' | 'text'
 */
function typeOf(value) {
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    return 'text';
}

/**
 * Build properties and meta data of a device
 * @param {Device} device - SDK device object
 * @param {Object} [info] - Cloud device info (name, model, sn, stationSn)
 * @returns {{properties: Object, meta: Object}} Plain values and their description
 */
function buildDeviceProperties(device, info) {
    const sdkProperties = device.getProperties() || {};
    const manifest = device.describe();

    const properties = {};
    for (const [name, prop] of Object.entries(sdkProperties)) {
        if (name === 'picture') continue;
        properties[name] = plainValue(prop);
    }

    const groups = [];
    const described = new Set();

    // Static device information
    const infoItems = [
        ['$name', 'Name', (info && info.name) || manifest.name],
        ['$model', 'Model', (info && info.model) || manifest.model],
        ['$modelName', 'Model Name', manifest.modelName],
        ['$serialNumber', 'Serial Number', device.sn],
        ['$stationSerialNumber', 'Station SN', info && info.stationSn],
    ].filter(([, , value]) => value);
    for (const [name, , value] of infoItems) properties[name] = value;
    groups.push({
        id: INFO_GROUP,
        label: GROUP_LABELS[INFO_GROUP],
        properties: infoItems.map(([name, label]) => ({ name, label, type: 'text' }))
    });

    // Properties described by the SDK, grouped by capability
    for (const detail of manifest.details || []) {
        const items = [];
        for (const read of detail.reads || []) {
            if (!(read.property in properties) || described.has(read.property)) continue;
            described.add(read.property);
            items.push({
                name: read.property,
                label: toLabel(read.property),
                type: read.type,
                kind: read.kind,
                unit: read.unit,
                values: read.values,
                labels: read.labels,
                writable: read.writable,
                description: read.description
            });
        }
        if (items.length > 0) {
            groups.push({ id: detail.capability, label: GROUP_LABELS[detail.capability] || toLabel(detail.capability), properties: items });
        }
    }

    // Useful raw properties: merge into a described group or create a named one
    const groupById = new Map(groups.map(group => [group.id, group]));
    for (const [name, known] of Object.entries(KNOWN_RAW)) {
        if (!(name in properties) || described.has(name)) continue;
        if (known.requires && !(manifest.capabilities || []).includes(known.requires)) continue;
        described.add(name);

        let group = groupById.get(known.group);
        if (!group) {
            group = { id: known.group, label: GROUP_LABELS_EXTRA[known.group] || toLabel(known.group), properties: [] };
            groupById.set(known.group, group);
            groups.push(group);
        }
        group.properties.push({ name, label: known.label, type: known.type, unit: known.unit });
    }

    // Keep the added groups in a stable order (network, recording, ... after the described ones)
    groups.sort((a, b) => {
        const rank = group => GROUP_ORDER_EXTRA.includes(group.id) ? GROUP_ORDER_EXTRA.indexOf(group.id) + 1 : 0;
        return rank(a) - rank(b);
    });

    // Everything the SDK reports without describing it (named ones first)
    const other = Object.keys(properties)
        .filter(name => !name.startsWith('$') && !described.has(name) && !HIDDEN_RAW.has(name))
        .sort((a, b) => (RAW_NAME.test(a) - RAW_NAME.test(b)) || a.localeCompare(b))
        .map(name => ({ name, label: name, type: typeOf(properties[name]), raw: true }));
    if (other.length > 0) {
        groups.push({ id: OTHER_GROUP, label: 'Other (not described by SDK)', properties: other });
    }

    return { properties, meta: { groups } };
}

module.exports = { buildDeviceProperties };
