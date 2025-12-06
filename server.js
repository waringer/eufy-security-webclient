// eufy-security-ws Streaming Proxy Server
// npm install ws express

const express = require('express');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const { PassThrough } = require('stream');
const path = require('path');
const { transcode } = require('buffer');

const app = express();
const PORT = 3001;

// Connection to the original eufy-security-ws
const EUFY_WS_URL = process.env.EUFY_WS_URL || 'ws://localhost:3000';
const LOGGINGLEVEL = process.env.LOGGINGLEVEL || '2';
const TRANSCODING_PRESET = process.env.TRANSCODING_PRESET || 'ultrafast';
const TRANSCODING_CRF = process.env.TRANSCODING_CRF || '23';
const VIDEO_SCALE = process.env.VIDEO_SCALE || '1280:-2';
const FFMPEG_THREADS = process.env.FFMPEG_THREADS || '4';
const FFMPEG_SHORT_KEYFRAMES = process.env.FFMPEG_SHORT_KEYFRAMES === 'true' || false;
const FFMPEG_MINLOGLEVEL = process.env.FFMPEG_MINLOGLEVEL || 'warning';
const STATIC_DIR = process.env.STATIC_DIR || path.join(__dirname, 'public');

// Streams and state
let eufyWs = null;
let ffmpegProcess = null;
let h265InputStream = null;
let aacInputStream = null;
let outputStream = null;
let isTranscoding = false;
let videoMetadata = null;
let audioMetadata = null;
let activeStreamClients = new Set();
let currentDevice = null; // Currently streamed device

// fMP4 init segment management
let initSegment = null;
let isCapturingInit = true;
let lastKeyframeSegment = null; // Store last complete moof+mdat starting with keyframe

log('🚀 eufy-security-ws Streaming Proxy started', 'info');
log(`📺 Stream URL: http://localhost:${PORT}/<SERIAL_NUMBER>.mp4`, 'info');
log(`🔗 Connecting to eufy-security-ws: ${EUFY_WS_URL}`, 'info');
log(`📁 Static files from: ${STATIC_DIR}`, 'info');

// CORS Headers
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
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
        log(`❌ Request for ${requestedDevice} denied - ${currentDevice} is already streaming`, 'warn');
        return res.status(409).json({
            error: 'Device already streaming',
            message: `Another device (${currentDevice}) is currently streaming. Please wait until it's finished.`,
            currentDevice: currentDevice,
            requestedDevice: requestedDevice
        });
    }

    log(`👁️ New stream client for ${requestedDevice} (${activeStreamClients.size + 1} active)`, 'info');

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
        log(`📹 Device set: ${currentDevice}`, 'info');
    }

    // Start connection if not active
    if (!eufyWs) {
        connectToEufyWs(requestedDevice);
    }

    // Add client to set
    const clientStream = {
        response: res,
        active: true,
        device: requestedDevice,
        hasReceivedInit: false,
        listenerRegistered: false
    };
    activeStreamClients.add(clientStream);

    // Register output stream listener IMMEDIATELY (before transcoding even starts)
    // This ensures the first client doesn't miss any data
    const streamDataHandler = (chunk) => {
        if (clientStream.active && !res.writableEnded && clientStream.hasReceivedInit) {
            try {
                res.write(chunk);
            } catch (e) {
                log(`Stream write error: ${e}`, 'error');
                clientStream.active = false;
            }
        }
    };

    // Wait until transcoding is running and init segment is available
    const waitForStream = setInterval(() => {
        if (outputStream && isTranscoding) {
            // Register listener if not already done
            if (!clientStream.listenerRegistered) {
                outputStream.on('data', streamDataHandler);
                clientStream.listenerRegistered = true;
                log(`🎧 Registered stream listener for client`, 'debug');
            }

            // If we have init segment, send it immediately
            if (initSegment && !clientStream.hasReceivedInit) {
                log(`📦 Sending init segment to client (${initSegment.length} bytes)`, 'debug');
                try {
                    res.write(initSegment);
                    clientStream.hasReceivedInit = true;
                    clearInterval(waitForStream);
                } catch (e) {
                    log(`Init segment write error: ${e}`, 'error');
                    clientStream.active = false;
                    clearInterval(waitForStream);
                }
            } else if (!initSegment) {
                log(`⏳ Waiting for init segment...`, 'debug');
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
        if (clientStream.listenerRegistered && outputStream) {
            outputStream.removeListener('data', streamDataHandler);
        }

        // Remove client from set
        for (let client of activeStreamClients) {
            if (client.response === res) {
                client.active = false;
                activeStreamClients.delete(client);
                break;
            }
        }

        log(`👁️ Stream client lost (${activeStreamClients.size} active)`, 'info');

        // Stop if no clients are left
        if (activeStreamClients.size === 0) {
            setTimeout(() => {
                if (activeStreamClients.size === 0) {
                    stopTranscoding();
                    if (eufyWs) {
                        log(`🔌 Disconnecting from eufy-security-ws (Device: ${currentDevice}) due to inactivity...`, 'info');
                        eufyWs.send(JSON.stringify({
                            messageId: 'device.stop_livestream',
                            command: 'device.stop_livestream',
                            serialNumber: currentDevice
                        }));
                    }
                    // Reset currentDevice after a short delay
                    setTimeout(() => {
                        if (activeStreamClients.size === 0) {
                            log(`📹 Device released: ${currentDevice}`, 'info');
                            currentDevice = null;
                        }
                    }, 2000);
                }
            }, 5000);
        }
    });
});

