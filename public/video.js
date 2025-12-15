/**
 * Eufy Video Streaming Client
 * 
 * Handles low-latency video streaming using Media Source Extensions (MSE).
 * Fetches fragmented MP4 (fMP4) stream from transcode server and manages
 * real-time playback with adaptive buffer control.
 * 
 * Features:
 * - H.264/AAC video/audio playback via MSE
 * - Automatic buffer management for low latency
 * - Connection monitoring and error recovery
 * - Live point tracking (keeps playback near real-time)
 * 
 * Dependencies: ui.js, main.js
 */

// Global configuration
let transcodeServerUrl;             // Transcode server base URL (set from main.js)

// DOM references
let video;                          // <video> element reference
let bufferSpan;                     // Buffer size display element

// Media Source Extensions state
let mediaSource = null;             // MSE MediaSource instance
let sourceBuffer = null;            // SourceBuffer for appending video chunks
let fetchController = null;         // AbortController for fetch cancellation
let isStreaming = false;            // True if stream is active
let reconnectTimeout = null;        // Timeout handle for reconnection attempts
let connectionCheckInterval = null; // Interval handle for connection health checks

// ============================================================================
// Status and Error Handlers
// ============================================================================

/**
 * Update Video Status
 * Logs status changes to console and debug UI
 * @param {string} text - Human-readable status message
 * @param {string} state - Connection state (connecting|connected|disconnected)
 */
function videoSetStatus(text, state) {
    debugConsoleLog(`Video status: ${text} (${state})`);
    uiDebugLog(`Video status: ${text} (${state})`);
}

/**
 * Show Video Error
 * Displays error message in video player overlay
 * @param {string} message - Error message to display
 */
function videoShowError(message) {
    const errorMessage = document.getElementById('device-video-errorMessage');
    errorMessage.textContent = message;
    errorMessage.classList.add('visible');
}

/**
 * Hide Video Error
 * Removes error message overlay from video player
 */
function videoHideError() {
    document.getElementById('device-video-errorMessage').classList.remove('visible');
}

/**
 * Update Video Buttons
 * Synchronizes UI state with streaming status
 * @param {boolean} streaming - True if stream is active
 */
function videoUpdateButtons(streaming) {
    uiUpdateVideoButton(streaming);  // Toggle start/stop button text
    uiLockDeviceList(streaming);     // Prevent device switching during stream
}

// ============================================================================
// Stream Control Functions
// ============================================================================

/**
 * Start Video Stream
 * Initializes MediaSource, validates device SN, and begins streaming
 * 
 * Workflow:
 * 1. Validate device serial number format
 * 2. Create MediaSource and attach to video element
 * 3. Setup SourceBuffer with H.264/AAC codecs
 * 4. Fetch fMP4 stream from transcode server
 * 5. Start connection health monitoring
 * 
 * @param {string} server - Transcode server base URL
 * @param {string} deviceSerial - Device serial number (alphanumeric)
 */
