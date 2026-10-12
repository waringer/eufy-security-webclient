/**
 * Eufy SDK Loader
 *
 * @mega-yfue/eufy-sdk is ESM-only while this server is CommonJS, so the SDK
 * has to be loaded via dynamic import(). In development mode the local
 * submodule build (../../eufy-sdk/dist) is used, otherwise the installed
 * npm package.
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const utils = require('./utils');

const SDK_PACKAGE = '@mega-yfue/eufy-sdk';
const SDK_DEV_DIR = path.resolve(__dirname, '../../eufy-sdk');
const SDK_PROD_DIR = path.resolve(__dirname, '../node_modules', SDK_PACKAGE);

let sdkPromise = null;

/**
 * Load SDK
 * @returns {Promise<Object>} SDK module namespace (EufyMega, FileSessionStore, LoginStatus, ...)
 */
function loadSdk() {
    if (!sdkPromise) {
        const target = utils.isDev
            ? pathToFileURL(path.join(SDK_DEV_DIR, 'dist', 'index.js')).href
            : SDK_PACKAGE;
        sdkPromise = import(target);
    }
    return sdkPromise;
}

/**
 * Get SDK Version
 * Read from package.json on disk, because the SDK's exports map hides it from require().
 * @returns {string} SDK version or 'unknown'
 */
function getSdkVersion() {
    try {
        const dir = utils.isDev ? SDK_DEV_DIR : SDK_PROD_DIR;
        return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
    } catch (error) {
        return 'unknown';
    }
}

module.exports = { loadSdk, getSdkVersion };
