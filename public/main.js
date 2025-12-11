const debugMode = false; // Set to true to enable debug logging

let transcodeConfig = null;

// Utility: conditional log
function debugConsoleLog(...args) {
    if (debugMode) console.log(...args);
}

function restGetConfig() {
    fetch('/config')
        .then(response => response.json())
        .then(data => {
            debugConsoleLog('Config data received:', data);
            transcodeConfig = data;
            uiShowConfigButton(true);
        })
        .catch(err => {
            debugConsoleLog('Error fetching config:', err);
            transcodeConfig = null;
            uiShowConfigButton(false);
        });
}

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

document.addEventListener('DOMContentLoaded', function () {
    /**
     * Initializes the UI and event listeners when the DOM is loaded.
     */

    fetch('/health')
        .then(response => response.json())
        .then(data => {
            console.log('eufywsUrl from /health:', data.eufyConnected);
            eufywsUrl = document.location.origin.replace(/^http/, 'ws') + '/api';
            transcodeServerUrl = document.location.origin;
            presetButtons = 6;
            uiInit();
            restGetConfig();
            wsToggleConnection();
        })
        .catch(err => {
            console.log('Error fetching /health:', err);
            console.log('Falling back to default URLs.');
            eufywsUrl = 'ws://localhost:3001/api';
            transcodeServerUrl = 'http://localhost:3001';
            presetButtons = 6;
            uiInit();
        });
});
