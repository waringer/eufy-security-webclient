/**
 * Eufy Security Client Module
 * 
 * Manages connection to Eufy Security system and provides:
 * - Device and station discovery and management
 * - Live streaming control
 * - Event handling and broadcasting
 * - WebSocket API command handlers
 * - Snapshot management and updates
 */

const utils = require('./utils');

// Use local eufy-security-client in dev mode, installed package in production
const eufyClientPath = utils.isDev ? '../../eufy-security-client' : 'eufy-security-client';
const { EufySecurity, AudioCodec, VideoCodec } = require(eufyClientPath);
const eufyVersion = require(`${eufyClientPath}/package.json`).version;

const transcode = require('./transcode');
const wsApi = require('./ws-api');

// State management
let eufyClient = null;                      // EufySecurity client instance
let wsEvnentHandlersRegistered = false;     // Flag to prevent duplicate handler registration
let currentStreamingSN = null;              // Serial number of currently streaming device
let stations = new Set();                   // Set of discovered stations
let devices = new Set();                    // Set of discovered devices

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
 * Connect to Eufy Security System
 * Initializes the Eufy Security client and registers all event handlers
 * @param {Object} eufyConfig - Configuration object with username, password, country, etc.
 */
async function connect(eufyConfig) {
    try {
        utils.log('Initializing Eufy Security Client...', 'info');

        // Prevent duplicate connections
        if (eufyClient && eufyClient.isConnected()) {
            utils.log('✓ Eufy client is already connected.', 'warn');
            return;
        }

        // Validate required configuration parameters
        if (eufyConfig.username && eufyConfig.password && eufyConfig.persistentDir && eufyConfig.country && eufyConfig.language) {
            // Initialize Eufy Security client
            eufyClient = await EufySecurity.initialize(eufyConfig);

            /**
             * Connection Event Handlers
             * Register handlers for connection lifecycle events
             */
            eufyClient.on('connect', () => {
                utils.log('✓ Successfully connected to Eufy!', 'info');
                // Register WebSocket API handlers once connection is established
                registerWebSocketHandlers();
            });

            eufyClient.on("connection error", (error) => {
                utils.log('❌ Eufy connection error: ' + error, 'error');
                // Clear cached data on connection error
                stations.clear();
                devices.clear();
            });

            eufyClient.on("push connect", () => {
                utils.log('🔌 Eufy push connection established.', 'debug');
            });

            eufyClient.on("push close", () => {
                utils.log('⚠️ Eufy push connection closed.', 'warn');
            });

            eufyClient.on("close", () => {
                utils.log('⚠️ Connection to Eufy closed.', 'warn');
                // Clear cached data on disconnection
                stations.clear();
                devices.clear();
            });

            /**
             * Device and Station Discovery Events
             * Handle addition and removal of stations and devices
             */
            eufyClient.on('station added', (station) => {
                addStation(station);
            });

            eufyClient.on("station removed", (station) => {
                stations.delete(station);
                utils.log(`⚠️ Station removed: ${station.getName()} (${station.getSerial()})`, 'warn');
            });

            eufyClient.on('device added', (device) => {
                addDevice(device)
            });

            eufyClient.on("device removed", (device) => {
                devices.delete(device);
                utils.log(`⚠️ Device removed: ${device.getName()} (${device.getSerial()})`, 'warn');
            });

            /**
             * Livestream Events
             * Handle video/audio stream data and forward to transcoding module
             */
            eufyClient.on("station livestream start", (station, device, metadata, videostream, audiostream) => {
                utils.log(`▶️ Livestream started for station: ${station.getName()}, device: ${device.getName()} (${device.getSerial()})`, 'debug');

                // Forward video chunks to transcoder with metadata
                videostream.on("data", (chunk) => {
                    transcode.handleVideoData(chunk, {
                        videoCodec: VideoCodec[metadata.videoCodec],
                        videoFPS: metadata.videoFPS,
                        videoHeight: metadata.videoHeight,
                        videoWidth: metadata.videoWidth,
                    });
                });

                // Forward audio chunks to transcoder with metadata
                audiostream.on("data", (chunk) => {
                    transcode.handleAudioData(chunk, {
                        audioCodec: AudioCodec[metadata.audioCodec],
                    })
                });

            });

            eufyClient.on("station livestream stop", (station, device) => {
                utils.log(`⏹️ Livestream stopped for station: ${station.getName()}, device: ${device.getName()} (${device.getSerial()})`, 'debug');
            });

            // eufyClient.on("station download start", (station, device, metadata, videostream, audiostream) => {
            //     utils.log(`⬇️ Recording download started for station: ${station.getName()}, device: ${device.getName()} (${device.getSerial()})`, 'info');
            // });

            // eufyClient.on("station download finish", (station, device) => {
            //     utils.log(`✅ Recording download finished for station: ${station.getName()}, device: ${device.getName()} (${device.getSerial()})`, 'info');
            // });

            /**
             * Station Image Download Event
             * Broadcasts downloaded images to WebSocket clients
             */
            eufyClient.on("station image download", (station, file, image) => {
                utils.log(`🖼️ Image downloaded from station: ${station.getName()} (${station.getSerial()}) - File: ${file}`, 'debug');

                // Broadcast image to all connected clients
                wsApi.wsBroadcast({
                    type: 'event',
                    event: {
                        source: "station",
                        event: 'image downloaded',
                        serialNumber: station.getSerial(),
                        file: file,
                        image: image
                    }
                });
            });

            // Establish connection to Eufy cloud
            await eufyClient.connect();
        } else {
            throw new Error('Eufy configuration parameters are missing. Please check the settings.');
        }
    } catch (error) {
        utils.log('❌ Error during initialization: ' + error.message, 'error');
    }
}

