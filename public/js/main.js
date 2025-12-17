/**
 * Main Client Entry Point
 * 
 * Initializes the Eufy Security web client application.
 * Handles configuration loading, health checks, and bootstraps the UI.
 * 
 * Dependencies: ui.js, ws-client.js, video.js
 */

// Debug mode toggle for development logging
const debugMode = false; // Set to true to enable debug logging

// Global configuration state
let transcodeConfig = null;

/**
 * Debug Console Log
 * Conditional logging utility that respects debugMode setting
 * @param {...*} args - Arguments to log
 */
function debugConsoleLog(...args) {
    if (debugMode) console.log(...args);
}

/**
 * REST API: Get Configuration
 * Fetches transcode configuration from server
 * @param {Function} callback - Optional callback with config data
 */
function restGetConfig(callback) {
    fetch('/config')
        .then(response => response.json())
        .then(data => {
            debugConsoleLog('Config data received:', data);
            transcodeConfig = data;
            uiShowConfigButton(true);

            if (callback) callback(data);
        })
        .catch(err => {
            debugConsoleLog('Error fetching config:', err);
            transcodeConfig = null;
            uiShowConfigButton(false);
        });
}

/**
 * REST API: Post Configuration
 * Saves updated transcode configuration to server
 * @param {Object} newConfig - New configuration object
 * @returns {Promise<string|undefined>} Error message or undefined on success
 */
function restPostConfig(newConfig) {
    // Send POST request to save config
    fetch('/config', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(newConfig)
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                transcodeConfig = data.config;
                return;
            } else {
                debugConsoleLog('Error saving config:', data.message);
                return data.message;
            }
        })
        .catch(err => {
            debugConsoleLog('Error in POST /config:', err);
            return err;
        });
}

/**
 * Application Initialization
 * Bootstraps the client application on DOM ready
 * 
 * Workflow:
 * 1. Check server health and connectivity
 * 2. Initialize WebSocket URL from server origin
 * 3. Bootstrap UI components
 * 4. Load configuration
 * 5. Establish WebSocket connection
 */
document.addEventListener('DOMContentLoaded', function () {
    fetch('/health')
        .then(response => response.json())
        .then(data => {
            console.log('eufywsUrl from /health:', data.eufyConnected);
            
            // Build WebSocket URL from current origin
            eufywsUrl = document.location.origin.replace(/^http/, 'ws') + '/api';
            transcodeServerUrl = document.location.origin;
            presetButtons = 4;
            
            // Initialize UI and establish connection
            uiInit();
            restGetConfig();
            wsToggleConnection();
        })
        .catch(err => {
            console.log('Error fetching /health:', err);
            console.log('Falling back to default URLs.');
            
            // Fallback to localhost for development
            eufywsUrl = 'ws://localhost:3001/api';
            transcodeServerUrl = 'http://localhost:3001';
            presetButtons = 4;
            uiInit();
        });
});
