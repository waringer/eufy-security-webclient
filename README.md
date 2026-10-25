# Eufy Security Web Client

A web-based client and video transcoding server using [eufy-sdk](https://github.com/mega-yfue/eufy-sdk), enabling live video streaming, device control, and H.265 to H.264/AAC transcoding via ffmpeg. This project provides a simple web UI for interacting with Eufy security cameras and connects directly to the Eufy Cloud.

## Features
- **Live video streaming** from Eufy cameras with H.265 to H.264/AAC transcoding (supports both H.265 and H.264 streams)
- **Automatic snapshot extraction** from video stream with adaptive keyframe detection
- **Device selection and control** via intuitive web UI
- **Comprehensive device property display** with collapsible, grouped sections and pinning support
- **Theme switcher** with light and dark mode support (persisted in browser)
- **Fast, low-latency playback** using Media Source Extensions (MSE)
- **Auto-reconnect** for WebSocket connections with visual countdown
- **Keyboard shortcuts** for PTZ control and camera presets
- **Event history** of each camera, read from the HomeBase: one day at a time with thumbnail, time and duration
- **Detection details per event**: what the station's AI recognised (person, vehicle, pet, sound) including the names of recognised persons and the detection pictures
- **Live update of the event list** when a new event of the shown camera arrives
- **Real-time notifications** for motion, person, pet, vehicle and sound detection events
- **Smart picture update detection** with hash-based change tracking
- **Dynamic transcoding configuration** via REST API and web UI
- **Hardware acceleration** with Intel GPUs (VAAPI) for decoding, scaling and encoding on weak CPUs
- **Debug view** in the web UI with the client log and the live server log (level filter, download)
- **Log levels for server, ffmpeg and Eufy SDK** set in the web UI, applied without restart
- **Health check endpoint** for monitoring server status
- **Docker support** for easy deployment
- **Modular architecture** with separated UI, video, and WebSocket logic

## Project Structure
```
eufy-security-webclient/
├── public/                # Static web UI files
│   ├── css/              # Stylesheets
│   │   ├── styles.css        # Base styles with CSS variables
│   │   ├── dark-theme.css    # Dark theme colors
│   │   └── light-theme.css   # Light theme colors
│   ├── js/               # Client-side JavaScript
│   │   ├── main.js               # Application initialization
│   │   ├── ui.js                 # UI event handling and DOM manipulation
│   │   ├── ui-deviceproperties.js # Device property definitions and display
│   │   ├── ui-events.js          # Event list, event popup and live refresh
│   │   ├── ui-debug.js           # Debug view (client and server log)
│   │   ├── video.js              # Video player and MSE logic
│   │   ├── ws-client.js          # WebSocket client communication
│   │   └── theme-switcher.js     # Theme switching logic
│   ├── index.html        # Main HTML UI
│   └── favicon.ico       # Favicon
├── server/                # Server-side modules
│   ├── eufy-client.js    # Eufy Security Client integration
│   ├── eufy-sdk.js       # Loader for the ESM-only eufy-sdk
│   ├── events.js         # Event history, thumbnails and detection pictures of a station
│   ├── property-meta.js  # Device properties and their description for the web UI
│   ├── transcode.js      # FFmpeg transcoding and snapshot extraction
│   ├── ws-api.js         # WebSocket API server
│   ├── rest.js           # REST API and HTTP server
│   └── utils.js          # Utility functions and configuration
├── main.js                # Main server entry point
├── package.json           # Project dependencies
├── Dockerfile             # Docker image configuration
├── docker-compose.yml     # Docker Compose setup
├── LICENSE                # BSD-3-Clause license
└── README.md              # This file
```

## Prerequisites
- **Eufy account credentials**: Username, password, and country code for Eufy Cloud authentication
- **Node.js >= 24.5** (required by eufy-sdk)
- **ffmpeg** (automatically installed in Docker)

## Installation

### 1. Docker (Recommended)

#### Build and Run with Docker Compose
```sh
docker-compose up --build
```
This will build the image and start the server on port `3001`.

#### Standalone Docker Build
```sh
docker build -t eufy-security-webclient .
docker run -p 3001:3001 \
  -v ./data:/app/data \
  eufy-security-webclient
```
The `-v ./data:/app/data` volume mount ensures configuration and Eufy authentication data persist across container restarts.

**First-time setup**: Create `data/config.json` to add your Eufy credentials before starting the server or set Environment Variables and change Eufy settings using the web UI.

### 2. Local (npm)

Install dependencies:
```sh
npm install
```
Run the server:
```sh
npm start
```
The web client will be available at [http://localhost:3001](http://localhost:3001).

## Configuration

Configuration is managed through `data/config.json`. Create this file before first run:

```json
{
  "EUFY_CONFIG": {
    "username": "your-eufy-email@example.com",
    "password": "your-eufy-password",
    "persistentDir": "./data",
    "country": "US"
  },
  "TRANSCODING_PRESET": "ultrafast",
  "TRANSCODING_CRF": "23",
  "VIDEO_SCALE": "1280:-2",
  "FFMPEG_THREADS": "4",
  "FFMPEG_SHORT_KEYFRAMES": false,
  "HWACCEL": "none",
  "LOG_LEVEL": 2,
  "FFMPEG_LOG_LEVEL": "warning",
  "SDK_LOG_LEVEL": "off"
}
```

### Configuration Options

| Option                  | Default                | Description |
|-------------------------|------------------------|-------------|
| EUFY_CONFIG.username    | (required)             | Your Eufy account email |
| EUFY_CONFIG.password    | (required)             | Your Eufy account password |
| EUFY_CONFIG.persistentDir | ./data              | Directory for Eufy client data |
| EUFY_CONFIG.country     | US                     | Country code (US, DE, UK, etc.) |
| TRANSCODING_PRESET      | ultrafast              | ffmpeg preset for transcoding |
| TRANSCODING_CRF         | 23                     | ffmpeg CRF value (quality, 0-51) |
| VIDEO_SCALE             | 1280:-2                | ffmpeg video scaling |
| FFMPEG_THREADS          | 4                      | Number of ffmpeg threads |
| FFMPEG_SHORT_KEYFRAMES  | false                  | Use short keyframes (true/false) |
| HWACCEL                 | none                   | Hardware acceleration: `none` (libx264) or `vaapi` (Intel GPU, see below) |
| LOG_LEVEL               | 2 (or `LOGGINGLEVEL`)  | Server log level (0=error, 1=warn, 2=info, 3=debug, 4=trace; 4 also writes an ffmpeg report file) |
| FFMPEG_LOG_LEVEL        | warning (or `FFMPEG_MINLOGLEVEL`) | ffmpeg log level (quiet ... trace) |
| SDK_LOG_LEVEL           | off                    | Eufy SDK log level (off, error, warn, info, debug) |

### Environment Variables

| Variable                | Default                | Description |
|-------------------------|------------------------|-------------|
| LOGGINGLEVEL            | 2                      | Initial server log level (0=error, 1=warn, 2=info, 3=debug, 4=trace); `LOG_LEVEL` in the configuration takes precedence |
| TRANSCODING_PRESET      | ultrafast              | ffmpeg preset for transcoding |
| TRANSCODING_CRF         | 23                     | ffmpeg CRF value (quality) |
| VIDEO_SCALE             | 1280:-2                | ffmpeg video scaling |
| FFMPEG_THREADS          | 4                      | Number of ffmpeg threads |
| FFMPEG_SHORT_KEYFRAMES  | false                  | Use short keyframes (true/false) |
| HWACCEL                 | none                   | Hardware acceleration (`none` / `vaapi`) |
| HWACCEL_DEVICE          | /dev/dri/renderD128    | VAAPI render device |
| LIBVA_DRIVER_NAME       | (auto)                 | VAAPI driver; set `i965` for older Intel GPUs (e.g. Braswell, Haswell) |
| FFMPEG_MINLOGLEVEL      | warning                | Initial ffmpeg log level; `FFMPEG_LOG_LEVEL` in the configuration takes precedence |
| STATIC_DIR              | ./public               | Path to static files |
| DATA_DIR                | ./data                 | Path for persistent configuration storage |

You can set these in your `docker-compose.yml`, Docker run command, or as environment variables locally.

**Note**: When settings are defined in both Environment Variables and `config.json`, values in `data/config.json` take priority over the Environment Variables.


**Note**: The configuration can be changed at runtime via the web UI (⚙ button) or the REST API. Changes are persisted to `data/config.json`. Changed transcoding settings restart a running ffmpeg, changed Eufy credentials reconnect to the Eufy Cloud, log levels apply at once.

### Hardware Acceleration (Intel VAAPI)
On weak CPUs (e.g. Celeron/Atom without AVX) decoding the H.265 stream of the camera is the main load. With `HWACCEL=vaapi` decoding, scaling and H.264 encoding run on the Intel GPU:

1. Pass the GPU into the container: `--device /dev/dri:/dev/dri` (Docker run) or the `devices` section in `docker-compose.yml`
2. Older GPUs need the i965 driver: `LIBVA_DRIVER_NAME=i965`; check the supported profiles with `apk add libva-utils && vainfo` in the container (`VAProfileHEVCMain : VAEntrypointVLD` and `VAProfileH264Main : VAEntrypointEncSlice` are needed)
3. Select "VAAPI" in the configuration dialog (or set `HWACCEL=vaapi`)

With VAAPI, `TRANSCODING_CRF` is used as constant quantizer (`-qp`); `TRANSCODING_PRESET` and `FFMPEG_THREADS` have no effect. The Docker image contains the Intel drivers (x86_64 only).

Tested with a Celeron N3150 (Braswell, i965 driver): `VIDEO_SCALE` `1152:-2` (half the camera resolution) runs with low CPU load.


## Usage

### Web Interface
1. Open the web client in your browser (default: [http://localhost:3001](http://localhost:3001))
2. Select a device from the dropdown menu in the sidebar
3. View detailed device properties in collapsible, grouped sections:
   - Click section headers to expand/collapse property groups
   - Click the pin icon 📌 to keep important sections always visible
   - Pinned sections remain open and are remembered in your browser
4. Click "Start Video" (next to the "Live" / "Events" switch) to begin streaming
5. Use the control buttons or keyboard shortcuts for PTZ and presets
6. Click ⚙ to adjust the configuration (Eufy account, transcoding, logging) in real-time (if available)
7. Use the theme toggle button (🔆/🌙) to switch between light and dark mode
8. Use the "Live" / "Events" switch in the toolbar to change between the live view and the event list ("Debug" is added in debug mode)

The ⏻ icon at the right of the header shows the connection to the server (green = connected, orange = connecting, red = disconnected); click it to disconnect or connect.

**Note**: Device selection and the device refresh button are locked while video is streaming to prevent conflicts. Stop the video before switching devices.

### Direct Video Stream Access
You can access the transcoded video stream directly without using the web interface:
- **URL format**: `http://localhost:3001/<SERIAL_NUMBER>.mp4`
- **Example**: `http://localhost:3001/T8410P11234567890.mp4`

This allows you to:
- Open the stream directly in **VLC Media Player** or other media players
- Embed the stream in your own applications
- View the stream in a browser's native video player
- Use it with home automation systems or monitoring dashboards

The stream will start automatically when accessed and uses fMP4 format with H.264 video and AAC audio.

### Automatic Snapshots
The server automatically extracts high-quality JPEG snapshots from the video stream:
- Uses **adaptive keyframe detection** to identify I-frames with best quality
- Snapshots are saved to `data/snapshots/<SERIAL_NUMBER>.jpg`
- Automatically updated whenever a device is streaming
- Available for all WebSocket clients via picture property updates

### Event List
The "Events" view shows the events of the selected camera that are stored on its HomeBase:
- **One day at a time**: step a day or a week back and forth, jump to today or reload the list
- **Each event** shows its thumbnail, start time, duration and what was detected, e.g. `Person, Pet` or `Person (Alex)` for a recognised person
- **Click an event** to open its image in a popup; the detection pictures (the parts of the image the AI recognised something in) are shown below it. The arrow keys or the buttons step through the events of the day, Escape closes the popup
- **Live update**: while the list of today is shown, it reloads in the background when a new event of that camera arrives (several times, because the station completes an event only after its recording has ended)

The event history and the pictures are read from the station over P2P and cached in `data/event-thumbs` and `data/event-crops`.

**Note**: The detection details need a station that answers the combined event query of the Eufy app (verified with a HomeBase 3). Other stations show the event list without them. Person, vehicle, pet and sound were checked against the Eufy app; crying and package detections are mapped but not verified.

### Notifications
The web client displays real-time notifications for:
- **Motion detection events**
- **Person and stranger detection events**
- **Pet, vehicle, sound and crying detection events**

The browser's native notification system is used.

### Keyboard Shortcuts
- **Arrow Keys**: PTZ control (Pan/Tilt - Up/Down/Left/Right)
- **Home Key**: Activate guard/patrol mode (camera scans right-left-center)
- **Numpad 1-6**: Quick access to camera presets (positions 1-6)

**Note**: Keyboard shortcuts only work when PTZ controls are available for the selected device.

### API Endpoints
- **GET /health**: Health check endpoint returning server status and configuration
- **GET /config**: Get current configuration
- **POST /config**: Update configuration (JSON body)
- **GET /:serialNumber.mp4**: Video transcoding stream endpoint (e.g., `/T8410P11234567890.mp4`)
- **GET /event-thumb/:recordId**: JPEG thumbnail of an event (only for events of a list the server delivered)
- **GET /event-crop/:pictureId**: JPEG detection picture of an event (only for events of a list the server delivered)
- **GET /logs**: The last 1000 server log entries as text file
- **GET /quit**: Gracefully shut down the server
- **Static files**: All files in `/public` are served at the root path

### WebSocket API
The server provides a JSON-based WebSocket API at `ws://localhost:3001/api` for:
- Real-time device status updates
- Camera control commands
- Event notifications (motion, person, pet, vehicle, sound detection)
- Event history of a device (`device.get_events`)
- Server log (`log.subscribe` sends the buffered entries and then every new one, `log.unsubscribe` stops it)

See [server/ws-api.js](server/ws-api.js) and the command handlers in [server/eufy-client.js](server/eufy-client.js) for details.

## Development

### Debug Mode
Open the configuration dialog (⚙) and enable "Show debug tab in this browser". The setting is stored per browser. It turns on detailed console logs and adds a "Debug" view next to "Live" / "Events" with:
- the client log (requests and received data of this web client)
- the server log (the last 1000 entries, then live), with a level filter and a download (`GET /logs`)

The server, ffmpeg and Eufy SDK log levels are set in the same dialog and apply without restarting the server (a running ffmpeg is restarted for a new ffmpeg level). The Eufy password is masked in the server log.

**Note**: The server log is visible to everyone who can open the web UI. With the Eufy SDK log level `debug`, SDK internals are logged as well; use it for troubleshooting only.

### Architecture
The project follows a modular architecture:

**Backend (Node.js):**
- **main.js**: Main entry point, initializes all modules
- **server/eufy-client.js**: Integration with @mega-yfue/eufy-sdk (login incl. captcha/2FA, livestream, events)
- **server/eufy-sdk.js**: Loads the ESM-only SDK into the CommonJS server
- **server/events.js**: Event history, thumbnails and detection pictures, read from the station over P2P
- **server/property-meta.js**: Device properties and their description for the generic property display
- **server/transcode.js**: FFmpeg transcoding engine
- **server/ws-api.js**: WebSocket API server for JSON-based communication
- **server/rest.js**: REST API and HTTP server with static file serving
- **server/utils.js**: Configuration management, logging (log levels, log buffer for the web UI, SDK logger)

**Frontend (Browser):**
- **js/main.js**: Application initialization and configuration
- **js/ui.js**: UI event handlers and DOM manipulation
- **js/ui-deviceproperties.js**: Device property definitions, formatting, and grouped display logic
- **js/ui-events.js**: Event list with day navigation, event popup and live refresh
- **js/ui-debug.js**: Debug view with client log and live server log
- **js/video.js**: Video player implementation using Media Source Extensions (MSE)
- **js/ws-client.js**: WebSocket client for server communication
- **js/theme-switcher.js**: Theme switching logic with localStorage persistence
- **css/styles.css**: Base styles with CSS variables
- **css/dark-theme.css**: Dark theme color scheme
- **css/light-theme.css**: Light theme color scheme
- **index.html**: UI structure

All code, comments, and variables are in English. The UI labels and messages are also in English by default.

## Notes
- **Direct Eufy Cloud connection**: This server connects directly to the Eufy Cloud using your credentials. No separate eufy-security-ws server is needed.
- **Only one device can be streamed at a time** per server instance. If multiple clients try to access different devices simultaneously, the second request will be rejected with a 409 Conflict error.
- **Persistent authentication**: Eufy authentication tokens are stored in `data/eufy-session.json`; captcha / 2FA requests on first login are answered in the web UI and persist across restarts.
- For production deployments, adjust configuration settings for optimal performance and quality
- ffmpeg is automatically installed in the Docker image
- Configuration changes made via the web UI are persisted to `data/config.json` and survive restarts
- **HomeBase S1 Pro (T9000) needs a 64-bit system**: its cameras are reached over WebRTC through the native `node-datachannel` module, which has no build for 32-bit ARM (armv7/armhf) or x86. All other devices work there as before.

## Troubleshooting

### Video not playing
- Verify ffmpeg is installed (for local installations)
- Check browser console for errors
- Check the server log for ffmpeg messages; raise the ffmpeg log level for more details
- If you get a 409 error, another device is currently streaming - wait until it finishes
- Ensure the selected device supports video streaming

### Connection issues
- Verify Eufy credentials in `data/config.json` are correct
- Check the server log for authentication errors (debug view in the web UI, or the console / `docker logs`); set the Eufy SDK log level to `debug` for details of the login
- Ensure port 3001 is not blocked by firewall
- Captcha and 2FA requests of the Eufy login are shown as a dialog in the web UI; keep it open during the first login
- WebSocket connections automatically reconnect after 5 seconds if disconnected unexpectedly

### Performance issues
- Adjust TRANSCODING_PRESET to a faster preset (e.g., `superfast` or `ultrafast`)
- Increase FFMPEG_THREADS based on your CPU cores
- Lower VIDEO_SCALE resolution if needed
- Use Intel GPU hardware acceleration (`HWACCEL=vaapi`, see Configuration) on weak CPUs
- Use the Config UI to fine-tune transcoding parameters in real-time

### "UDP receive buffer below … requested" warning
The Eufy SDK asks for a 4 MiB UDP receive buffer for the P2P video connection. The Linux kernel caps this at `net.core.rmem_max` (default ~208 KiB, logged as `granted 425984`). With the smaller buffer, bursts of video data (keyframes) can be dropped, which shows up as artefacts or freezes in live video.

`net.core.rmem_max` is a host-wide setting: it cannot be changed from inside the container, and `sysctls:` in `docker-compose.yml` does not work for this key. Raise it on the Docker host instead:

```bash
echo 'net.core.rmem_max=4194304' | sudo tee /etc/sysctl.d/99-eufy-udp.conf
sudo sysctl --system
docker compose restart
```

Check with `sysctl net.core.rmem_max`; after the restart the warning no longer appears in the log.

On Home Assistant OS (add-on) the host sysctls are not user-configurable. There the warning can be ignored as long as live video plays without artefacts.

### Event list issues
- "Events not available" means the station did not answer; the list needs a P2P connection to the HomeBase
- Events without a detection label: the station stored no detection for them, or it does not support the detection query
- A new event appears in the list a few seconds after it started; its duration and detections follow when the recording has ended

### Notification issues
- Ensure browser notifications are enabled for the site
- Check browser console for permission-related errors

### Multiple devices / concurrent streams
- The server supports **only one active stream at a time**
- Attempting to stream from a second device will return a 409 Conflict error
- Wait for the current stream to finish before starting a new one
- The device lock is released automatically after the stream ends

## License
BSD-3-Clause - See [LICENSE](LICENSE) file for details.

## Links
- [eufy-sdk](https://github.com/mega-yfue/eufy-sdk) - The SDK used to connect to Eufy (requires Node >= 24.5)

---

**Note on AI-Assisted Development**: AI tools (such as GitHub Copilot) were used as coding assistants during development. All code and documentation have been manually reviewed, tested, and refined by the author.