function connectToEufyWs(serialNumber) {
    log('🔌 Connecting to eufy-security-ws...', 'debug');

    eufyWs = new WebSocket(EUFY_WS_URL);

    eufyWs.on('open', () => {
        log('✅ Connected to eufy-security-ws', 'info');
    });

    eufyWs.on('message', (data) => {
        try {
            const message = JSON.parse(data);

            switch (message.type) {
                case 'version':
                    eufyWs.send(JSON.stringify({
                        messageId: 'set_api_schema',
                        command: 'set_api_schema',
                        schemaVersion: 21
                    }));
                    break;

                case 'result':
                    switch (message.messageId) {
                        case 'set_api_schema':
                            eufyWs.send(JSON.stringify({
                                messageId: 'start_listening',
                                command: 'start_listening'
                            }));
                            break;
                        case 'start_listening':
                            log(`📡 Starting livestream for device: ${serialNumber}`, 'info');
                            eufyWs.send(JSON.stringify({
                                messageId: 'device.start_livestream',
                                command: 'device.start_livestream',
                                serialNumber: serialNumber
                            }));
                            break;
                        case 'device.start_livestream':
                            if (message.success !== true) {
                                log(`❌ Livestream could not be started: ${JSON.stringify(message)}`, 'error');
                                activeStreamClients.forEach(client => {
                                    try {
                                        client.response.end();
                                        client.response.close();
                                    } catch (e) {
                                        // Ignore
                                    }
                                });

                            }
                            break;
                        case 'device.stop_livestream':
                            log('ℹ️ Livestream stopped by eufy-security-ws', 'info');
                            eufyWs.close();
                            eufyWs = null;
                            break;
                        default:
                            log(`Unknown result from eufy-security-ws: ${JSON.stringify(message)}`, 'warn');
                    }
                    break;

                case 'event':
                    if (message.event) {
                        switch (message.event.event) {
                            case 'livestream video data':
                                handleVideoData(message.event);
                                break;
                            case 'livestream audio data':
                                handleAudioData(message.event);
                                break;
                            case 'livestream started':
                                log('✅ Livestream started', 'debug');
                                break;
                            case 'livestream stopped':
                                log('ℹ️ Livestream stopped', 'debug');
                                break;
                            case 'command result':
                                switch (message.event.command) {
                                    case 'start_livestream':
                                        log('✅ Livestream start confirmed', 'debug');
                                        break;
                                    case 'stop_livestream':
                                        log('✅ Livestream stop confirmed', 'debug');
                                        if (activeStreamClients.size !== 0) {
                                            log('⚠️ Warning: Livestream stopped, but there are still active clients', 'warn');
                                            eufyWs.send(JSON.stringify({
                                                messageId: 'device.start_livestream',
                                                command: 'device.start_livestream',
                                                serialNumber: serialNumber
                                            }));
                                            videoMetadata = null;
                                            audioMetadata = null;
                                        }
                                        break;
                                    default:
                                        // Optional: Handle command results if needed
                                        log(`Command result from eufy-security-ws: ${JSON.stringify(message.event)}`, 'debug');
                                }
                                break;
                            case 'property changed':
                                switch (message.event.name) {
                                    case 'wifiRssi':
                                        log(`📶 WiFi RSSI changed: ${message.event.value} dBm`, 'debug');
                                        break;
                                    default:
                                        log(`Property change from eufy-security-ws: ${JSON.stringify(message.event)}`, 'debug');
                                }
                                break;
                            default:
                                log(`Unknown event from eufy-security-ws: ${JSON.stringify(message)}`, 'debug');
                                break;
                        }
                    }
                    break;
                default:
                    log(`Unknown message from eufy-security-ws: ${JSON.stringify(message)}`, 'debug');
            }
        } catch (e) {
            log(`Eufy WS message parse error: ${e}`, 'error');
        }
    });

    eufyWs.on('error', (error) => {
        log(`❌ eufy-security-ws error: ${error}`, 'error');
    });

    eufyWs.on('close', () => {
        log('❌ eufy-security-ws connection closed', 'warn');
        eufyWs = null;
        stopTranscoding();
    });
}