/**
 * Add Device
 * Registers a newly discovered device and sets up all event handlers
 * Broadcasts device events to WebSocket clients for real-time notifications
 * @param {Device} device - Eufy device object
 */
function addDevice(device) {
    utils.log('📷 Device found: ' + device.getName() + ' (' + device.getSerial() + ')', 'debug');
    devices.add(device);

    /**
     * Device Event Handlers
     * Register handlers for all device events and broadcast to WebSocket clients
     */

    // Motion detection event
    device.on("motion detected", (device, state) => {
        utils.log(`Motion detected on device: ${device.getName()} (${device.getSerial()}) - State: ${state}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "device",
                event: 'motion detected',
                serialNumber: device.getSerial(),
                state: state
            }
        });
    });

    // Person detection event
    device.on("person detected", (device, state, person) => {
        utils.log(`Person detected on device: ${device.getName()} (${device.getSerial()}) - State: ${state} - Person: ${person ? person : 'unknown'}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "device",
                event: 'person detected',
                serialNumber: device.getSerial(),
                state: state,
                person: person ? person : 'unknown'
            }
        });
    });

    // Audio detection events
    device.on("crying detected", (device, state) => {
        utils.log(`Crying detected on device: ${device.getName()} (${device.getSerial()}) - State: ${state}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "device",
                event: 'crying detected',
                serialNumber: device.getSerial(),
                state: state
            }
        });
    });

    // Pet detection event
    device.on("pet detected", (device, state) => {
        utils.log(`Pet detected on device: ${device.getName()} (${device.getSerial()}) - State: ${state}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "device",
                event: 'pet detected',
                serialNumber: device.getSerial(),
                state: state
            }
        });
    });

    // Vehicle detection event
    device.on("vehicle detected", (device, state) => {
        utils.log(`Vehicle detected on device: ${device.getName()} (${device.getSerial()}) - State: ${state}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "device",
                event: 'vehicle detected',
                serialNumber: device.getSerial(),
                state: state
            }
        });
    });

    // General sound detection event
    device.on("sound detected", (device, state) => {
        utils.log(`Sound detected on device: ${device.getName()} (${device.getSerial()}) - State: ${state}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "device",
                event: 'sound detected',
                serialNumber: device.getSerial(),
                state: state
            }
        });
    });

    // Doorbell ring event
    device.on("rings", (device, state) => {
        utils.log(`Doorbell rang on device: ${device.getName()} (${device.getSerial()}) - State: ${state}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "device",
                event: 'rings',
                serialNumber: device.getSerial(),
                state: state
            }
        });
    });

    // Package delivery events
    device.on("package delivered", (device, state) => {
        utils.log(`Package delivered detected on device: ${device.getName()} (${device.getSerial()}) - State: ${state}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "device",
                event: 'package delivered',
                serialNumber: device.getSerial(),
                state: state
            }
        });
    });
    device.on("package stranded", (device, state) => {
        utils.log(`Package stranded detected on device: ${device.getName()} (${device.getSerial()}) - State: ${state}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "device",
                event: 'packet stranded',
                serialNumber: device.getSerial(),
                state: state
            }
        });
    });
    device.on("package taken", (device, state) => {
        utils.log(`Package taken detected on device: ${device.getName()} (${device.getSerial()}) - State: ${state}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "device",
                event: 'package taken',
                serialNumber: device.getSerial(),
                state: state
            }
        });
    });

    // Loitering detection event
    device.on("someone loitering", (device, state) => {
        utils.log(`Loitering detected on device: ${device.getName()} (${device.getSerial()}) - State: ${state}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "device",
                event: 'someone loitering',
                serialNumber: device.getSerial(),
                state: state
            }
        });
    });

    // Radar motion detection event
    device.on("radar motion detected", (device, state) => {
        utils.log(`Radar motion detected on device: ${device.getName()} (${device.getSerial()}) - State: ${state}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "device",
                event: 'radar motion detected',
                serialNumber: device.getSerial(),
                state: state
            }
        });
    });

    // Door/window open event
    device.on("open", (device, state) => {
        utils.log(`Open event on device: ${device.getName()} (${device.getSerial()}) - State: ${state}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "device",
                event: 'open',
                serialNumber: device.getSerial(),
                state: state
            }
        });
    });

    // Alarm events
    device.on("911 alarm", (device, state, detail) => {
        utils.log(`911 alarm on device: ${device.getName()} (${device.getSerial()}) - State: ${state} - Detail: ${detail}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "device",
                event: '911 alarm',
                serialNumber: device.getSerial(),
                state: state,
                detail: detail
            }
        });
    });
    device.on("shake alarm", (device, state, detail) => {
        utils.log(`Shake alarm on device: ${device.getName()} (${device.getSerial()}) - State: ${state} - Detail: ${detail}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "device",
                event: 'shake alarm',
                serialNumber: device.getSerial(),
                state: state,
                detail: detail
            }
        });
    });
    device.on("wrong try-protect alarm", (device, state) => {
        utils.log(`Wrong try-protect alarm on device: ${device.getName()} (${device.getSerial()}) - State: ${state}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "device",
                event: 'wrong try-protect alarm',
                serialNumber: device.getSerial(),
                state: state
            }
        });
    });

    // Lock-related events
    device.on("long time not close", (device, state) => {
        utils.log(`Long time not close alarm on device: ${device.getName()} (${device.getSerial()}) - State: ${state}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "device",
                event: 'long time not close',
                serialNumber: device.getSerial(),
                state: state
            }
        });
    });
    device.on("jammed", (device, state) => {
        utils.log(`Jammed alarm on device: ${device.getName()} (${device.getSerial()}) - State: ${state}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "device",
                event: 'jammed',
                serialNumber: device.getSerial(),
                state: state
            }
        });
    });

    // Battery status event
    device.on("low battery", (device, state) => {
        utils.log(`Low battery on device: ${device.getName()} (${device.getSerial()}) - State: ${state}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "device",
                event: 'low battery',
                serialNumber: device.getSerial(),
                state: state
            }
        });
    });

    // Lock state changed event
    device.on("locked", (device, state) => {
        utils.log(`Locked state changed on device: ${device.getName()} (${device.getSerial()}) - State: ${state}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "device",
                event: 'locked',
                serialNumber: device.getSerial(),
                state: state
            }
        });
    });

    // AI-based detection events
    device.on("stranger person detected", (device, state) => {
        utils.log(`Stranger person detected on device: ${device.getName()} (${device.getSerial()}) - State: ${state}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "device",
                event: 'stranger person detected',
                serialNumber: device.getSerial(),
                state: state
            }
        });
    });
    device.on("dog detected", (device, state) => {
        utils.log(`Dog detected on device: ${device.getName()} (${device.getSerial()}) - State: ${state}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "device",
                event: 'dog detected',
                serialNumber: device.getSerial(),
                state: state
            }
        });
    });
    device.on("dog lick detected", (device, state) => {
        utils.log(`Dog lick detected on device: ${device.getName()} (${device.getSerial()}) - State: ${state}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "device",
                event: 'dog lick detected',
                serialNumber: device.getSerial(),
                state: state
            }
        });
    });
    device.on("dog poop detected", (device, state) => {
        utils.log(`Dog poop detected on device: ${device.getName()} (${device.getSerial()}) - State: ${state}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "device",
                event: 'dog poop detected',
                serialNumber: device.getSerial(),
                state: state
            }
        });
    });

    /**
     * Property Changed Event
     * Handles property changes on device and updates clients
     * Special handling for picture property to provide latest snapshots
     */
    device.on("property changed", (device, name, value, ready) => {
        if (ready && !name.startsWith("hidden-")) {
            utils.log(`Property changed on device: ${device.getName()} (${device.getSerial()}) - ${name}: ${JSON.stringify(value)}`, 'debug');

            // Check if a newer snapshot is available for picture property
            value = checkDevicePictureProperty(device.getSerial(), value);

            wsApi.wsBroadcast({
                type: 'event',
                event: {
                    source: "device",
                    event: 'property changed',
                    serialNumber: device.getSerial(),
                    name: name,
                    value: value
                }
            });

        } else utils.log(`Property changed on device: ${device.getName()} (${device.getSerial()}) - ${name}: ${JSON.stringify(value)} (not ready)`, 'debug');
    });

    // Tampering detection event
    device.on("tampering", (device, state) => {
        utils.log(`Tampering detected on device: ${device.getName()} (${device.getSerial()}) - State: ${state}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "device",
                event: 'tampering',
                serialNumber: device.getSerial(),
                state: state
            }
        });
    });

    // Temperature warning events
    device.on("low temperature", (device, state) => {
        utils.log(`📉 Low temperature on device: ${device.getName()} (${device.getSerial()}) - State: ${state}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "device",
                event: 'low temperature',
                serialNumber: device.getSerial(),
                state: state
            }
        });
    });
    device.on("high temperature", (device, state) => {
        utils.log(`📈 High temperature on device: ${device.getName()} (${device.getSerial()}) - State: ${state}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "device",
                event: 'high temperature',
                serialNumber: device.getSerial(),
                state: state
            }
        });
    });

    // Smart lock specific events
    device.on("pin incorrect", (device, state) => {
        utils.log(`❌ Incorrect PIN entered on device: ${device.getName()} (${device.getSerial()}) - State: ${state}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "device",
                event: 'pin incorrect',
                serialNumber: device.getSerial(),
                state: state
            }
        });
    });

    // Lid/cover stuck event (e.g., pet feeder)
    device.on("lid stuck", (device, state) => {
        utils.log(`⚠️ Lid stuck on device: ${device.getName()} (${device.getSerial()}) - State: ${state}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "device",
                event: 'lid stuck',
                serialNumber: device.getSerial(),
                state: state
            }
        });
    });

    // Battery fully charged event
    device.on("battery fully charged", (device, state) => {
        utils.log(`🔋 Battery fully charged on device: ${device.getName()} (${device.getSerial()}) - State: ${state}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "device",
                event: 'battery fully charged',
                serialNumber: device.getSerial(),
                state: state
            }
        });
    });
}

