const debugMode = false;

// Utility: conditional log
function debugConsoleLog(...args) {
    if (debugMode) console.log(...args);
}

document.addEventListener('DOMContentLoaded', function () {
    /**
     * Initializes the UI and event listeners when the DOM is loaded.
     */

    fetch('/health')
        .then(response => response.json())
        .then(data => {
            console.log('eufywsUrl from /health:', data.eufywsUrl);
            eufywsUrl = data.eufywsUrl;
            transcodeServerUrl = document.location.origin;
            presetButtons = 6;
            uiInit();
            wsToggleConnection();
        })
        .catch(err => {
            console.log('Error fetching /health:', err);
            console.log('Falling back to default URLs.');
            eufywsUrl = 'ws://localhost:3000';
            transcodeServerUrl = 'http://localhost:3001';
            presetButtons = 6;
            uiInit();
        });
});
