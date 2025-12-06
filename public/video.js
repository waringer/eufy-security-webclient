/**
 * Eufy Video Streaming Client
 * Handles starting, stopping, and managing a low-latency video stream from the transcode server.
 * Uses Media Source Extensions (MSE) for live playback and buffer management.
 */
let transcodeServerUrl;

let video;
let bufferSpan;

let mediaSource = null;
let sourceBuffer = null;
let fetchController = null;
let isStreaming = false;
let reconnectTimeout = null;
let connectionCheckInterval = null;

/**
 * Updates the status text in the console and UI.
 * @param {string} text - Status message.
 * @param {string} state - Connection state.
 */
function videoSetStatus(text, state) {
    debugConsoleLog(`Video status: ${text} (${state})`);
    uiDebugLog(`Video status: ${text} (${state})`);
}

/**
 * Displays an error message in the video error panel.
 * @param {string} message - Error message to show.
 */
function videoShowError(message) {
    const errorMessage = document.getElementById('device-video-errorMessage');
    errorMessage.textContent = message;
    errorMessage.classList.add('visible');
}

/**
 * Hides the video error panel.
 */
function videoHideError() {
    document.getElementById('device-video-errorMessage').classList.remove('visible');
}

/**
 * Updates the video button text and style based on streaming state.
 * @param {boolean} streaming - True if streaming is active.
 */
function videoUpdateButtons(streaming) {
    const videoBtn = document.getElementById('device-video-btn');
    videoBtn.textContent = streaming ? 'Stop Video' : 'Start Video';
    videoBtn.className = streaming ? 'disconnect' : 'connect';
}

/**
 * Starts the video stream for the given device serial number.
 * Sets up MediaSource and fetches the video stream from the server.
 * @param {string} server - Transcode server URL.
 * @param {string} deviceSerial - Device serial number.
 */
function videoStartStream(server, deviceSerial) {
    video = document.getElementById('device-video-video');
    // Listen for video element errors
    video.addEventListener('error', (e) => {
        console.error('Video error:', e);
        if (isStreaming) {
            videoShowError('A video error occurred');
            videoStopStream();
        }
    });

    bufferSpan = document.getElementById('device-video-buffer');

    if (!deviceSerial) {
        videoShowError('Please enter a device serial number!');
        return;
    }

    if (!/^[A-Z0-9]+$/i.test(deviceSerial)) {
        videoShowError('Invalid format! Only alphanumeric characters allowed.');
        return;
    }

    videoHideError();

    if (isStreaming) return;

    videoSetStatus('Connecting...', 'connecting');
    isStreaming = true;
    videoUpdateButtons(true);

    // Setup Media Source Extensions (MSE)
    mediaSource = new MediaSource();
    video.src = URL.createObjectURL(mediaSource);

    mediaSource.addEventListener('sourceopen', async () => {
        try {
            // Add source buffer for H.264/AAC
            sourceBuffer = mediaSource.addSourceBuffer('video/mp4; codecs="avc1.64001f, mp4a.40.2"');
            sourceBuffer.mode = 'sequence';

            // Set playback rate for low latency
            video.playbackRate = 1.0;

            videoSetStatus('Stream running', 'connected');
            videoFetchStream(server, deviceSerial);
        } catch (e) {
            videoSetStatus('Error: ' + e.message, 'disconnected');
            videoShowError('SourceBuffer error: ' + e.message);
            console.error('SourceBuffer error:', e);
            videoStopStream();
        }
    });

    // Start periodic connection check
    videoStartConnectionCheck();
}

/**
 * Fetches the video stream from the server and appends data to the source buffer.
 * Handles buffer management and error conditions.
 * @param {string} server - Transcode server URL.
 * @param {string} deviceSerial - Device serial number.
 */
async function videoFetchStream(server, deviceSerial) {
    fetchController = new AbortController();
    let lastDataTime = Date.now();

    try {
        const response = await fetch(`${server}/${deviceSerial}.mp4`, {
            signal: fetchController.signal
        });

        if (!response.ok) {
            if (response.status === 409) {
                const errorData = await response.json();
                throw new Error(`Another device is already streaming: ${errorData.currentDevice}`);
            } else if (response.status === 400) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Invalid serial number');
            } else {
                throw new Error(`Stream not available (HTTP ${response.status})`);
            }
        }

        const reader = response.body.getReader();

        while (isStreaming) {
            const { done, value } = await reader.read();

            if (done) {
                debugConsoleLog('Video stream ended by server');
                videoSetStatus('Connection ended', 'disconnected');
                videoShowError('Stream was ended by the server');
                videoStopStream();
                break;
            }

            lastDataTime = Date.now();

            if (sourceBuffer && !sourceBuffer.updating) {
                try {
                    sourceBuffer.appendBuffer(value);

                    // Auto-play if paused and data is available
                    if (video.paused && video.readyState >= 2) {
                        video.play().catch(e => debugConsoleLog('Video autoplay prevented:', e));
                    }

                    // Buffer management for low latency
                    if (video.buffered.length > 0) {
                        const buffered = video.buffered.end(0) - video.currentTime;
                        bufferSpan.textContent = buffered.toFixed(1) + 's';

                        // If buffer gets too large, skip to live point
                        if (buffered > 3) {
                            video.currentTime = video.buffered.end(0) - 1;
                        }
                    }
                } catch (e) {
                    console.error('Append error:', e);
                    if (e.name === 'QuotaExceededError') {
                        // Buffer full - remove old data from source buffer
                        if (sourceBuffer.buffered.length > 0) {
                            const removeEnd = sourceBuffer.buffered.end(0) - 10;
                            if (removeEnd > 0) {
                                sourceBuffer.remove(0, removeEnd);
                            }
                        }
                    }
                }
            }

            // Wait until buffer is ready for next chunk
            await new Promise(resolve => {
                if (!sourceBuffer.updating) {
                    resolve();
                } else {
                    sourceBuffer.addEventListener('updateend', resolve, { once: true });
                }
            });
        }
    } catch (e) {
        if (e.name !== 'AbortError') {
            videoSetStatus('Connection error', 'disconnected');
            videoShowError('Error: ' + e.message);
            console.error('Fetch error:', e);
            videoStopStream();
        }
    }
}

/**
 * Starts a periodic check to verify the video connection is still active.
 * If no data is received, stops the stream and shows an error.
 */
function videoStartConnectionCheck() {
    // Check every 10 seconds if the connection is still active
    connectionCheckInterval = setInterval(() => {
        if (isStreaming && video.readyState === 0) {
            debugConsoleLog('Video no data received - connection lost');
            videoSetStatus('Connection lost', 'disconnected');
            videoShowError('Connection to server lost');
            videoStopStream();
        }
    }, 10000);
}

/**
 * Stops the periodic connection check.
 */
function videoStopConnectionCheck() {
    if (connectionCheckInterval) {
        clearInterval(connectionCheckInterval);
        connectionCheckInterval = null;
    }
}

/**
 * Stops the video stream, aborts fetch, closes MediaSource, and resets UI.
 */
function videoStopStream() {
    isStreaming = false;
    videoUpdateButtons(false);
    videoStopConnectionCheck();

    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }

    if (fetchController) {
        fetchController.abort();
    }

    if (mediaSource && mediaSource.readyState === 'open') {
        try {
            mediaSource.endOfStream();
        } catch (e) {
            debugConsoleLog('Video MediaSource already closed');
        }
    }

    video?.pause();
    videoSetStatus('Stopped', 'disconnected');
}
