/**
 * eufy-security-client Streaming Proxy Server
 * 
 * Main entry point for the streaming proxy server that handles:
 * - Connection to Eufy Security devices
 * - Video stream transcoding
 * - REST API for client communication
 */

// Import required modules
const utils = require('./server/utils');
const transcode = require('./server/transcode');
const eufy = require('./server/eufy-client');
const restServer = require('./server/rest');

// Load configuration from config file
let CONFIG = utils.loadConfig();

// Initialize server components
eufy.connect(CONFIG.EUFY_CONFIG);          // Connect to Eufy Security system
transcode.initTranscode();                 // Initialize video transcoding service
restServer.initRestServer();               // Start REST API server

utils.log('🚀 eufy-security-client Streaming Proxy started', 'info');

/**
 * Graceful shutdown handler
 * Handles SIGINT signal (Ctrl+C) to cleanly stop all services
 */
process.on('SIGINT', async () => {
    utils.log('\n🛑 Shutting down...', 'warn');
    transcode.stopTranscoding();           // Stop all active transcoding processes
    await eufy.close();                    // Close Eufy connection gracefully
    process.exit(0);
});

/**
 * Global exception handler
 * Catches unhandled exceptions to prevent server crashes
 * Some exceptions (EPIPE, ECONNRESET, EOF) are expected during normal operation
 * and are safely ignored to maintain server stability
 */
process.on('uncaughtException', (err) => {
    // EPIPE: Broken pipe - occurs when a client disconnects unexpectedly
    if (err.code === 'EPIPE') {
        utils.log('ℹ️ EPIPE uncaught exception. Ignored.', 'debug');
        return;
    }

    // ECONNRESET: Connection reset - occurs when a connection is forcibly closed
    if (err.code === 'ECONNRESET') {
        utils.log('ℹ️ ECONNRESET uncaught exception. Ignored.', 'debug');
        return;
    }

    // EOF Error: End of file - occurs during stream termination
    if (err.code === 'EOF Error') {
        utils.log('ℹ️ EOF Error uncaught exception. Ignored.', 'debug');
        return;
    }

    // Log and exit for all other uncaught exceptions
    utils.log(`❌ Uncaught exception: ${err.code} ${err}`, 'error');
    console.error(err);
    process.exit(1);
});
