const { spawn } = require('child_process');
const { PassThrough } = require('stream');

const utils = require('./utils');

const LOGGINGLEVEL = process.env.LOGGINGLEVEL || '2';
const FFMPEG_MINLOGLEVEL = process.env.FFMPEG_MINLOGLEVEL || 'warning';

let CONFIG = utils.loadConfig();
let ffmpegProcess = null;
let inputStream = null;
let aacInputStream = null;
let outputStream = null;
let isTranscoding = false;
let videoMetadata = null;
let audioMetadata = null;

// fMP4 init segment management
let initSegment = null;
let isCapturingInit = true;
let lastKeyframeSegment = null; // Store last complete moof+mdat starting with keyframe

function initTranscode() {
    CONFIG = utils.loadConfig();
    utils.log('🎬 Transcode module initialized', 'info');
}

function handleVideoData(buffer, metadata) {
    // Store metadata on first frame
    if (!videoMetadata && metadata) {
        videoMetadata = metadata;
        utils.log(`📹 Video: ${metadata.videoCodec} ${metadata.videoWidth}x${metadata.videoHeight} @ ${metadata.videoFPS}fps`, 'info');
    }

    // Start transcoding if not running
    if (!isTranscoding) {
        startTranscoding();
    }

    // Write H.265 data to ffmpeg input stream
    if (inputStream && buffer) {
        // const uint8Array = new Uint8Array(buffer.data);
        try {
            inputStream.write(buffer);
        } catch (e) {
            utils.log(`Video stream write error: ${e}`, 'error');
        }
    }
}

function handleAudioData(buffer, metadata) {
    // Store metadata on first audio frame
    if (!audioMetadata && metadata) {
        audioMetadata = metadata;
        utils.log(`🔊 Audio: ${metadata.audioCodec}`, 'info');
    }

    // Start transcoding if not running
    if (!isTranscoding) {
        startTranscoding();
    }

    // Write AAC data to ffmpeg input stream
    if (aacInputStream && buffer) {
        // const uint8Array = new Uint8Array(buffer.data);
        try {
            aacInputStream.write(buffer);
        } catch (e) {
            utils.log(`Audio stream write error: ${e}`, 'error');
        }
    }
}

function startTranscoding() {
    if (isTranscoding) return;
    if (!videoMetadata || !videoMetadata.videoCodec) {
        utils.log('❌ Cannot start transcoding - missing video metadata', 'warn');
        return;
    }

    utils.log('🎬 Starting ffmpeg transcoding...', 'debug');
    isTranscoding = true;

    // Reset segments
    initSegment = null;
    isCapturingInit = true;
    lastKeyframeSegment = null;

    // Input streams
    inputStream = new PassThrough();
    aacInputStream = new PassThrough();

    // Output stream for fMP4
    outputStream = new PassThrough();

    // Spawn ffmpeg with 2 inputs: pipe:0 (video) and pipe:3 (audio)
    const ffmpegArgs = [
        ...(LOGGINGLEVEL > 2 ? ['-loglevel', 'debug', '-report'] : ['-loglevel', FFMPEG_MINLOGLEVEL]),

        // Video input (pipe:0 = stdin)
        '-f', (videoMetadata.videoCodec === 'H264' ? 'h264' : 'hevc'),
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
        ...(CONFIG.VIDEO_SCALE ? ['-vf', `scale=${CONFIG.VIDEO_SCALE}`] : []),
        '-preset', CONFIG.TRANSCODING_PRESET,
        '-tune', 'zerolatency',
        '-crf', CONFIG.TRANSCODING_CRF,
        '-profile:v', 'main',
        '-level', '3.1',
        '-g', CONFIG.FFMPEG_SHORT_KEYFRAMES ? '15' : '30',
        '-keyint_min', CONFIG.FFMPEG_SHORT_KEYFRAMES ? '15' : '30',
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
        '-frag_duration', CONFIG.FFMPEG_SHORT_KEYFRAMES ? '500000' : '1000000',  // 1 second fragments
        '-min_frag_duration', CONFIG.FFMPEG_SHORT_KEYFRAMES ? '500000' : '1000000',
        '-muxdelay', '0',
        '-muxpreload', '0',

        '-threads', CONFIG.FFMPEG_THREADS,

        'pipe:1'
    ];

    ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
        stdio: ['pipe', 'pipe', 'pipe', 'pipe'] // stdin, stdout, stderr, fd3
    });

    // Pipe video to stdin (pipe:0)
    inputStream.pipe(ffmpegProcess.stdio[0]);

    // Pipe audio to fd3 (pipe:3)
    aacInputStream.pipe(ffmpegProcess.stdio[3]);

    // Proper MP4 box parsing
    let chunkBuffer = Buffer.alloc(0);
    // let awaitingInitClients = new Set();

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
                    utils.log(`📦 Captured ftyp box: ${boxSize} bytes`, 'debug');
                } else if (boxType === 'moov' && initSegment) {
                    initSegment = Buffer.concat([initSegment, box]); // Add moov
                    isCapturingInit = false;
                    utils.log(`✅ Init segment complete: ${initSegment.length} bytes (ftyp + moov)`, 'info');

                    // Send to all clients waiting for init
                    utils.getActiveStreamClients().forEach(client => {
                        if (client.active && !client.hasReceivedInit && !client.response.writableEnded) {
                            try {
                                client.response.write(initSegment);
                                client.hasReceivedInit = true;
                                utils.log(`📤 Sent init to client`, 'debug');
                            } catch (e) {
                                utils.log(`Init segment send error: ${e}`, 'error');
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
                    utils.log(`🔑 Keyframe segment ready: ${lastKeyframeSegment.length} bytes`, 'debug');
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
            utils.log(`ffmpeg: ${line.trim()}`, 'debug');
        }
    });

    ffmpegProcess.on('error', (err) => {
        utils.log(`❌ ffmpeg error: ${err}`, 'error');
        stopTranscoding();
    });

    ffmpegProcess.on('close', (code) => {
        utils.log(`ℹ️ ffmpeg exited with code ${code}`, 'info');
        stopTranscoding();
    });

    utils.log('✅ ffmpeg ready', 'info');
}

function stopTranscoding() {
    if (!isTranscoding) return;

    utils.log('ℹ️ Stopping transcoding...', 'debug');

    // Close all active clients
    utils.getActiveStreamClients().forEach(client => {
        if (client.active && !client.response.writableEnded) {
            try {
                client.response.end();
            } catch (e) {
                // Ignore
            }
        }
    });
    utils.clearActiveStreamClients();

    if (ffmpegProcess) {
        ffmpegProcess.kill('SIGKILL');
        ffmpegProcess = null;
    }

    if (inputStream) {
        inputStream.end();
        inputStream = null;
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

function clearMetadata() {
    videoMetadata = null;
    audioMetadata = null;
}

module.exports = {
    initTranscode,
    startTranscoding,
    stopTranscoding,
    handleVideoData,
    handleAudioData,
    clearMetadata,
    get videoMetadata() { return videoMetadata; },
    get audioMetadata() { return audioMetadata; },
    get getOutputStream() { return outputStream; },
    get getInitSegment() { return initSegment; },
    get videoScale() { return CONFIG.VIDEO_SCALE; },
    get isTranscoding() { return isTranscoding; },
    get hasInitSegment() { return initSegment !== null; },
    get hasKeyframeSegment() { return lastKeyframeSegment !== null; }
};