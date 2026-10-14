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
  "FFMPEG_SHORT_KEYFRAMES": false
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

### Environment Variables

| Variable                | Default                | Description |
|-------------------------|------------------------|-------------|
| LOGGINGLEVEL            | 2                      | Logging verbosity (0=error, 1=warn, 2=info, 3=debug, 4=trace) |
| TRANSCODING_PRESET      | ultrafast              | ffmpeg preset for transcoding |
| TRANSCODING_CRF         | 23                     | ffmpeg CRF value (quality) |
| VIDEO_SCALE             | 1280:-2                | ffmpeg video scaling |
| FFMPEG_THREADS          | 4                      | Number of ffmpeg threads |
| FFMPEG_SHORT_KEYFRAMES  | false                  | Use short keyframes (true/false) |
| FFMPEG_MINLOGLEVEL      | warning                | ffmpeg log level |
| STATIC_DIR              | ./public               | Path to static files |
| DATA_DIR                | ./data                 | Path for persistent configuration storage |

You can set these in your `docker-compose.yml`, Docker run command, or as environment variables locally.

**Note**: When settings are defined in both Environment Variables and `config.json`, values in `data/config.json` take priority over the Environment Variables.


**Note**: Transcoding configuration can be changed dynamically at runtime via the web UI (Config button) or REST API endpoints. Changes are persisted to `data/config.json`.


## Usage

### Web Interface
1. Open the web client in your browser (default: [http://localhost:3001](http://localhost:3001))
2. Select a device from the dropdown menu in the sidebar
3. View detailed device properties in collapsible, grouped sections:
   - Click section headers to expand/collapse property groups
   - Click the pin icon 📌 to keep important sections always visible
   - Pinned sections remain open and are remembered in your browser
4. Click "Start Video" to begin streaming
5. Use the control buttons or keyboard shortcuts for PTZ and presets
6. Click "Config" to adjust transcoding settings in real-time (if available)
7. Use the theme toggle button (🔆/🌙) to switch between light and dark mode
8. Use the "Live" / "Events" switch in the toolbar to change between the live view and the event list

**Note**: Device selection is locked while video is streaming to prevent conflicts. Stop the video before switching devices.

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
- **GET /quit**: Gracefully shut down the server
- **Static files**: All files in `/public` are served at the root path

### WebSocket API
The server provides a JSON-based WebSocket API at `ws://localhost:3001/api` for:
- Real-time device status updates
- Camera control commands
- Event notifications (motion, person, pet, vehicle, sound detection)
- Event history of a device (`device.get_events`)

See [server/ws-api.js](server/ws-api.js) and the command handlers in [server/eufy-client.js](server/eufy-client.js) for details.

## Development

### Debug Mode
Enable client debug mode by setting `debugMode = true` at the top of `public/js/main.js` to see detailed console logs and additional debug information in the UI. For the server, set or change the `LOGGINGLEVEL` environment variable.

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
- **server/utils.js**: Configuration management and logging utilities

**Frontend (Browser):**
- **js/main.js**: Application initialization and configuration
- **js/ui.js**: UI event handlers and DOM manipulation
- **js/ui-deviceproperties.js**: Device property definitions, formatting, and grouped display logic
- **js/ui-events.js**: Event list with day navigation, event popup and live refresh
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

## Troubleshooting

### Video not playing
- Verify ffmpeg is installed (for local installations)
- Check browser console for errors
- If you get a 409 error, another device is currently streaming - wait until it finishes
- Ensure the selected device supports video streaming

### Connection issues
- Verify Eufy credentials in `data/config.json` are correct
- Check server logs for authentication errors
- Ensure port 3001 is not blocked by firewall
- Captcha and 2FA requests of the Eufy login are shown as a dialog in the web UI; keep it open during the first login
- WebSocket connections automatically reconnect after 5 seconds if disconnected unexpectedly

### Performance issues
- Adjust TRANSCODING_PRESET to a faster preset (e.g., `superfast` or `ultrafast`)
- Increase FFMPEG_THREADS based on your CPU cores
- Lower VIDEO_SCALE resolution if needed
- Use the Config UI to fine-tune transcoding parameters in real-time

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
