const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const LOGGINGLEVEL = process.env.LOGGINGLEVEL || '2';

// Default configuration
const DEFAULT_CONFIG = {
    EUFY_CONFIG: {
        username: '',
        password: '',
        persistentDir: './data',
        country: 'DE',
        language: 'en'
    },
    TRANSCODING_PRESET: process.env.TRANSCODING_PRESET || 'ultrafast',
    TRANSCODING_CRF: process.env.TRANSCODING_CRF || '23',
    VIDEO_SCALE: process.env.VIDEO_SCALE || '1280:-2',
    FFMPEG_THREADS: process.env.FFMPEG_THREADS || '4',
    FFMPEG_SHORT_KEYFRAMES: process.env.FFMPEG_SHORT_KEYFRAMES === 'true' || false,
};

let activeStreamClients = new Set();

// Load configuration from file or use defaults
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const savedConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            log(`📋 Configuration loaded from ${CONFIG_FILE}`, 'info');
            return { ...DEFAULT_CONFIG, ...savedConfig };
        }
    } catch (err) {
        log(`⚠️ Failed to load config from ${CONFIG_FILE}: ${err.message}`, 'warn');
    }
    return { ...DEFAULT_CONFIG };
}

// Save configuration to file
function saveConfig(config) {
    try {
        // Ensure DATA_DIR exists
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
            log(`📁 Created directory: ${DATA_DIR}`, 'debug');
        }
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
        log(`💾 Configuration saved to ${CONFIG_FILE}`, 'debug');
        return true;
    } catch (err) {
        log(`❌ Failed to save config to ${CONFIG_FILE}: ${err.message}`, 'error');
        return false;
    }
}

function addActiveStreamClient(client) {
    activeStreamClients.add(client);
}

function removeActiveStreamClient(client) {
    activeStreamClients.delete(client);
}

function getActiveStreamClients() {
    return activeStreamClients;
}

function clearActiveStreamClients() {
    activeStreamClients.clear();
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

module.exports = {
    loadConfig,
    saveConfig,
    addActiveStreamClient,
    removeActiveStreamClient,
    clearActiveStreamClients,
    getActiveStreamClients,
    log
};