function handleVideoData(event) {
    const { buffer, metadata } = event;

    // Store metadata on first frame
    if (!videoMetadata && metadata) {
        videoMetadata = metadata;
        log(`📹 Video: ${metadata.videoCodec} ${metadata.videoWidth}x${metadata.videoHeight} @ ${metadata.videoFPS}fps`, 'info');
    }

    // Start transcoding if not running
    if (!isTranscoding) {
        startTranscoding();
    }

    // Write H.265 data to ffmpeg input stream
    if (h265InputStream && buffer && buffer.data) {
        const uint8Array = new Uint8Array(buffer.data);
        try {
            h265InputStream.write(Buffer.from(uint8Array));
        } catch (e) {
            log(`Video stream write error: ${e}`, 'error');
        }
    }
}

function handleAudioData(event) {
    const { buffer, metadata } = event;

    // Store metadata on first audio frame
    if (!audioMetadata && metadata) {
        audioMetadata = metadata;
        log(`🔊 Audio: ${metadata.audioCodec}`, 'info');
    }

    // Start transcoding if not running
    if (!isTranscoding) {
        startTranscoding();
    }

    // Write AAC data to ffmpeg input stream
    if (aacInputStream && buffer && buffer.data) {
        const uint8Array = new Uint8Array(buffer.data);
        try {
            aacInputStream.write(Buffer.from(uint8Array));
        } catch (e) {
            log(`Audio stream write error: ${e}`, 'error');
        }
    }
}