/**
 * Add Station
 * Registers a newly discovered station and sets up all event handlers
 * Broadcasts station events to WebSocket clients for real-time notifications
 * @param {Station} station - Eufy station object
 */
function addStation(station) {
    utils.log('🏠 Station found: ' + station.getName() + ' (' + station.getSerial() + ')', 'debug');
    stations.add(station);

    /**
     * Station Event Handlers
     * Register handlers for all station events and broadcast to WebSocket clients
     */

    // Station connection events
    station.on("connect", () => {
        utils.log(`✓ Station connected: ${station.getName()} (${station.getSerial()})`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "station",
                event: 'connect',
                serialNumber: station.getSerial()
            }
        });
    });
    station.on("close", () => {
        utils.log(`⚠️ Station connection closed: ${station.getName()} (${station.getSerial()})`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "station",
                event: 'close',
                serialNumber: station.getSerial()
            }
        });
    });
    station.on("connection error", () => {
        utils.log(`❌ Station connection error: ${station.getName()} (${station.getSerial()})`, 'warn');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "station",
                event: 'connection error',
                serialNumber: station.getSerial()
            }
        });
    });

    // Station mode change events
    station.on("guard mode", (station, guardMode) => {
        utils.log(`Station guard mode changed: ${station.getName()} (${station.getSerial()}) - Guard Mode: ${guardMode}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "station",
                event: 'guard mode',
                serialNumber: station.getSerial(),
                guardMode: guardMode
            }
        });
    });
    station.on("current mode", (station, currentMode) => {
        utils.log(`Station current mode changed: ${station.getName()} (${station.getSerial()}) - Current Mode: ${currentMode}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "station",
                event: 'current mode',
                serialNumber: station.getSerial(),
                currentMode: currentMode
            }
        });
    });

    // Alarm event
    station.on("alarm event", (station, alarmEvent) => {
        utils.log(`Station alarm event: ${station.getName()} (${station.getSerial()}) - Alarm Event: ${alarmEvent}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "station",
                event: 'alarm event',
                serialNumber: station.getSerial(),
                alarmEvent: alarmEvent
            }
        });
    });

    // RTSP stream URL event
    station.on("rtsp url", (station, channel, value) => {
        utils.log(`Station RTSP URL received: ${station.getName()} (${station.getSerial()}) - Channel: ${channel} - URL: ${value}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "station",
                event: 'rtsp url',
                serialNumber: station.getSerial(),
                channel: channel,
                value: value
            }
        });
    });

    /**
     * Command Result Event
     * Handles results from station commands
     * Special handling for livestream stop (1004) to restart if clients still connected
     */
    station.on("command result", (station, result) => {
        utils.log(`Station command result: ${station.getName()} (${station.getSerial()}) - ${JSON.stringify(result)}`, 'debug');

        // Handle livestream stop command (e.g., due to resolution change)
        if (result.command_type === 1004 && currentStreamingSN) {
            // Handle livestream_stop because of changed resolution
            if (utils.getActiveStreamClients().size !== 0) {
                // TODO: works not yet properly, needs testing and fixing

                utils.log('⚠️ Warning: Livestream stopped, but there are still active clients', 'warn');
                utils.log(`   Active clients: ${utils.getActiveStreamClients().size}`, 'debug');
                utils.log(`   Current device: ${currentStreamingSN}`, 'debug');
                utils.log(`   FFmpeg transcoding active: ${transcode.isTranscoding}`, 'debug');
                utils.log(`   Has init segment: ${transcode.hasInitSegment}`, 'debug');

                transcode.clearMetadata();
                startStreamForDevice(currentStreamingSN);

                utils.log(`🔄 Stream restart initiated at ${Date.now()}`, 'info');
            }
        }

        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "station",
                event: 'command result',
                serialNumber: station.getSerial(),
                command: result.command_type,
                returnCode: result.return_code,
                customData: result.customData
            }
        });
    });

    /**
     * Property Changed Event
     * Handles property changes on station and updates clients
     */
    station.on("property changed", (station, name, value, ready) => {
        if (ready && !name.startsWith("hidden-")) {
            utils.log(`Property changed on station: ${station.getName()} (${station.getSerial()}) - ${name}: ${JSON.stringify(value)}`, 'debug');
            wsApi.wsBroadcast({
                type: 'event',
                event: {
                    source: "station",
                    event: 'property changed',
                    serialNumber: station.getSerial(),
                    name: name,
                    value: value
                }
            });
        } else utils.log(`Property changed on station: ${station.getName()} (${station.getSerial()}) - ${name}: ${JSON.stringify(value)} (not ready)`, 'debug');
    });

    // Alarm delay events
    station.on("alarm delay event", (station, alarmDelayEvent, alarmDelay) => {
        utils.log(`Station alarm delay event: ${station.getName()} (${station.getSerial()}) - Event: ${alarmDelayEvent} - Delay: ${alarmDelay}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "station",
                event: 'alarm delay event',
                serialNumber: station.getSerial(),
                alarmDelayEvent: alarmDelayEvent,
                alarmDelay: alarmDelay
            }
        });
    });
    station.on("alarm armed event", (station) => {
        utils.log(`Station alarm armed: ${station.getName()} (${station.getSerial()})`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "station",
                event: 'alarm armed event',
                serialNumber: station.getSerial()
            }
        });
    });
    station.on("alarm arm delay event", (station, armDelay) => {
        utils.log(`Station alarm arm delay event: ${station.getName()} (${station.getSerial()}) - Delay: ${armDelay}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "station",
                event: 'alarm arm delay event',
                serialNumber: station.getSerial(),
                armDelay: armDelay
            }
        });
    });

    // Device PIN verification event
    station.on("device pin verified", (deviceSN, successfull) => {
        utils.log(`Device PIN verified: ${deviceSN} - Successful: ${successfull}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "station",
                event: 'device pin verified',
                serialNumber: station.getSerial(),
                deviceSN: deviceSN,
                successful: successfull
            }
        });
    });

    // Database query events
    station.on("database query latest", (station, returnCode, data) => {
        utils.log(`Database query latest on station: ${station.getName()} (${station.getSerial()}) - Return Code: ${returnCode} - Data: ${JSON.stringify(data)}`, 'debug');
        wsApi.wsBroadcast({
            type: 'event',
            event: {
                source: "station",
                event: 'database query latest',
                serialNumber: station.getSerial(),
                data: data
            }
        });
    });
    // station.on("database query local", (station, returnCode, data) => {
    //     utils.log(`Database query local on station: ${station.getName()} (${station.getSerial()}) - Return Code: ${returnCode} - Data: ${JSON.stringify(data)}`, 'info');
    // });
    // station.on("database count by date", (station, returnCode, data) => {
    //     utils.log(`Database count by date on station: ${station.getName()} (${station.getSerial()}) - Return Code: ${returnCode} - Data: ${JSON.stringify(data)}`, 'info');
    // });
    // station.on("database delete", (station, returnCode, failedIds) => {
    //     utils.log(`Database delete on station: ${station.getName()} (${station.getSerial()}) - Return Code: ${returnCode} - Failed IDs: ${failedIds.join(', ')}`, 'info');
    // });
}

/**
 * Start Stream for Device
 * Initiates livestream for specified device serial number
 * Checks connection status and prevents duplicate streams
 * @param {string} serialNumber - Device serial number to start streaming
 */
async function startStreamForDevice(serialNumber) {
    currentStreamingSN = null;

    // Verify Eufy client is connected
    if (!isConnected()) {
        utils.log('❌ Eufy client is not connected. Cannot start livestream.', 'error');
        return;
    }

    utils.log(`📲 Starting livestream for device: ${serialNumber}`, 'debug');
    const device = await eufyClient.getDevice(serialNumber);
    const station = await eufyClient.getStation(device.getStationSerial());

    // Check if stream is already active
    if (station.isLiveStreaming(device)) {
        utils.log(`ℹ️ Livestream for device ${device.getName()} (${device.getSerial()}) is already active.`, 'warn');
        currentStreamingSN = serialNumber;
        return;
    }

    station.startLivestream(device);
    currentStreamingSN = serialNumber;
    utils.log(`▶️ Livestream request sent for device: ${device.getName()} (${device.getSerial()})`, 'info');
}

/**
 * Stop Stream for Device
 * Stops active livestream for specified device serial number
 * @param {string} serialNumber - Device serial number to stop streaming
 */
async function stopStreamForDevice(serialNumber) {
    // Verify Eufy client is connected
    if (!isConnected()) {
        utils.log('❌ Eufy client is not connected. Cannot stop livestream.', 'error');
        return;
    }

    utils.log(`📲 Stopping livestream for device: ${serialNumber}`, 'debug');
    const device = await eufyClient.getDevice(serialNumber);
    const station = await eufyClient.getStation(device.getStationSerial());

    // Check if stream is actually active
    if (!station.isLiveStreaming(device)) {
        utils.log(`ℹ️ Livestream for device ${device.getName()} (${device.getSerial()}) is not active, no stop required.`, 'warn');
        return;
    }

    station.stopLivestream(device);
    currentStreamingSN = null;
    utils.log(`⏹️ Livestream stop request sent for device: ${device.getName()} (${device.getSerial()})`, 'info');
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
     * Returns current system state with stations and devices
     */
    wsApi.registerMessageHandler('start_listening', (message, ws) => {
        if (!isConnected()) { ws.close(); }

        return {
            type: 'result',
            messageId: 'start_listening',
            success: isConnected(),
            result: {
                state: {
                    client: {
                        version: eufyVersion,
                    },
                    stations: Array.from(stations).map(station => station.getSerial()),
                    devices: Array.from(devices).map(device => device.getSerial())
                }
            }
        };
    });

    /**
     * station.get_properties Command
     * Returns all properties for a specific station
     */
    wsApi.registerMessageHandler('station.get_properties', async (message, ws) => {
        if (!isConnected()) { ws.close(); }

        const station = await eufyClient.getStation(message.serialNumber);
        const properties = station.getProperties();
        return {
            type: 'result',
            messageId: 'station.get_properties',
            success: true,
            result: {
                serialNumber: station.getSerial(),
                properties: properties
            }
        };
    });

    /**
     * station.download_image Command
     * Downloads an image from station (async operation)
     */
    wsApi.registerMessageHandler('station.download_image', async (message, ws) => {
        if (!isConnected()) { ws.close(); }

        const station = await eufyClient.getStation(message.serialNumber);
        station.downloadImage(message.file);
        return {
            type: "result",
            success: true,
            messageId: "station.download_image",
            result: {
                async: true
            }
        };
    });

    /**
     * station.database_query_latest_info Command
     * Queries latest database info from station (async operation)
     */
    wsApi.registerMessageHandler('station.database_query_latest_info', async (message, ws) => {
        if (!isConnected()) { ws.close(); }

        const station = await eufyClient.getStation(message.serialNumber);
        station.databaseQueryLatestInfo();
        return {
            type: "result",
            success: true,
            messageId: "station.database_query_latest_info",
            result: {
                async: true
            }
        };
    });

    /**
     * device.get_properties Command
     * Returns all properties for a specific device
     * Includes special handling for picture property to provide latest snapshot
     */
    wsApi.registerMessageHandler('device.get_properties', async (message, ws) => {
        if (!isConnected()) { ws.close(); }

        const device = await eufyClient.getDevice(message.serialNumber);
        const properties = device.getProperties();

        // Check if a newer snapshot is available for picture property
        properties.picture = checkDevicePictureProperty(device.getSerial(), properties.picture);

        return {
            type: 'result',
            messageId: 'device.get_properties',
            success: true,
            result: {
                serialNumber: device.getSerial(),
                properties: properties
            }
        };
    });

    /**
     * device.get_commands Command
     * Returns all available commands for a specific device
     */
    wsApi.registerMessageHandler('device.get_commands', async (message, ws) => {
        if (!isConnected()) { ws.close(); }

        const device = await eufyClient.getDevice(message.serialNumber);
        const result = device.getCommands();
        return {
            type: 'result',
            messageId: 'device.get_commands',
            success: true,
            result: {
                serialNumber: device.getSerial(),
                commands: result
            }
        };
    });

    /**
     * device.preset_position Command
     * Moves PTZ camera to a preset position
     */
    wsApi.registerMessageHandler('device.preset_position', async (message, ws) => {
        if (!isConnected()) { ws.close(); }

        const device = await eufyClient.getDevice(message.serialNumber);
        const station = await eufyClient.getStation(device.getStationSerial());
        try {
            station.presetPosition(device, message.position)
        }
        catch (error) {
            utils.log(`❌ Error presetting position for device ${device.getName()} (${device.getSerial()}): ${error.message}`, 'error');
            return {
                type: "result",
                success: false,
                messageId: "device.preset_position",
                errorCode: error.message,
                value: message.position
            };
        };
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

        const device = await eufyClient.getDevice(message.serialNumber);
        const station = await eufyClient.getStation(device.getStationSerial());
        station.panAndTilt(device, message.direction);
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
 * Checks if Eufy client is currently connected
 * @returns {boolean} True if connected, false otherwise
 */
function isConnected() {
    return eufyClient ? eufyClient.isConnected() : false;
}

/**
 * Close Connection
 * Gracefully closes connection to Eufy Security system
 * @returns {Promise} Promise that resolves when connection is closed
 */
async function close() {
    if (eufyClient) {
        utils.log('Closing connection to Eufy...', 'info');
        return await eufyClient.close();
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
    startStreamForDevice,
    stopStreamForDevice,
    close
};