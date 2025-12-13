// eufy-security-client Streaming Proxy Server

const utils = require('./server/utils');
const transcode = require('./server/transcode');
const eufy = require('./server/eufy-client');
const restServer = require('./server/rest');

let CONFIG = utils.loadConfig();

// Streams and state

eufy.connect(CONFIG.EUFY_CONFIG);
transcode.initTranscode();
restServer.initRestServer();

utils.log('🚀 eufy-security-client Streaming Proxy started', 'info');

// Graceful shutdown
process.on('SIGINT', async () => {
    utils.log('\n🛑 Shutting down...', 'warn');
    transcode.stopTranscoding();
    await eufy.close();
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    if (err.code === 'EPIPE') {
        utils.log('ℹ️ EPIPE uncaught exception. Ignored.', 'debug');
        return;
    }

    if (err.code === 'ECONNRESET') {
        utils.log('ℹ️ ECONNRESET uncaught exception. Ignored.', 'debug');
        return;
    }

    if (err.code === 'EOF Error') {
        utils.log('ℹ️ EOF Error uncaught exception. Ignored.', 'debug');
        return;
    }

    utils.log(`❌ Uncaught exception: ${err.code} ${err}`, 'error');
    console.error(err);
    process.exit(1);
});