function startTranscoding() {
    if (isTranscoding) return;

    log('🎬 Starting ffmpeg transcoding...', 'debug');
    isTranscoding = true;

    // Reset segments
    initSegment = null;
    isCapturingInit = true;
    lastKeyframeSegment = null;

    // Input streams
    h265InputStream = new PassThrough();
    aacInputStream = new PassThrough();

    // Output stream for fMP4
    outputStream = new PassThrough();

    // Spawn ffmpeg with 2 inputs: pipe:0 (video) and pipe:3 (audio)
    const ffmpegArgs = [
        ...(LOGGINGLEVEL > 2 ? ['-loglevel', 'debug', '-report'] : ['-loglevel', FFMPEG_MINLOGLEVEL]),

        // Video input (pipe:0 = stdin)
        '-f', 'hevc',
        '-flags', '+bsf_extract',
        '-fflags', 'nobuffer+discardcorrupt',
        '-flags', 'low_delay',
        '-probesize', '32',
        '-analyzeduration', '0',
        '-i', 'pipe:0',
        '-thread_queue_size', '512',

        // Audio input (pipe:3 = extra fd)
        '-f', 'aac',
        '-fflags', 'nobuffer',
        '-i', 'pipe:3',
        '-thread_queue_size', '512',

        // map inputs
        '-map', '0:v',
        '-map', '1:a',

        // Video encoding - optimized for low-latency
        '-c:v', 'libx264',
        ...(VIDEO_SCALE ? ['-vf', `scale=${VIDEO_SCALE}`] : []),
        '-preset', TRANSCODING_PRESET,
        '-tune', 'zerolatency',
        '-crf', TRANSCODING_CRF,
        '-profile:v', 'main',
        '-level', '3.1',
        '-g', FFMPEG_SHORT_KEYFRAMES ? '15' : '30',
        '-keyint_min', FFMPEG_SHORT_KEYFRAMES ? '15' : '30',
        '-sc_threshold', '0',
        '-pix_fmt', 'yuv420p',
        '-x264-params', 'nal-hrd=cbr:force-cfr=1',

        // Audio encoding
        '-c:a', 'aac',
        '-b:a', '48k',
        '-ar', '16000',
        '-ac', '1',

        // fMP4 container - fragmented MP4 for live streaming
        '-f', 'mp4',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof+faststart',
        '-frag_duration', FFMPEG_SHORT_KEYFRAMES ? '500000' : '1000000',  // 1 second fragments
        '-min_frag_duration', FFMPEG_SHORT_KEYFRAMES ? '500000' : '1000000',
        '-muxdelay', '0',
        '-muxpreload', '0',

        '-threads', FFMPEG_THREADS,

        'pipe:1'
    ];

    ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
        stdio: ['pipe', 'pipe', 'pipe', 'pipe'] // stdin, stdout, stderr, fd3
    });

    // Pipe video to stdin (pipe:0)
    h265InputStream.pipe(ffmpegProcess.stdio[0]);

    // Pipe audio to fd3 (pipe:3)
    aacInputStream.pipe(ffmpegProcess.stdio[3]);

    // Proper MP4 box parsing
    let chunkBuffer = Buffer.alloc(0);
    let awaitingInitClients = new Set();

    ffmpegProcess.stdout.on('data', (chunk) => {
        chunkBuffer = Buffer.concat([chunkBuffer, chunk]);

        // Process buffer while we have complete boxes
        while (chunkBuffer.length >= 8) {
            const boxSize = chunkBuffer.readUInt32BE(0);
            const boxType = chunkBuffer.slice(4, 8).toString('ascii');

            // Need more data for this box
            if (chunkBuffer.length < boxSize) {
                break;
            }

            const box = chunkBuffer.slice(0, boxSize);
            chunkBuffer = chunkBuffer.slice(boxSize);

            // Capture init segment (ftyp + moov boxes together)
            if (isCapturingInit) {
                if (boxType === 'ftyp') {
                    initSegment = box; // Start with ftyp
                    log(`📦 Captured ftyp box: ${boxSize} bytes`, 'debug');
                } else if (boxType === 'moov' && initSegment) {
                    initSegment = Buffer.concat([initSegment, box]); // Add moov
                    isCapturingInit = false;
                    log(`✅ Init segment complete: ${initSegment.length} bytes (ftyp + moov)`, 'info');

                    // Send to all clients waiting for init
                    activeStreamClients.forEach(client => {
                        if (client.active && !client.hasReceivedInit && !client.response.writableEnded) {
                            try {
                                client.response.write(initSegment);
                                client.hasReceivedInit = true;
                                log(`📤 Sent init to client`, 'debug');
                            } catch (e) {
                                log(`Init segment send error: ${e}`, 'error');
                                client.active = false;
                            }
                        }
                    });
                }
            } else {
                // After init: capture keyframe segments (moof + mdat pairs)
                if (boxType === 'moof') {
                    // Start collecting new segment
                    lastKeyframeSegment = box;
                } else if (boxType === 'mdat' && lastKeyframeSegment) {
                    // Complete the segment
                    lastKeyframeSegment = Buffer.concat([lastKeyframeSegment, box]);
                    log(`🔑 Keyframe segment ready: ${lastKeyframeSegment.length} bytes`, 'debug');
                }

                // Always forward to output stream for live clients
                outputStream.write(box);
            }
        }
    });

    // Error handling
    ffmpegProcess.stderr.on('data', (data) => {
        const line = data.toString();
        if (line.includes('frame=') || line.includes('speed=')) {
            log(`ffmpeg: ${line.trim()}`, 'debug');
        }
    });

    ffmpegProcess.on('error', (err) => {
        log(`❌ ffmpeg error: ${err}`, 'error');
        stopTranscoding();
    });

    ffmpegProcess.on('close', (code) => {
        log(`ℹ️ ffmpeg exited with code ${code}`, 'info');
        stopTranscoding();
    });

    log('✅ ffmpeg ready', 'info');
}