function videoStartStream(server, deviceSerial) {
    video = document.getElementById('device-video-video');

    // Handle video element errors (decoder failures, format issues, etc.)
    video.addEventListener('error', (e) => {
        console.error('Video error:', e);
        if (isStreaming) {
            videoShowError('A video error occurred');
            videoStopStream();
        }
    });

    bufferSpan = document.getElementById('device-video-buffer');

    // Validate device serial number
    if (!deviceSerial) {
        videoShowError('Please enter a device serial number!');
        return;
    }

    if (!/^[A-Z0-9]+$/i.test(deviceSerial)) {
        videoShowError('Invalid format! Only alphanumeric characters allowed.');
        return;
    }

    videoHideError();

    // Prevent starting multiple streams
    if (isStreaming) return;

    videoSetStatus('Connecting...', 'connecting');
    isStreaming = true;
    videoUpdateButtons(true);

    // Initialize Media Source Extensions (MSE)
    mediaSource = new MediaSource();
    video.src = URL.createObjectURL(mediaSource);

    mediaSource.addEventListener('sourceopen', async () => {
        try {
            // Create SourceBuffer for H.264 video + AAC audio
            // Codec string: avc1.64001f = H.264 High Profile Level 3.1
            //               mp4a.40.2 = AAC-LC audio
            sourceBuffer = mediaSource.addSourceBuffer('video/mp4; codecs="avc1.64001f, mp4a.40.2"');
            sourceBuffer.mode = 'sequence';  // Sequential timestamp mode for live streaming

            // Set default playback rate (1.0 = real-time)
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

    // Start periodic connection health check
    videoStartConnectionCheck();
}

/**
 * Fetch Video Stream
 * Continuously fetches fMP4 chunks from server and appends to SourceBuffer
 * 
 * Buffer Management:
 * - Appends video chunks as they arrive
 * - Auto-plays when enough data is buffered
 * - Removes old buffer data when QuotaExceeded
 * - Skips forward if buffer exceeds 3 seconds (live point tracking)
 * 
 * Error Handling:
 * - 409: Another device is streaming (device locked)
 * - 400: Invalid device serial number
 * - Network errors trigger reconnection
 * 
 * @param {string} server - Transcode server base URL
 * @param {string} deviceSerial - Device serial number
 */
async function videoFetchStream(server, deviceSerial) {
    fetchController = new AbortController();
    let lastDataTime = Date.now();

    try {
        // Fetch fMP4 stream with abort signal for cancellation
        const response = await fetch(`${server}/${deviceSerial}.mp4`, {
            signal: fetchController.signal
        });

        // Handle HTTP errors
        if (!response.ok) {
            if (response.status === 409) {
                // Device is already streaming to another client
                const errorData = await response.json();
                throw new Error(`Another device is already streaming: ${errorData.currentDevice}`);
            } else if (response.status === 400) {
                // Invalid device serial number
                const errorData = await response.json();
                throw new Error(errorData.message || 'Invalid serial number');
            } else {
                throw new Error(`Stream not available (HTTP ${response.status})`);
            }
        }

        const reader = response.body.getReader();

        // Read stream chunks continuously
        while (isStreaming) {
            const { done, value } = await reader.read();

            // Stream ended by server
            if (done) {
                debugConsoleLog('Video stream ended by server');
                videoSetStatus('Connection ended', 'disconnected');
                videoShowError('Stream was ended by the server');
                videoStopStream();
                break;
            }

            lastDataTime = Date.now();

            // Append chunk to SourceBuffer if not currently updating
            if (sourceBuffer && !sourceBuffer.updating) {
                try {
                    sourceBuffer.appendBuffer(value);  // Add fMP4 chunk

                    // Auto-play when enough data is buffered
                    if (video.paused && video.readyState >= 2) {
                        video.play().catch(e => debugConsoleLog('Video autoplay prevented:', e));
                    }

                    // Buffer management for low-latency streaming
                    if (video.buffered.length > 0) {
                        const buffered = video.buffered.end(0) - video.currentTime;
                        bufferSpan.textContent = buffered.toFixed(1) + 's';

                        // Live point tracking: skip forward if buffer exceeds 3 seconds
                        if (buffered > 3) {
                            video.currentTime = video.buffered.end(0) - 1;  // Jump to 1s behind live
                        }
                    }
                } catch (e) {
                    console.error('Append error:', e);

                    // Handle buffer quota exceeded (memory limit)
                    if (e.name === 'QuotaExceededError') {
                        // Remove old buffered data to free memory
                        if (sourceBuffer.buffered.length > 0) {
                            const removeEnd = sourceBuffer.buffered.end(0) - 10;
                            if (removeEnd > 0) {
                                sourceBuffer.remove(0, removeEnd);  // Keep only last 10 seconds
                            }
                        }
                    }
                }
            }

            // Wait for SourceBuffer to finish updating before next chunk
            await new Promise(resolve => {
                if (!sourceBuffer.updating) {
                    resolve();
                } else {
                    sourceBuffer.addEventListener('updateend', resolve, { once: true });
                }
            });
        }
    } catch (e) {
        // Ignore AbortError (triggered by manual stop)
        if (e.name !== 'AbortError') {
            videoSetStatus('Connection error', 'disconnected');
            videoShowError('Error: ' + e.message);
            console.error('Fetch error:', e);
            videoStopStream();
        }
    }
}

// ============================================================================
// Connection Health Monitoring
// ============================================================================

/**
 * Start Connection Check
 * Monitors video element readyState to detect connection loss
 * Runs every 10 seconds while streaming is active
 */
function videoStartConnectionCheck() {
    connectionCheckInterval = setInterval(() => {
        // Check if video element has no data (readyState 0 = HAVE_NOTHING)
        if (isStreaming && video.readyState === 0) {
            debugConsoleLog('Video no data received - connection lost');
            videoSetStatus('Connection lost', 'disconnected');
            videoShowError('Connection to server lost');
            videoStopStream();
        }
    }, 10000);  // Check every 10 seconds
}

/**
 * Stop Connection Check
 * Clears connection health monitoring interval
 */
function videoStopConnectionCheck() {
    if (connectionCheckInterval) {
        clearInterval(connectionCheckInterval);
        connectionCheckInterval = null;
    }
}

/**
 * Stop Video Stream
 * Aborts fetch, closes MediaSource, and performs complete cleanup
 * 
 * Cleanup workflow:
 * 1. Set isStreaming flag to false
 * 2. Update UI buttons and unlock device list
 * 3. Stop connection health monitoring
 * 4. Clear reconnection timeout
 * 5. Abort fetch request
 * 6. End MediaSource stream
 * 7. Pause video element
 */
function videoStopStream() {
    isStreaming = false;
    videoUpdateButtons(false);
    videoStopConnectionCheck();

    // Clear any pending reconnection attempts
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }

    // Abort ongoing fetch request
    if (fetchController) {
        fetchController.abort();
    }

    // Close MediaSource if still open
    if (mediaSource && mediaSource.readyState === 'open') {
        try {
            mediaSource.endOfStream();
        } catch (e) {
            debugConsoleLog('Video MediaSource already closed');
        }
    }

    // Revoke blob URL to prevent memory leak
    if (video && video.src.startsWith('blob:')) {
        URL.revokeObjectURL(video.src);
        video.src = '';
    }

    // Pause video playback
    video?.pause();
    videoSetStatus('Stopped', 'disconnected');
}
