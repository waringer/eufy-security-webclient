const { EufySecurity, AudioCodec, VideoCodec } = require('eufy-security-client');
const eufyVersion = require('eufy-security-client/package.json').version;

const utils = require('./utils');
const transcode = require('./transcode');
const wsApi = require('./ws-api');

let eufyClient = null;
let wsEvnentHandlersRegistered = false;
let currentStreamingDevice = null;
let stations = new Set();
let devices = new Set();

async function connect(eufyConfig) {
    try {
        utils.log('Initializing Eufy Security Client...', 'info');

        if (eufyClient && eufyClient.isConnected()) {
            utils.log('✓ Eufy client is already connected.', 'warn');
            return;
        }

        if (eufyConfig.username && eufyConfig.password && eufyConfig.persistentDir && eufyConfig.country && eufyConfig.language) {
            eufyClient = await EufySecurity.initialize(eufyConfig);

            eufyClient.on('connect', () => {
                utils.log('✓ Successfully connected to Eufy!', 'info');
                registerWebSocketHandlers();
            });

            eufyClient.on("connection error", (error) => {
                utils.log('❌ Eufy connection error: ' + error, 'error');
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
                stations.clear();
                devices.clear();
            });

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

            eufyClient.on("station livestream start", (station, device, metadata, videostream, audiostream) => {
                utils.log(`▶️ Livestream started for station: ${station.getName()}, device: ${device.getName()} (${device.getSerial()})`, 'debug');

                videostream.on("data", (chunk) => {
                    transcode.handleVideoData(chunk, {
                        videoCodec: VideoCodec[metadata.videoCodec],
                        videoFPS: metadata.videoFPS,
                        videoHeight: metadata.videoHeight,
                        videoWidth: metadata.videoWidth,
                    });
                });

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

            eufyClient.on("station image download", (station, file, image) => {
                utils.log(`🖼️ Image downloaded from station: ${station.getName()} (${station.getSerial()}) - File: ${file}`, 'debug');

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

            await eufyClient.connect();
        } else {
            throw new Error('Eufy configuration parameters are missing. Please check the settings.');
        }
    } catch (error) {
        utils.log('❌ Error during initialization: ' + error.message, 'error');
    }
}

function addDevice(device) {
    utils.log('📷 Device found: ' + device.getName() + ' (' + device.getSerial() + ')', 'debug');
    devices.add(device);

    // Register events
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
    device.on("property changed", (device, name, value, ready) => {
        if (ready && !name.startsWith("hidden-")) {
            utils.log(`Property changed on device: ${device.getName()} (${device.getSerial()}) - ${name}: ${JSON.stringify(value)}`, 'debug');
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

function addStation(station) {
    utils.log('🏠 Station found: ' + station.getName() + ' (' + station.getSerial() + ')', 'debug');
    stations.add(station);

    // Register events
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
    station.on("command result", (station, result) => {
        utils.log(`Station command result: ${station.getName()} (${station.getSerial()}) - ${JSON.stringify(result)}`, 'debug');

        if (result.command_type === 1004) {
            // Handle stop because of changed resolution
            if (utils.getActiveStreamClients().size !== 0) {
                utils.log('⚠️ Warning: Livestream stopped, but there are still active clients', 'warn');
                transcode.clearMetadata();
                station.startLivestream(currentStreamingDevice);
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

async function startStreamForDevice(serialNumber) {
    if (!isConnected()) {
        utils.log('❌ Eufy client is not connected. Cannot start livestream.', 'error');
        return;
    }

    utils.log(`📲 Starting livestream for device: ${serialNumber}`, 'debug');
    const device = await eufyClient.getDevice(serialNumber);
    const station = await eufyClient.getStation(device.getStationSerial());

    if (station.isLiveStreaming(device)) {
        utils.log(`ℹ️ Livestream for device ${device.getName()} (${device.getSerial()}) is already active.`, 'warn');
        return;
    }

    station.startLivestream(device);
    currentStreamingDevice = device;
    utils.log(`▶️ Livestream request sent for device: ${device.getName()} (${device.getSerial()})`, 'info');
}

async function stopStreamForDevice(serialNumber) {
    if (!isConnected()) {
        utils.log('❌ Eufy client is not connected. Cannot stop livestream.', 'error');
        return;
    }

    utils.log(`📲 Stopping livestream for device: ${serialNumber}`, 'debug');
    const device = await eufyClient.getDevice(serialNumber);
    const station = await eufyClient.getStation(device.getStationSerial());

    if (!station.isLiveStreaming(device)) {
        utils.log(`ℹ️ Livestream for device ${device.getName()} (${device.getSerial()}) is not active, no stop required.`, 'warn');
        return;
    }

    station.stopLivestream(device);
    currentStreamingDevice = null;
    utils.log(`⏹️ Livestream stop request sent for device: ${device.getName()} (${device.getSerial()})`, 'info');
}

// Register WebSocket message handlers
function registerWebSocketHandlers() {
    if (wsEvnentHandlersRegistered) {
        return;
    }

    wsApi.registerMessageHandler('start_listening', (message, ws) => {
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

    wsApi.registerMessageHandler('station.get_properties', async (message, ws) => {
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

    wsApi.registerMessageHandler('station.download_image', async (message, ws) => {
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

    wsApi.registerMessageHandler('station.database_query_latest_info', async (message, ws) => {
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

    wsApi.registerMessageHandler('device.get_properties', async (message, ws) => {
        const device = await eufyClient.getDevice(message.serialNumber);
        const properties = device.getProperties();
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

    wsApi.registerMessageHandler('device.get_commands', async (message, ws) => {
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

    wsApi.registerMessageHandler('device.preset_position', async (message, ws) => {
        const device = await eufyClient.getDevice(message.serialNumber);
        const station = await eufyClient.getStation(device.getStationSerial());
        station.presetPosition(device, message.position);
        return {
            type: "result",
            success: true,
            messageId: "device.preset_position",
            result: {
                async: true
            }
        };
    });

    wsApi.registerMessageHandler('device.pan_and_tilt', async (message, ws) => {
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

function isConnected() {
    return eufyClient ? eufyClient.isConnected() : false;
}

async function close() {
    if (eufyClient) {
        utils.log('Closing connection to Eufy...', 'info');
        return await eufyClient.close();
    } else {
        utils.log('Eufy client is not initialized.', 'warn');
        return Promise.resolve();
    }
}

module.exports = {
    connect,
    isConnected,
    startStreamForDevice,
    stopStreamForDevice,
    close
};