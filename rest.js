const express = require('express');
const path = require('path');

const utils = require('./utils');
const eufy = require('./eufy-client');
const transcode = require('./transcode');
const wsApi = require('./ws-api');

const STATIC_DIR = process.env.STATIC_DIR || path.join(__dirname, 'public');

const app = express();
const PORT = 3001;

let currentDevice = null; // Currently streamed device

function initRestServer() {
    // **** Express HTTP Server ****

    utils.log(`📺 Stream URL: http://localhost:${PORT}/<SERIAL_NUMBER>.mp4`, 'info');
    utils.log(`📁 Static files from: ${STATIC_DIR}`, 'info');

    // JSON body parser middleware
    app.use(express.json());

    // CORS Headers
    app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Range');
        next();
    });

    // fMP4 Live Stream Endpoint with device selection
    app.get('/:serialNumber.mp4', (req, res) => {
        const requestedDevice = req.params.serialNumber;

        // Validate serial number (alphanumeric)
        if (!/^[A-Z0-9]+$/i.test(requestedDevice)) {
            return res.status(400).json({
                error: 'Invalid serial number format',
                message: 'Serial number must be alphanumeric'
            });
        }

        // Check if another device is already streaming
        if (currentDevice && currentDevice !== requestedDevice) {
            utils.log(`❌ Request for ${requestedDevice} denied - ${currentDevice} is already streaming`, 'warn');
            return res.status(409).json({
                error: 'Device already streaming',
                message: `Another device (${currentDevice}) is currently streaming. Please wait until it's finished.`,
                currentDevice: currentDevice,
                requestedDevice: requestedDevice
            });
        }

        utils.log(`👁️ New stream client for ${requestedDevice} (${utils.getActiveStreamClients().size + 1} active)`, 'info');

        // HTTP headers for fMP4 streaming
        res.writeHead(200, {
            'Content-Type': 'video/mp4',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Connection': 'keep-alive',
            'Transfer-Encoding': 'chunked'
        });

        // Set current device
        if (!currentDevice) {
            currentDevice = requestedDevice;
            utils.log(`📹 Device set: ${currentDevice}`, 'info');
        }

        // Start connection if not active
        eufy.startStreamForDevice(requestedDevice);

        // Add client to set
        const clientStream = {
            response: res,
            active: true,
            device: requestedDevice,
            hasReceivedInit: false,
            listenerRegistered: false
        };
        utils.addActiveStreamClient(clientStream);

        // Register output stream listener IMMEDIATELY (before transcoding even starts)
        // This ensures the first client doesn't miss any data
        const streamDataHandler = (chunk) => {
            if (clientStream.active && !res.writableEnded && clientStream.hasReceivedInit) {
                try {
                    res.write(chunk);
                } catch (e) {
                    utils.log(`Stream write error: ${e}`, 'error');
                    clientStream.active = false;
                }
            }
        };

        // Wait until transcoding is running and init segment is available
        const waitForStream = setInterval(() => {
            const outputStream = transcode.getOutputStream;
            if (outputStream && transcode.isTranscoding) {
                // Register listener if not already done
                if (!clientStream.listenerRegistered) {
                    outputStream.on('data', streamDataHandler);
                    clientStream.listenerRegistered = true;
                    utils.log(`🎧 Registered stream listener for client`, 'debug');
                }

                // If we have init segment, send it immediately
                const initSegment = transcode.getInitSegment;
                if (initSegment && !clientStream.hasReceivedInit) {
                    utils.log(`📦 Sending init segment to client (${initSegment.length} bytes)`, 'debug');
                    try {
                        res.write(initSegment);
                        clientStream.hasReceivedInit = true;
                        clearInterval(waitForStream);
                    } catch (e) {
                        utils.log(`Init segment write error: ${e}`, 'error');
                        clientStream.active = false;
                        clearInterval(waitForStream);
                    }
                } else if (!initSegment) {
                    utils.log(`⏳ Waiting for init segment...`, 'debug');
                }
            }
        }, 100);

        // Timeout after 10 seconds
        setTimeout(() => {
            clearInterval(waitForStream);
            if (!res.headersSent) {
                res.status(503).send('Stream not ready');
            }
        }, 10000);

        // Client disconnect handling
        req.on('close', () => {
            clearInterval(waitForStream);

            // Remove stream listener if registered
            const outputStream = transcode.getOutputStream;
            if (clientStream.listenerRegistered && outputStream) {
                outputStream.removeListener('data', streamDataHandler);
            }

            // Remove client from set
            for (let client of utils.getActiveStreamClients()) {
                if (client.response === res) {
                    client.active = false;
                    utils.removeActiveStreamClient(client);
                    break;
                }
            }

            utils.log(`👁️ Stream client lost (${utils.getActiveStreamClients().size} active)`, 'info');

            // Stop if no clients are left
            if (utils.getActiveStreamClients().size === 0) {
                setTimeout(() => {
                    if (utils.getActiveStreamClients().size === 0) {
                        eufy.stopStreamForDevice(requestedDevice);
                        transcode.stopTranscoding();

                        // Reset currentDevice after a short delay
                        setTimeout(() => {
                            if (utils.getActiveStreamClients().size === 0) {
                                utils.log(`📹 Device released: ${currentDevice}`, 'info');
                                currentDevice = null;
                            }
                        }, 2000);
                    }
                }, 5000);
            }
        });
    });

    // Config GET endpoint - returns current configuration
    app.get('/config', (req, res) => {
        res.json(utils.loadConfig());
    });

    // Config POST endpoint - updates configuration
    app.post('/config', (req, res) => {
        const newConfig = req.body;
        utils.log(`📝 Config update requested: ${JSON.stringify(newConfig)}`, 'debug');

        // Validate and update CONFIG
        const allowedKeys = ['EUFY_CONFIG', 'TRANSCODING_PRESET', 'TRANSCODING_CRF', 'VIDEO_SCALE', 'FFMPEG_THREADS', 'FFMPEG_SHORT_KEYFRAMES'];
        const updatedFields = [];

        let CONFIG = utils.loadConfig();
        for (const key of Object.keys(newConfig)) {
            if (allowedKeys.includes(key)) {
                // Only add to updatedFields if value actually changed
                if (JSON.stringify(CONFIG[key]) !== JSON.stringify(newConfig[key])) {
                    CONFIG[key] = newConfig[key];
                    updatedFields.push(key);
                }
            }
        }

        if (updatedFields.length > 0) {
            utils.log(`✅ Config updated: ${updatedFields.join(', ')}`, 'debug');

            // Save configuration to file
            const saved = utils.saveConfig(CONFIG);

            // Reinitialize services only if relevant fields changed
            const transcodingFields = ['TRANSCODING_PRESET', 'TRANSCODING_CRF', 'VIDEO_SCALE', 'FFMPEG_THREADS', 'FFMPEG_SHORT_KEYFRAMES'];
            const eufyFields = ['EUFY_CONFIG'];

            const needsTranscodeRestart = updatedFields.some(field => transcodingFields.includes(field));
            const needsEufyRestart = updatedFields.some(field => eufyFields.includes(field));

            if (needsTranscodeRestart) {
                utils.log('🔄 Restarting transcoding due to config changes', 'debug');
                transcode.stopTranscoding();
                transcode.initTranscode();
            }

            if (needsEufyRestart) {
                utils.log('🔄 Restarting Eufy client due to config changes', 'debug');
                eufy.close();
                eufy.connect(CONFIG.EUFY_CONFIG);
            }

            res.json({
                success: true,
                message: 'Configuration updated successfully',
                updatedFields: updatedFields,
                saved: saved,
                config: CONFIG
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'No valid configuration fields provided',
                allowedFields: allowedKeys
            });
        }
    });

    // Health check endpoint
    app.get('/health', (req, res) => {
        res.json({
            status: 'ok',
            eufyConnected: eufy.isConnected(),
            eufyVideo: transcode.videoMetadata,
            eufyAudio: transcode.audioMetadata,
            streamClients: utils.getActiveStreamClients().size,
            transcoding: transcode.isTranscoding,
            currentDevice: currentDevice,
            transcodeScale: transcode.videoScale,
            hasInitSegment: transcode.hasInitSegment,
            hasKeyframeSegment: transcode.hasKeyframeSegment
        });
    });

    app.get('/quit', (req, res) => {
        res.json({ status: 'shutting down' });
        utils.log('🛑 Shutting down...', 'warn');
        transcode.stopTranscoding();
        process.exit(0);
    });

    // Static file server
    app.use(express.static(STATIC_DIR, {
        index: 'index.html',
        extensions: ['html', 'htm']
    }));

    const server = app.listen(PORT, () => {
        utils.log(`🌐 HTTP server running at http://localhost:${PORT}`, 'info');
        utils.log(`📺 Stream format: http://localhost:${PORT}/<SERIAL_NUMBER>.mp4`, 'info');
    });

    // Initialize WebSocket Server on /api path
    wsApi.initWebSocketServer(server, PORT, getServerStatus);
}

/**
 * Returns current server status for WebSocket API
 */
function getServerStatus() {
    return {
        eufyConnected: eufy.isConnected(),
        streamClients: utils.getActiveStreamClients().size,
        transcoding: transcode.isTranscoding,
        currentDevice: currentDevice,
        wsClients: wsApi.getClientCount(),
        videoMetadata: transcode.videoMetadata,
        audioMetadata: transcode.audioMetadata
    };
}

module.exports = {
    initRestServer,
    wsEmitEvent: wsApi.wsEmitEvent,
    wsBroadcast: wsApi.wsBroadcast
};