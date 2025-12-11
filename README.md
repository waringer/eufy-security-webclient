# Eufy Security Web Client

A web-based client and video transcoding server using [eufy-security-client](https://github.com/bropat/eufy-security-client), enabling live video streaming, device control, and H.265 to H.264/AAC transcoding via ffmpeg. This project provides a simple web UI for interacting with Eufy security cameras and connects directly to the Eufy Cloud.

## Features
- **Live video streaming** from Eufy cameras with H.265 to H.264/AAC transcoding (supports both H.265 and H.264 streams)
- **Device selection and control** via intuitive web UI
- **Fast, low-latency playback** using Media Source Extensions (MSE)
- **Keyboard shortcuts** for PTZ control and camera presets
- **Real-time notifications** for motion detection and person detection events
- **Dynamic transcoding configuration** via REST API and web UI
- **Health check endpoint** for monitoring server status
- **Docker support** for easy deployment
- **Modular architecture** with separated UI, video, and WebSocket logic

## Project Structure
```
eufy-security-webclient/
├── public/                # Static web UI files
│   ├── index.html        # Main HTML UI
│   ├── index.css         # UI styles
│   ├── main.js           # Application initialization
│   ├── ui.js             # UI event handling and DOM manipulation
│   ├── video.js          # Video player and MSE logic
│   ├── ws-client.js      # WebSocket client communication
│   └── favicon.ico       # Favicon
├── server.js             # Main server entry point
├── eufy-client.js        # Eufy Security Client integration
├── transcode.js          # FFmpeg transcoding logic
├── ws-api.js             # WebSocket API server
├── rest.js               # REST API and HTTP server
├── utils.js              # Utility functions and configuration
├── package.json          # Project dependencies
├── Dockerfile            # Docker image configuration
├── docker-compose.yml    # Docker Compose setup
├── LICENSE               # BSD-3-Clause license
└── README.md             # This file
```

## Prerequisites
- **Eufy account credentials**: Username, password, and country code for Eufy Cloud authentication
- **Node.js >= 20**
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
    "country": "US",
    "language": "en"
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
| EUFY_CONFIG.language    | en                     | Language code (en, de, fr, etc.) |
| TRANSCODING_PRESET      | ultrafast              | ffmpeg preset for transcoding |
| TRANSCODING_CRF         | 23                     | ffmpeg CRF value (quality, 0-51) |
| VIDEO_SCALE             | 1280:-2                | ffmpeg video scaling |
| FFMPEG_THREADS          | 4                      | Number of ffmpeg threads |
| FFMPEG_SHORT_KEYFRAMES  | false                  | Use short keyframes (true/false) |

### Environment Variables

| Variable                | Default                | Description |
|-------------------------|------------------------|-------------|
| LOGGINGLEVEL            | 2                      | Logging verbosity (0-3) |
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
2. Select a device from the dropdown menu
3. Click "Start Video" to begin streaming
4. Use the control buttons or keyboard shortcuts for PTZ and presets
5. Click "Config" to adjust transcoding settings in real-time (if available)

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

### Notifications
The web client displays real-time notifications for:
- **Motion detection events**
- **Person detection events**

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
- **GET /quit**: Gracefully shut down the server
- **Static files**: All files in `/public` are served at the root path

### WebSocket API
The server provides a JSON-based WebSocket API at `ws://localhost:3001/api` for:
- Real-time device status updates
- Camera control commands
- Event notifications (motion, person detection)

See [ws-api.js](ws-api.js) for the complete API specification.

## Development

### Debug Mode
Enable client debug mode by setting `debugMode = true` at the top of `public/main.js` to see detailed console logs and additional debug information in the UI. For the server, set or change the `LOGGINGLEVEL` environment variable.

### Architecture
The project follows a modular architecture:

**Backend (Node.js):**
- **server.js**: Main entry point, initializes all modules
- **eufy-client.js**: Integration with eufy-security-client library
- **transcode.js**: FFmpeg transcoding engine
- **ws-api.js**: WebSocket API server for JSON-based communication
- **rest.js**: REST API and HTTP server with static file serving
- **utils.js**: Configuration management and logging utilities

**Frontend (Browser):**
- **main.js**: Application initialization and configuration
- **ui.js**: UI event handlers and DOM manipulation
- **video.js**: Video player implementation using Media Source Extensions (MSE)
- **ws-client.js**: WebSocket client for server communication
- **index.html/css**: UI structure and styling

All code, comments, and variables are in English. The UI labels and messages are also in English by default.

## Notes
- **Direct Eufy Cloud connection**: This server connects directly to the Eufy Cloud using your credentials. No separate eufy-security-ws server is needed.
- **Only one device can be streamed at a time** per server instance. If multiple clients try to access different devices simultaneously, the second request will be rejected with a 409 Conflict error.
- **Persistent authentication**: Eufy authentication tokens are stored in `data/persistent.json` and persist across restarts.
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
- For 2FA-enabled accounts, you may need to disable 2FA temporarily or use app-specific passwords

### Performance issues
- Adjust TRANSCODING_PRESET to a faster preset (e.g., `superfast` or `ultrafast`)
- Increase FFMPEG_THREADS based on your CPU cores
- Lower VIDEO_SCALE resolution if needed
- Use the Config UI to fine-tune transcoding parameters in real-time

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
- [eufy-security-client](https://github.com/bropat/eufy-security-client) - The client lib used to connect to Eufy

---

**Note on AI-Assisted Development**: AI tools (such as GitHub Copilot) were used as coding assistants during development. All code and documentation have been manually reviewed, tested, and refined by the author.
