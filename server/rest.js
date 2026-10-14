/**
 * REST API Server Module
 * 
 * Provides HTTP endpoints for:
 * - Live video streaming via fMP4 format
 * - Configuration management (GET/POST)
 * - Health status monitoring
 * - Static file serving for web UI
 * - WebSocket API integration
 */

const express = require('express');
const path = require('path');

const utils = require('./utils');
const eufy = require('./eufy-client');
const transcode = require('./transcode');
const wsApi = require('./ws-api');

// Directory for static files (HTML, CSS, JS)
const STATIC_DIR = process.env.STATIC_DIR || path.join(require.main.path, 'public');

const app = express();
const PORT = 3001;

// Currently active streaming device (only one device can stream at a time)
let currentDevice = null;

/**
 * Initialize REST API Server
 * Sets up all HTTP endpoints, middleware, and WebSocket integration
 */
function initRestServer() {
    utils.log(`📺 Stream URL: http://localhost:${PORT}/<SERIAL_NUMBER>.mp4`, 'info');
    utils.log(`📁 Static files from: ${STATIC_DIR}`, 'info');

    // Enable JSON body parsing for POST requests
    app.use(express.json());

    // Enable CORS for cross-origin requests from web clients
    app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Range');
        next();
    });

    /**
     * fMP4 Live Stream Endpoint
     * Route: GET /:serialNumber.mp4
     * 
     * Streams live video from a Eufy device in fMP4 format.
     * Only one device can stream at a time to prevent resource conflicts.
     */
    /**
     * Event Thumbnail Endpoint
     * Route: GET /event-thumb/:recordId
     *
     * JPEG thumbnail of an event from the station's history (fetched over P2P, cached on disk).
     * Only record ids of event lists this server delivered are known.
     */
    app.get('/event-thumb/:recordId', async (req, res) => {
        const recordId = req.params.recordId;
        if (!/^\d{1,20}$/.test(recordId)) {
            return res.status(400).send('Invalid record id');
        }

        try {
            const jpeg = await eufy.getEventThumbnail(recordId);
            if (!jpeg) return res.status(404).send('Unknown event');

            res.set('Content-Type', 'image/jpeg');
            res.set('Cache-Control', 'public, max-age=86400, immutable');   // a record id never changes its image
            res.send(jpeg);
        } catch (error) {
            utils.log(`❌ Event thumbnail ${recordId}: ${error.message}`, 'warn');
            res.status(502).send('Thumbnail not available');
        }
    });

    /**
     * Event Detection Picture Endpoint
     * Route: GET /event-crop/:pictureId
     *
     * JPEG of what the station's AI detected in an event (fetched over P2P, cached on disk).
     * Only picture ids of event lists this server delivered are known.
     */
    app.get('/event-crop/:pictureId', async (req, res) => {
        const pictureId = req.params.pictureId;
        if (!/^\d{1,20}$/.test(pictureId)) {
            return res.status(400).send('Invalid picture id');
        }

        try {
            const jpeg = await eufy.getEventCropPicture(pictureId);
            if (!jpeg) return res.status(404).send('Unknown picture');

            res.set('Content-Type', 'image/jpeg');
            res.set('Cache-Control', 'public, max-age=86400, immutable');   // a picture id never changes its image
            res.send(jpeg);
        } catch (error) {
            utils.log(`❌ Event detection picture ${pictureId}: ${error.message}`, 'warn');
            res.status(502).send('Picture not available');
        }
    });

    app.get('/:serialNumber.mp4', (req, res) => {
        const requestedDevice = req.params.serialNumber;

        // Validate serial number format (must be alphanumeric)
        if (!/^[A-Z0-9]+$/i.test(requestedDevice)) {
            return res.status(400).json({
                error: 'Invalid serial number format',
                message: 'Serial number must be alphanumeric'
            });
        }

        // Prevent multiple simultaneous streams (resource limitation)
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

        // Set HTTP headers optimized for live fMP4 streaming
        res.writeHead(200, {
            'Content-Type': 'video/mp4',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Connection': 'keep-alive',
            'Transfer-Encoding': 'chunked'
        });

        // Set this device as the active streaming device
        if (!currentDevice) {
            currentDevice = requestedDevice;
            utils.log(`📹 Device set: ${currentDevice}`, 'info');
        }

        // Initialize Eufy stream and transcoding for this device
        eufy.startStreamForDevice(requestedDevice);
        transcode.currentDevice = requestedDevice;

        // Create client stream object to track this connection
        const clientStream = {
            response: res,
            active: true,
            device: requestedDevice,
            hasReceivedInit: false,
            listenerRegistered: false
        };
        utils.addActiveStreamClient(clientStream);

        /**
         * Stream data handler
         * Forwards transcoded video chunks to the HTTP client.
         * Registered immediately to ensure no data is missed.
         */
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

        /**
         * Wait for transcoding to start and init segment to be ready
         * The init segment contains essential fMP4 metadata that must be
         * sent before any media data
         */
        const waitForStream = setInterval(() => {
            const outputStream = transcode.getOutputStream;
            if (outputStream && transcode.isTranscoding) {
                // Register stream listener (only once per client)
                if (!clientStream.listenerRegistered) {
                    outputStream.on('data', streamDataHandler);
                    clientStream.listenerRegistered = true;
                    utils.log(`🎧 Registered stream listener for client`, 'debug');
                }

                // Send fMP4 init segment to client (contains codec info, timescale, etc.)
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

        // Timeout after 10 seconds if stream doesn't start
        setTimeout(() => {
            clearInterval(waitForStream);
            if (!res.headersSent) {
                res.status(503).send('Stream not ready');
            }
        }, 10000);

        /**
         * Handle client disconnection
         * Cleanup resources and stop streaming if no clients remain
         */
        req.on('close', () => {
            clearInterval(waitForStream);

            // Cleanup stream listener to prevent memory leaks
            const outputStream = transcode.getOutputStream;
            if (clientStream.listenerRegistered && outputStream) {
                outputStream.removeListener('data', streamDataHandler);
            }

            // Remove this client from active clients list
            for (let client of utils.getActiveStreamClients()) {
                if (client.response === res) {
                    client.active = false;
                    utils.removeActiveStreamClient(client);
                    break;
                }
            }

            utils.log(`👁️ Stream client lost (${utils.getActiveStreamClients().size} active)`, 'info');

            // Stop streaming if all clients have disconnected (with grace period)
            if (utils.getActiveStreamClients().size === 0) {
                // Wait 5 seconds before stopping (allows quick reconnections)
                setTimeout(() => {
                    if (utils.getActiveStreamClients().size === 0) {
                        eufy.stopStreamForDevice(requestedDevice);
                        transcode.stopTranscoding();

                        // Release device after additional 2 second delay
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

    /**
     * Configuration GET Endpoint
     * Route: GET /config
     * Returns current server configuration
     */
    app.get('/config', (req, res) => {
        res.json(utils.loadConfig());
    });

    /**
     * Configuration POST Endpoint
     * Route: POST /config
     * Updates server configuration dynamically
     * Restarts affected services automatically
     */
    app.post('/config', (req, res) => {
        const newConfig = req.body;
        // Never write the password into the log (the log is visible in the web UI)
        const loggedConfig = newConfig.EUFY_CONFIG && 'password' in newConfig.EUFY_CONFIG
            ? { ...newConfig, EUFY_CONFIG: { ...newConfig.EUFY_CONFIG, password: '***' } }
            : newConfig;
        utils.log(`📝 Config update requested: ${JSON.stringify(loggedConfig)}`, 'debug');

        // Whitelist of allowed configuration keys for security
        const allowedKeys = ['EUFY_CONFIG', 'TRANSCODING_PRESET', 'TRANSCODING_CRF', 'VIDEO_SCALE', 'FFMPEG_THREADS', 'FFMPEG_SHORT_KEYFRAMES',
            'HWACCEL', 'LOG_LEVEL', 'FFMPEG_LOG_LEVEL', 'SDK_LOG_LEVEL'];
        // Log levels and hardware acceleration must be one of the known values
        const validValues = {
            HWACCEL: ['none', 'vaapi'],
            LOG_LEVEL: utils.LOG_LEVELS.map((_, level) => level),
            FFMPEG_LOG_LEVEL: utils.FFMPEG_LOG_LEVELS,
            SDK_LOG_LEVEL: utils.SDK_LOG_LEVELS
        };
        if ('LOG_LEVEL' in newConfig) newConfig.LOG_LEVEL = parseInt(newConfig.LOG_LEVEL, 10);
        const invalid = Object.keys(validValues).filter(key => key in newConfig && !validValues[key].includes(newConfig[key]));
        if (invalid.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Invalid value for ${invalid.join(', ')}`
            });
        }

        if (!Object.keys(newConfig).some(key => allowedKeys.includes(key))) {
            return res.status(400).json({
                success: false,
                message: 'No valid configuration fields provided',
                allowedFields: allowedKeys
            });
        }

        const updatedFields = [];

        let CONFIG = utils.loadConfig();
        for (const key of Object.keys(newConfig)) {
            if (allowedKeys.includes(key)) {
                // Track only fields that actually changed (avoid unnecessary restarts).
                // EUFY_CONFIG is merged first: the form does not send every subfield (e.g. persistentDir)
                const next = key === 'EUFY_CONFIG' ? { ...CONFIG[key], ...newConfig[key] } : newConfig[key];
                if (JSON.stringify(CONFIG[key]) !== JSON.stringify(next)) {
                    CONFIG[key] = next;
                    updatedFields.push(key);
                }
            }
        }

        if (updatedFields.length > 0) {
            utils.log(`✅ Config updated: ${updatedFields.join(', ')}`, 'debug');

            // Persist configuration changes to disk
            if (!utils.saveConfig(CONFIG)) {
                return res.status(500).json({
                    success: false,
                    message: 'Configuration could not be saved (see server log)'
                });
            }

            // Determine which services need to be restarted based on changed fields
            const transcodingFields = ['TRANSCODING_PRESET', 'TRANSCODING_CRF', 'VIDEO_SCALE', 'FFMPEG_THREADS', 'FFMPEG_SHORT_KEYFRAMES', 'HWACCEL', 'FFMPEG_LOG_LEVEL'];
            const eufyFields = ['EUFY_CONFIG'];

            const needsTranscodeRestart = updatedFields.some(field => transcodingFields.includes(field));
            const needsEufyRestart = updatedFields.some(field => eufyFields.includes(field));

            // Server and SDK log level apply at once, no restart needed
            utils.applyLogConfig(CONFIG);

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
                saved: true,
                config: CONFIG
            });
        } else {
            // Valid fields, but nothing changed: not an error
            res.json({
                success: true,
                message: 'Configuration unchanged',
                updatedFields: [],
                saved: true,
                config: CONFIG
            });
        }
    });

    /**
     * Server Log Download
     * Route: GET /logs
     * Returns the buffered server log (last entries) as text file
     */
    app.get('/logs', (req, res) => {
        const text = utils.getLogBuffer()
            .map(entry => `${entry.time} [${entry.level.toUpperCase()}] ${entry.message}`)
            .join('\n');
        res.setHeader('Content-Disposition', 'attachment; filename="eufy-server.log"');
        res.type('text/plain').send(text + '\n');
    });

    /**
     * Health Check Endpoint
     * Route: GET /health
     * Returns current server status and streaming information
     */
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

    /**
     * Shutdown Endpoint
     * Route: GET /quit
     * Gracefully shuts down the server
     */
    app.get('/quit', (req, res) => {
        res.json({ status: 'shutting down' });
        utils.log('🛑 Shutting down...', 'warn');
        transcode.stopTranscoding();
        process.exit(0);
    });

    // Serve static files (HTML, CSS, JS) for the web UI
    app.use(express.static(STATIC_DIR, {
        index: 'index.html',
        extensions: ['html', 'htm'],
        // Always revalidate (ETag): the UI files change with the server, a stale cached script talks
        // the old protocol to the new server
        setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache')
    }));

    const server = app.listen(PORT, () => {
        utils.log(`🌐 HTTP server running at http://localhost:${PORT}`, 'info');
        utils.log(`📺 Stream format: http://localhost:${PORT}/<SERIAL_NUMBER>.mp4`, 'info');
    });

    // Initialize WebSocket API on /api path for real-time communication
    wsApi.initWebSocketServer(server, PORT, getServerStatus);
}

/**
 * Get Server Status
 * Returns current operational status for WebSocket API and monitoring
 * @returns {Object} Server status including connection states and active streams
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