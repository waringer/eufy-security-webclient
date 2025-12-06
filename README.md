# Eufy Security Web Client

A web-based client and video transcoding server for [eufy-security-ws](https://github.com/bropat/eufy-security-ws), enabling live video streaming, device control, and H.265 to H.264/AAC transcoding via ffmpeg. This project provides a simple web UI for interacting with Eufy security cameras and requires a running eufy-security-ws server.

## Features
- **Live video streaming** from Eufy cameras with H.265 to H.264/AAC transcoding
- **Device selection and control** via intuitive web UI
- **Fast, low-latency playback** using Media Source Extensions (MSE)
- **Keyboard shortcuts** for PTZ control and camera presets
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
├── server.js             # Node.js proxy server with transcoding
├── package.json          # Project dependencies
├── Dockerfile            # Docker image configuration
├── docker-compose.yml    # Docker Compose setup
├── LICENSE               # BSD-3-Clause license
└── README.md             # This file
```

## Prerequisites
- **eufy-security-ws server**: You must have a running instance of [eufy-security-ws](https://github.com/bropat/eufy-security-ws). This web client connects to it for device and video data.
- **Node.js >= 20**
- **ffmpeg** (automatically installed in Docker)

## Installation

### 1. Docker (Recommended)

#### Build and Run with Docker Compose
```sh
docker-compose up --build
```
This will build the image and start the proxy server on port `3001` (mapped to internal `3001`).

#### Standalone Docker Build
```sh
docker build -t eufy-security-webclient .
docker run -p 3001:3001 \
  -e EUFY_WS_URL=ws://<your-eufy-ws-host>:3000 \
  eufy-security-webclient
```

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

## Environment Variables

| Variable                | Default                | Description |
|-------------------------|------------------------|-------------|
| EUFY_WS_URL             | ws://localhost:3000    | URL of your eufy-security-ws server |
| LOGGINGLEVEL            | 2                      | Logging verbosity (0-3) |
| TRANSCODING_PRESET      | ultrafast              | ffmpeg preset for transcoding |
| TRANSCODING_CRF         | 23                     | ffmpeg CRF value (quality) |
| VIDEO_SCALE             | 1280:-2                | ffmpeg video scaling |
| FFMPEG_THREADS          | 4                      | Number of ffmpeg threads |
| FFMPEG_SHORT_KEYFRAMES  | false                  | Use short keyframes (true/false) |
| FFMPEG_MINLOGLEVEL      | warning                | ffmpeg log level |
| STATIC_DIR              | ./public               | Path to static files |

You can set these in your `docker-compose.yml`, Docker run command, or as environment variables locally.


## Usage

### Web Interface
1. Open the web client in your browser (default: [http://localhost:3001](http://localhost:3001))
2. Select a device from the dropdown menu
3. Click "Start Video" to begin streaming
4. Use the control buttons or keyboard shortcuts for PTZ and presets

### Keyboard Shortcuts
- **Arrow Keys**: PTZ control (Pan/Tilt)
- **Number Keys (1-6)**: Quick access to camera presets

### API Endpoints
- **GET /health**: Health check endpoint returning server status and configuration
- **GET /video/:deviceSerial**: Video transcoding stream endpoint
- **Static files**: All files in `/public` are served at the root path

### Using the Static Web UI Only
If you do not need video streaming or transcoding, you can use the files in the `public` folder directly as a static web UI. You can open `public/index.html` in your browser via the `file://` protocol or serve the folder with any static web server. Device management and status features will work as long as you connect to a running eufy-security-ws server. 

**Note**: The video feature requires the proxy server (`server.js`) for transcoding and will not function without it.

If you use the static files directly, you can edit the fallback configuration in `main.js` (around line 24-29) to set the correct WebSocket server URL and transcoding proxy URL for your environment.

## Development

### Debug Mode
Enable debug mode by setting `debugMode = true` at the top of `public/main.js` to see detailed console logs and additional debug information in the UI.

### Architecture
The project follows a modular architecture:
- **server.js**: Express server that handles ffmpeg transcoding
- **ws-client.js**: WebSocket client handling communication with eufy-security-ws
- **video.js**: Video player implementation using Media Source Extensions (MSE)
- **ui.js**: UI event handlers and DOM manipulation
- **main.js**: Application initialization and configuration

All client-side code, comments, and variables are in English. The UI labels and messages are also in English by default.

## Notes
- **A running eufy-security-ws server is required!** This client connects to it for all device operations.
- Only one device can be streamed at a time per proxy instance
- For production deployments, adjust environment variables for optimal performance and quality
- ffmpeg is automatically installed in the Docker image
- The client automatically falls back to default URLs if the health check endpoint is unavailable

## Troubleshooting

### Video not playing
- Ensure eufy-security-ws server is running and accessible
- Check that the EUFY_WS_URL environment variable is correctly set
- Verify ffmpeg is installed (for local installations)
- Check browser console for errors

### Connection issues
- Verify the WebSocket URL in the configuration
- Check firewall settings for ports 3000 (eufy-security-ws) and 3001 (web client)
- Ensure the eufy-security-ws server is properly authenticated with Eufy Cloud

### Performance issues
- Adjust TRANSCODING_PRESET to a faster preset (e.g., `superfast` or `ultrafast`)
- Increase FFMPEG_THREADS based on your CPU cores
- Lower VIDEO_SCALE resolution if needed

## License
BSD-3-Clause - See [LICENSE](LICENSE) file for details.

## Links
- [eufy-security-ws](https://github.com/bropat/eufy-security-ws) - The WebSocket server this client connects to

---

**Note on AI-Assisted Development**: AI tools (such as GitHub Copilot) were used as coding assistants during development. All code and documentation have been manually reviewed, tested, and refined by the author.
