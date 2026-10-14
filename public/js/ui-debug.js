// Debug tab: client log (messages of this web client) and server log (buffered + live via WebSocket).
// Only available in debug mode, which is a setting of this browser (configuration dialog).

const DEBUG_MAX_LINES = 1000;   // Lines kept per log
const SERVER_LOG_LEVELS = ['error', 'warn', 'info', 'debug', 'trace'];

/**
 * Initialize the debug tab (button handlers); called once from uiInit
 */
function uiInitDebugPanel() {
    document.getElementById('debug-client-clear').addEventListener('click', () => {
        document.getElementById('debug-client-log').replaceChildren();
    });

    document.getElementById('debug-client-copy').addEventListener('click', () => {
        const text = document.getElementById('debug-client-log').innerText;
        navigator.clipboard?.writeText(text).catch(e => debugConsoleLog('Copy failed:', e));
    });

    document.getElementById('debug-server-clear').addEventListener('click', () => {
        document.getElementById('debug-server-log').replaceChildren();
    });

    document.getElementById('debug-server-download').addEventListener('click', uiDebugDownloadServerLog);

    document.getElementById('debug-server-filter').addEventListener('change', uiDebugApplyServerFilter);
}

/**
 * Download the server log as file.
 * Fetched as blob instead of navigating to /logs: a navigation makes some browsers (e.g. Firefox)
 * close the WebSocket, even though the response is only an attachment.
 */
async function uiDebugDownloadServerLog() {
    try {
        const response = await fetch(transcodeServerUrl + '/logs');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement('a');
        link.href = url;
        link.download = 'eufy-server.log';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
        debugConsoleLog('Server log download failed:', e);
    }
}

/**
 * Show / hide the debug tab after the debug mode changed
 */
function uiUpdateDebugAvailability() {
    if (!debugMode && currentView === 'debug') uiSetView('live');

    // Rebuild the view switch so the Debug button appears / disappears
    const viewSwitch = document.getElementById('view-switch');
    if (viewSwitch) viewSwitch.replaceWith(uiCreateViewSwitch());
}

/**
 * The debug tab was opened or left: receive the server log only while it is shown
 * @param {boolean} shown - True if the debug tab is shown now
 */
function uiDebugOnViewChange(shown) {
    eufyLogSubscribe(shown);
}

/**
 * WebSocket (re)connected: subscribe again if the debug tab is open
 */
function uiDebugOnConnect() {
    if (currentView === 'debug') eufyLogSubscribe(true);
}

/**
 * Time of day with milliseconds (local)
 * @param {Date} date
 * @returns {string} "HH:MM:SS.mmm"
 */
function uiDebugTime(date) {
    const pad = (n, len = 2) => String(n).padStart(len, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

/**
 * Append a line to a log view; keeps at most DEBUG_MAX_LINES and follows the end
 * if the view was scrolled to the bottom
 * @param {HTMLElement} container - Log view
 * @param {HTMLElement[]} lines - Line elements to append
 */
function uiDebugAppend(container, lines) {
    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 20;

    container.append(...lines);
    while (container.childElementCount > DEBUG_MAX_LINES) container.firstElementChild.remove();

    if (atBottom) container.scrollTop = container.scrollHeight;
}

/**
 * Debug Log to UI
 * Appends a message to the client log of the debug tab if debug mode is enabled
 * @param {string} message - Message to log
 */
function uiDebugLog(message) {
    if (!debugMode) return;

    const line = document.createElement('div');
    line.className = 'debug-line';
    line.textContent = `${uiDebugTime(new Date())} ${message}`;
    uiDebugAppend(document.getElementById('debug-client-log'), [line]);
}

/**
 * Server log entries received
 * @param {Object[]} entries - Log entries ({ time, level, message })
 * @param {boolean} reset - True if the entries are the complete buffer (replace the view)
 */
function uiDebugServerLog(entries, reset) {
    const container = document.getElementById('debug-server-log');
    if (reset) container.replaceChildren();
    if (!Array.isArray(entries)) return;

    const maxLevel = parseInt(document.getElementById('debug-server-filter').value, 10);
    const lines = entries.map(entry => {
        const level = SERVER_LOG_LEVELS.includes(entry.level) ? entry.level : 'info';
        const line = document.createElement('div');
        line.className = `debug-line level-${level}`;
        line.dataset.level = SERVER_LOG_LEVELS.indexOf(level);
        line.hidden = line.dataset.level > maxLevel;
        line.textContent = `${uiDebugTime(new Date(entry.time))} [${level.toUpperCase()}] ${entry.message}`;
        return line;
    });
    uiDebugAppend(container, lines);
    if (reset) container.scrollTop = container.scrollHeight;
}

/**
 * Show only the server log lines up to the selected level
 */
function uiDebugApplyServerFilter() {
    const maxLevel = parseInt(document.getElementById('debug-server-filter').value, 10);
    document.querySelectorAll('#debug-server-log .debug-line').forEach(line => {
        line.hidden = parseInt(line.dataset.level, 10) > maxLevel;
    });
}
