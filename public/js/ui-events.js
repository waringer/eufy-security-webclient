// Event list of the selected device: the events of one day from the station's history (with thumbnails).
// The main area shows either the live view / picture, the event list or (debug mode) the debug logs;
// a switch in the toolbar changes the view.
// A click on an event opens its image in a popup.

let currentView = 'live';       // 'live' | 'events' | 'debug'

let eventsDeviceSn = null;      // Device the list belongs to
let eventsDay = null;           // Displayed day (local date, midnight); kept when the device changes
let eventsRequest = null;       // { deviceSn, date } of the request we wait for
let eventsRequestTimer = null;  // Gives up on eventsRequest if the server does not answer
let eventsShown = [];           // Events of the displayed list (for the popup)
let popupIndex = -1;            // Index in eventsShown of the event in the popup, -1 = closed
let eventsRefreshTimers = [];   // Pending background reloads after a live event
let eventsRefreshPending = false;   // A background reload waits for the popup to close

const EVENTS_REFRESH_DELAYS_MS = [10000, 45000, 150000];
const EVENTS_REQUEST_TIMEOUT_MS = 75000;   // a little longer than the server's own deadline

/**
 * "YYYYMMDD" of a date (local)
 */
function uiEventsFormatDate(date) {
    return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Today at midnight (local)
 */
function uiEventsToday() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Seconds as m:ss
 */
function uiEventsFormatDuration(seconds) {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * What the station's AI found in an event, e.g. "Person, Pet" or "Person (Alex)"; '' if nothing is known
 */
function uiEventsDetectionLabel(event) {
    return uiEventsFormatDetections(event.detections, event.persons);
}

/**
 * Kinds of detections and names of recognised persons as text
 */
function uiEventsFormatDetections(detections, persons) {
    const labels = { person: 'Person', vehicle: 'Vehicle', pet: 'Pet', sound: 'Sound', crying: 'Crying', package: 'Package' };
    const kinds = (detections || []).map(kind => labels[kind] || kind);
    const names = persons || [];
    return kinds.join(', ') + (names.length > 0 ? ` (${names.join(', ')})` : '');
}

/**
 * Show the detection pictures of an event below the image of the popup
 */
function uiEventsShowCrops(event) {
    const base = typeof transcodeServerUrl === 'string' ? transcodeServerUrl : '';
    const figures = (event.crops || []).map(crop => {
        const figure = document.createElement('figure');

        const img = document.createElement('img');
        img.alt = '';
        img.src = `${base}/event-crop/${encodeURIComponent(crop.pictureId)}`;
        img.addEventListener('error', () => figure.remove());

        const caption = document.createElement('figcaption');
        caption.textContent = uiEventsFormatDetections(crop.detections, crop.person ? [crop.person] : []);

        figure.append(img, caption);
        return figure;
    });
    document.getElementById('event-popup-crops').replaceChildren(...figures);
}

/**
 * URL of an event's thumbnail
 */
function uiEventsThumbUrl(event) {
    const base = typeof transcodeServerUrl === 'string' ? transcodeServerUrl : '';
    return `${base}/event-thumb/${encodeURIComponent(event.recordId)}`;
}

/**
 * Show a text instead of the event list
 */
function uiEventsMessage(text) {
    const message = document.createElement('div');
    message.className = 'events-message';
    message.textContent = text;
    document.getElementById('events-list').replaceChildren(message);
}

/**
 * Update the day navigation
 */
function uiEventsUpdateNav() {
    const day = eventsDay || uiEventsToday();
    const isToday = day.getTime() >= uiEventsToday().getTime();

    document.getElementById('events-date').textContent =
        day.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
    document.getElementById('events-next').disabled = isToday;
    document.getElementById('events-next7').disabled = isToday;
    document.getElementById('events-today').disabled = isToday;
}

/**
 * Move the displayed day (never beyond today) and reload
 * @param {number} days - Days to move, negative = back
 */
function uiEventsShiftDay(days) {
    const day = eventsDay || uiEventsToday();
    const moved = new Date(day.getFullYear(), day.getMonth(), day.getDate() + days);
    eventsDay = moved.getTime() > uiEventsToday().getTime() ? uiEventsToday() : moved;
    uiEventsLoad();
}

/**
 * Switch the main area between the live view / picture ('live'), the event list ('events') and the debug logs ('debug')
 * @param {string} view - 'live', 'events' or 'debug' (only in debug mode)
 */
function uiSetView(view) {
    const previous = currentView;
    currentView = view === 'events' || (view === 'debug' && debugMode) ? view : 'live';
    document.querySelector('.main-content').dataset.view = currentView;
    uiUpdateViewSwitch();
    if (currentView === 'events') uiEventsLoad();
    if (previous !== currentView && (previous === 'debug' || currentView === 'debug')) uiDebugOnViewChange(currentView === 'debug');
}

/**
 * Mark the active button of the view switch
 */
function uiUpdateViewSwitch() {
    document.querySelectorAll('#view-switch button').forEach(button => {
        button.classList.toggle('active', button.dataset.view === currentView);
    });
}

/**
 * Create the view switch for the toolbar (the toolbar is rebuilt now and then, so it is created on demand)
 * @returns {HTMLElement} Switch element
 */
function uiCreateViewSwitch() {
    const container = document.createElement('div');
    container.id = 'view-switch';

    const views = [['live', 'Live'], ['events', 'Events']];
    if (debugMode) views.push(['debug', 'Debug']);
    views.forEach(([view, label]) => {
        const button = document.createElement('button');
        button.dataset.view = view;
        button.textContent = label;
        button.addEventListener('click', () => uiSetView(view));
        container.appendChild(button);
    });

    container.querySelector(`[data-view="${currentView}"]`).classList.add('active');
    return container;
}

/**
 * Request the events of the displayed day (only while the event list is shown)
 */
function uiEventsLoad() {
    if (currentView !== 'events' || !eventsDeviceSn) return;

    if (!eventsDay) eventsDay = uiEventsToday();
    eventsRefreshPending = false;   // this load is the refresh
    uiEventsClosePopup();
    uiEventsUpdateNav();
    uiEventsMessage('Loading...');

    uiEventsSendRequest({ deviceSn: eventsDeviceSn, date: uiEventsFormatDate(eventsDay) });
}

/**
 * Send a request for an event list; an answer that does not come in time is treated as a failed one
 * @param {Object} request - { deviceSn, date, background? }
 */
function uiEventsSendRequest(request) {
    clearTimeout(eventsRequestTimer);
    eventsRequest = request;
    eventsRequestTimer = setTimeout(() => {
        if (eventsRequest !== request) return;
        uiEventsShow({ success: false, errorCode: 'no answer from the server', result: { serialNumber: request.deviceSn, date: request.date } });
    }, EVENTS_REQUEST_TIMEOUT_MS);
    eufyDeviceGetEvents(request.deviceSn, request.date);
}

/**
 * The connection to the server is gone: its answer to an open request will not come. The list is loaded again
 * when the device is selected after the reconnect.
 */
function uiEventsOnDisconnect() {
    clearTimeout(eventsRequestTimer);
    eventsRefreshTimers.forEach(clearTimeout);
    eventsRefreshTimers = [];
    eventsRequest = null;
    eventsRefreshPending = false;
    eventsDeviceSn = null;
}

/**
 * A live event of a device arrived (detection or new event picture): if its list of today is shown, reload it
 * in the background. The station writes the event when the recording starts and completes it (end, detections)
 * later, so the list is read several times.
 * @param {string} deviceSn - Serial number of the device the event belongs to
 */
function uiEventsOnLiveEvent(deviceSn) {
    if (!uiEventsShowsToday(deviceSn)) return;

    eventsRefreshTimers.forEach(clearTimeout);
    eventsRefreshTimers = EVENTS_REFRESH_DELAYS_MS.map(delay => setTimeout(uiEventsRefresh, delay));
}

/**
 * True while the event list of today is shown for the device
 */
function uiEventsShowsToday(deviceSn) {
    return currentView === 'events' && deviceSn === eventsDeviceSn && !!eventsDay && eventsDay.getTime() === uiEventsToday().getTime();
}

/**
 * Reload the shown list of today without clearing it; waits while the popup is open (its event would move)
 */
function uiEventsRefresh() {
    if (!uiEventsShowsToday(eventsDeviceSn) || eventsRequest) return;
    if (popupIndex >= 0) {
        eventsRefreshPending = true;
        return;
    }

    eventsRefreshPending = false;
    uiEventsSendRequest({ deviceSn: eventsDeviceSn, date: uiEventsFormatDate(eventsDay), background: true });
}

/**
 * The selected device changed: show the same day for the new device
 * @param {string} deviceSn - Serial number of the new device
 */
function uiEventsOnDeviceChange(deviceSn) {
    if (deviceSn === eventsDeviceSn && eventsDay) return;

    eventsDeviceSn = deviceSn;
    if (!eventsDay) eventsDay = uiEventsToday();
    eventsRequest = null;
    eventsShown = [];
    document.getElementById('events-list').replaceChildren();
    uiEventsUpdateNav();
    uiEventsLoad();
}

/**
 * Show the answer of device.get_events
 * @param {Object} message - Result message { success, errorCode, result: { serialNumber, date, events } }
 */
function uiEventsShow(message) {
    const result = message.result || {};

    // Ignore answers of an earlier request (device or day changed meanwhile)
    if (!eventsRequest || result.serialNumber !== eventsRequest.deviceSn || result.date !== eventsRequest.date) return;
    const background = eventsRequest.background;
    eventsRequest = null;
    clearTimeout(eventsRequestTimer);

    // A failed or outdated background refresh keeps the list as it is
    if (background && (!message.success || popupIndex >= 0)) {
        eventsRefreshPending = popupIndex >= 0;
        return;
    }

    if (!message.success) {
        eventsShown = [];
        uiEventsMessage(`Events not available: ${message.errorCode || 'unknown error'}`);
        return;
    }

    eventsShown = result.events || [];
    if (eventsShown.length === 0) {
        uiEventsMessage('No events on this day.');
        return;
    }

    const items = eventsShown.map((event, index) => {
        const item = document.createElement('div');
        item.className = 'event-item';

        const link = document.createElement('a');
        link.className = 'event-thumb';
        link.href = uiEventsThumbUrl(event);
        link.addEventListener('click', (e) => {
            e.preventDefault();     // popup instead of a new tab
            uiEventsOpenPopup(index);
        });
        if (event.hasThumbnail) {
            const img = document.createElement('img');
            img.loading = 'lazy';
            img.alt = '';
            img.src = link.href;
            img.addEventListener('error', () => { link.classList.add('no-thumb'); img.remove(); });
            link.appendChild(img);
        } else {
            link.classList.add('no-thumb');
        }

        const meta = document.createElement('div');
        meta.className = 'event-meta';

        const time = document.createElement('div');
        time.className = 'event-time';
        time.textContent = (event.start || '').slice(11, 19);

        const duration = document.createElement('div');
        duration.className = 'event-duration';
        duration.textContent = uiEventsFormatDuration(event.durationSec || 0);
        if (event.hasRecording) {
            duration.classList.add('has-recording');
            duration.title = 'Recording available';
        }

        meta.append(time, duration);

        const detection = document.createElement('div');
        detection.className = 'event-detection';
        detection.textContent = uiEventsDetectionLabel(event);
        detection.title = detection.textContent;

        item.append(link, meta, detection);
        return item;
    });

    document.getElementById('events-list').replaceChildren(...items);
}

// ============================================================================
// Popup
// ============================================================================

/**
 * Show the event with the given index of the list in the popup
 * @param {number} index - Index in eventsShown
 */
function uiEventsOpenPopup(index) {
    const event = eventsShown[index];
    if (!event) return;
    popupIndex = index;

    const select = document.getElementById('device-select');
    const deviceName = select && select.selectedIndex >= 0 ? select.options[select.selectedIndex].textContent : event.deviceSn;
    const detection = uiEventsDetectionLabel(event);
    document.getElementById('event-popup-title').textContent =
        `${deviceName} - ${event.start || ''} (${uiEventsFormatDuration(event.durationSec || 0)})${detection ? ` - ${detection}` : ''}`;

    const image = document.getElementById('event-popup-image');
    image.classList.toggle('no-thumb', !event.hasThumbnail);
    image.src = event.hasThumbnail ? uiEventsThumbUrl(event) : '';
    uiEventsShowCrops(event);
    uiEventsResetRecording(event);

    document.getElementById('event-popup-prev').disabled = index <= 0;
    document.getElementById('event-popup-next').disabled = index >= eventsShown.length - 1;

    // The arrow keys must not pan the camera while the popup is open
    inConfig = true;
    document.getElementById('event-popup').classList.add('show');
}

/**
 * Close the popup
 */
function uiEventsClosePopup() {
    if (popupIndex < 0) return;
    popupIndex = -1;
    document.getElementById('event-popup').classList.remove('show');
    document.getElementById('event-popup-image').src = '';
    document.getElementById('event-popup-crops').replaceChildren();
    uiEventsResetRecording(null);
    inConfig = false;
    if (eventsRefreshPending) uiEventsRefresh();
}

/**
 * URL of an event's recording (MP4, downloaded from the station on the first request)
 */
function uiEventsVideoUrl(event) {
    const base = typeof transcodeServerUrl === 'string' ? transcodeServerUrl : '';
    return `${base}/event-video/${encodeURIComponent(event.recordId)}`;
}

/**
 * Stop a playing recording and show the image again; offers the recording of the event if it has one
 * @param {Object|null} event - Event shown in the popup, null when the popup closes
 */
function uiEventsResetRecording(event) {
    const video = document.getElementById('event-popup-video');
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.hidden = true;
    document.getElementById('event-popup-image').hidden = false;

    const hasRecording = !!(event && event.hasRecording);
    uiEventsRecordingStatus('');
    uiEventsRecordingBusy(false);
    document.getElementById('event-popup-stage').classList.toggle('has-recording', hasRecording);
    document.getElementById('event-popup-play').hidden = !hasRecording;
    document.getElementById('event-popup-download').hidden = !hasRecording;
}

/**
 * Status line over the bottom of the image / video; hidden while empty
 */
function uiEventsRecordingStatus(text, isError = false) {
    const status = document.getElementById('event-popup-recording-status');
    status.textContent = text;
    status.classList.toggle('error', isError);
    status.hidden = !text;
}

/**
 * Lock / unlock the recording buttons while a recording is fetched
 */
function uiEventsRecordingBusy(busy) {
    const play = document.getElementById('event-popup-play');
    play.disabled = busy;
    play.classList.toggle('loading', busy);
    document.getElementById('event-popup-download').disabled = busy;
}

/**
 * Make sure the server holds the recording of an event. The first request waits until the station sent it,
 * so the state is shown while loading. A one-byte request: the file itself is fetched by the player / download.
 * @param {Object} event - Event of the popup
 * @returns {Promise<boolean>} True if the recording is available and the popup still shows the event
 */
async function uiEventsPrepareRecording(event) {
    uiEventsRecordingBusy(true);
    uiEventsRecordingStatus('Loading recording from the station…');
    try {
        const response = await fetch(uiEventsVideoUrl(event), { headers: { Range: 'bytes=0-0' } });
        if (!response.ok) throw new Error(await response.text() || `HTTP ${response.status}`);
        if (response.body) response.body.cancel().catch(() => { });
    } catch (error) {
        if (eventsShown[popupIndex] !== event) return false;   // popup moved on
        uiEventsRecordingStatus(`Recording not available: ${error.message}`, true);
        uiEventsRecordingBusy(false);
        return false;
    }
    if (eventsShown[popupIndex] !== event) return false;
    uiEventsRecordingStatus('');
    uiEventsRecordingBusy(false);
    return true;
}

/**
 * Play the recording of the event in the popup in place of the image
 */
async function uiEventsPlayRecording() {
    const event = eventsShown[popupIndex];
    if (!event || !event.hasRecording) return;
    if (document.getElementById('event-popup-play').disabled) return;   // already loading
    if (!await uiEventsPrepareRecording(event)) return;

    document.getElementById('event-popup-play').hidden = true;
    const video = document.getElementById('event-popup-video');
    video.src = uiEventsVideoUrl(event);
    video.hidden = false;
    document.getElementById('event-popup-image').hidden = true;
    video.play().catch(() => { /* autoplay refused: the controls stay */ });
}

/**
 * Save the recording of the event in the popup as MP4 file (works without playing it).
 * The server sends it as attachment, so the page stays where it is - also when the stream server is
 * another origin, where the download attribute of a link would be ignored.
 */
async function uiEventsDownloadRecording() {
    const event = eventsShown[popupIndex];
    if (!event || !event.hasRecording || !await uiEventsPrepareRecording(event)) return;

    const name = `${event.deviceSn}_${String(event.start || event.recordId).replace(/[^0-9]/g, '')}`;
    const link = document.createElement('a');
    link.href = `${uiEventsVideoUrl(event)}?download=${encodeURIComponent(name)}`;
    link.download = `${name}.mp4`;
    document.body.appendChild(link);
    link.click();
    link.remove();
}

/**
 * Move in the popup to the previous / next event of the list
 * @param {number} step - -1 (earlier in the list) or +1
 */
function uiEventsStepPopup(step) {
    const index = popupIndex + step;
    if (popupIndex >= 0 && index >= 0 && index < eventsShown.length) uiEventsOpenPopup(index);
}

document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('events-panel')) return;

    document.querySelector('.main-content').dataset.view = currentView;

    document.getElementById('events-reload').addEventListener('click', uiEventsLoad);
    document.getElementById('events-prev7').addEventListener('click', () => uiEventsShiftDay(-7));
    document.getElementById('events-prev').addEventListener('click', () => uiEventsShiftDay(-1));
    document.getElementById('events-next').addEventListener('click', () => uiEventsShiftDay(1));
    document.getElementById('events-next7').addEventListener('click', () => uiEventsShiftDay(7));
    document.getElementById('events-today').addEventListener('click', () => {
        eventsDay = uiEventsToday();
        uiEventsLoad();
    });
    uiEventsUpdateNav();

    // Popup: close button, click on the backdrop, Escape; arrows / buttons step through the events
    const popup = document.getElementById('event-popup');
    document.getElementById('event-popup-close').addEventListener('click', uiEventsClosePopup);
    popup.addEventListener('click', (e) => { if (e.target === popup) uiEventsClosePopup(); });
    document.getElementById('event-popup-prev').addEventListener('click', () => uiEventsStepPopup(-1));
    document.getElementById('event-popup-next').addEventListener('click', () => uiEventsStepPopup(1));
    document.getElementById('event-popup-play').addEventListener('click', uiEventsPlayRecording);
    document.getElementById('event-popup-image').addEventListener('click', uiEventsPlayRecording);
    document.getElementById('event-popup-download').addEventListener('click', uiEventsDownloadRecording);
    document.getElementById('event-popup-video').addEventListener('error', (e) => {
        if (!e.target.getAttribute('src')) return;   // reset, not a playback error
        uiEventsRecordingStatus('The recording cannot be played in this browser.', true);
    });
    document.addEventListener('keydown', (e) => {
        if (popupIndex < 0) return;
        if (e.target && e.target.tagName === 'VIDEO' && e.key !== 'Escape') return;   // arrows seek the video
        if (e.key === 'Escape') uiEventsClosePopup();
        else if (e.key === 'ArrowLeft') uiEventsStepPopup(-1);
        else if (e.key === 'ArrowRight') uiEventsStepPopup(1);
        else return;
        e.preventDefault();
    });
});