function stopTranscoding() {
    if (!isTranscoding) return;

    log('ℹ️ Stopping transcoding...', 'debug');

    // Close all active clients
    activeStreamClients.forEach(client => {
        if (client.active && !client.response.writableEnded) {
            try {
                client.response.end();
            } catch (e) {
                // Ignore
            }
        }
    });
    activeStreamClients.clear();

    if (ffmpegProcess) {
        ffmpegProcess.kill('SIGKILL');
        ffmpegProcess = null;
    }

    if (h265InputStream) {
        h265InputStream.end();
        h265InputStream = null;
    }

    if (aacInputStream) {
        aacInputStream.end();
        aacInputStream = null;
    }

    if (outputStream) {
        outputStream.end();
        outputStream = null;
    }

    isTranscoding = false;
    videoMetadata = null;
    audioMetadata = null;
    initSegment = null;
    lastKeyframeSegment = null;
}

// Central logging function
function log(message, severity = 'info') {
    const levels = ['error', 'warn', 'info', 'debug'];
    const msgLevel = levels.indexOf(severity);
    if (msgLevel === -1) return;
    if (LOGGINGLEVEL < 0) LOGGINGLEVEL = 0;
    if (msgLevel > LOGGINGLEVEL) return;
    const prefix = {
        debug: '[DEBUG]',
        info: '[INFO]',
        warn: '[WARN]',
        error: '[ERROR]'
    }[severity] || '';
    if (severity === 'error') {
        // Only use console.error for actual errors in log()
        console.error(`${prefix} ${message}`);
    } else if (severity === 'warn') {
        console.warn(`${prefix} ${message}`);
    } else {
        // Only use console.log for actual logs in log()
        console.log(`${prefix} ${message}`);
    }
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        eufywsUrl: EUFY_WS_URL,
        eufyConnected: eufyWs?.readyState === WebSocket.OPEN,
        eufyVideo: videoMetadata,
        eufyAudio: audioMetadata,
        streamClients: activeStreamClients.size,
        transcoding: isTranscoding,
        currentDevice: currentDevice,
        transcodeScale: VIDEO_SCALE,
        hasInitSegment: initSegment !== null,
        hasKeyframeSegment: lastKeyframeSegment !== null
    });
});

app.get('/quit', (req, res) => {
    res.json({ status: 'shutting down' });
    log('\n🛑 Shutting down...', 'warn');
    stopTranscoding();
    process.exit(0);
});

// Static file server
app.use(express.static(STATIC_DIR, {
    index: 'index.html',
    extensions: ['html', 'htm']
}));

app.listen(PORT, () => {
    log(`🌐 HTTP server running at http://localhost:${PORT}`, 'info');
    log(`📺 Stream format: http://localhost:${PORT}/<SERIAL_NUMBER>.mp4`, 'info');
});

// Graceful shutdown
process.on('SIGINT', () => {
    log('\n🛑 Shutting down...', 'warn');
    stopTranscoding();
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    if (err.code === 'EPIPE') {
        log('ℹ️ EPIPE uncaught exception. Ignored.', 'debug');
        return;
    }

    if (err.code === 'ECONNRESET') {
        log('ℹ️ ECONNRESET uncaught exception. Ignored.', 'debug');
        return;
    }

    if (err.code === 'write EOF') {
        log('ℹ️ write EOF uncaught exception. Ignored.', 'debug');
        return;
    }

    log(`❌ Uncaught exception: ${err.code} ${err}`, 'error');
    process.exit(1);
});