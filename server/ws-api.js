// WebSocket API Server for JSON-based communication
const utils = require('./utils');
const eufyClientPath = utils.isDev ? '../../eufy-security-client' : 'eufy-security-client';

const { WebSocketServer } = require('ws');
const eufyVersion = require(`${eufyClientPath}/package.json`).version;
const serverVersion = require('../package.json').version;

let wss = null; // WebSocket Server instance
const wsClients = new Set(); // Connected WebSocket clients
const messageHandlers = new Map(); // Registered message handlers

/**
 * Initializes the WebSocket server for JSON-based API communication
 * @param {http.Server} httpServer - The HTTP server instance to attach to
 * @param {number} port - The port number for logging
  */
function initWebSocketServer(httpServer, port) {
    wss = new WebSocketServer({
        noServer: true,
        path: '/api'
    });

    // Handle WebSocket upgrade requests
    httpServer.on('upgrade', (request, socket, head) => {
        const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

        if (pathname === '/api') {
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request);
            });
        } else {
            socket.destroy();
        }
    });

    wss.on('connection', (ws, request) => {
        const clientIp = request.socket.remoteAddress;
        utils.log(`🔌 WebSocket API client connected from ${clientIp}`, 'info');

        wsClients.add(ws);

        // Send welcome message
        wsSendToClient(ws, {
            type: 'version',
            serverVersion: serverVersion,
            clientVersion: eufyVersion,
        });

        // Handle incoming messages
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                handleWebSocketMessage(ws, message);
            } catch (error) {
                utils.log(`❌ WebSocket API parsing error: ${error.message}`, 'error');
                wsSendToClient(ws, {
                    type: 'error',
                    error: 'Invalid JSON format',
                    message: error.message
                });
            }
        });

        // Handle client disconnect
        ws.on('close', () => {
            wsClients.delete(ws);
            utils.log(`🔌 WebSocket API client disconnected (${wsClients.size} remaining)`, 'info');
        });

        // Handle errors
        ws.on('error', (error) => {
            utils.log(`❌ WebSocket API error: ${error.message}`, 'error');
            wsClients.delete(ws);
        });
    });

    utils.log(`🔌 WebSocket API server initialized at ws://localhost:${port}/api`, 'info');
}

/**
 * Handles incoming WebSocket messages and dispatches events
 * @param {WebSocket} ws - The client WebSocket connection
 * @param {Object} message - The parsed JSON message
  */
function handleWebSocketMessage(ws, message) {
    utils.log(`📨 WebSocket API message: ${JSON.stringify(message)}`, 'debug');

    if (!message.command) {
        wsSendToClient(ws, {
            type: 'error',
            error: 'Missing message type',
            message: 'Message must have a "type" field'
        });
        return;
    }

    // Check if there's a registered handler for this message type
    if (messageHandlers.has(message.command)) {
        const handler = messageHandlers.get(message.command);
        try {
            const result = handler(message, ws);
            // If handler returns a promise, handle it
            if (result && typeof result.then === 'function') {
                result
                    .then((response) => {
                        if (response) {
                            wsSendToClient(ws, response);
                        }
                    })
                    .catch((error) => {
                        wsSendToClient(ws, {
                            type: 'error',
                            error: 'Handler error',
                            message: error.message,
                            originalType: message.command
                        });
                    });
            } else if (result) {
                // Synchronous result
                wsSendToClient(ws, result);
            }
        } catch (error) {
            utils.log(`❌ Error in message handler for ${message.command}: ${error.message}`, 'error');
            wsSendToClient(ws, {
                type: 'result',
                error: 'Handler error',
                message: error.message,
                messageId: message.command
            });
        }
    } else {
        wsSendToClient(ws, {
            type: 'result',
            error: 'Unknown command',
            messageId: message.command,
            timestamp: new Date().toISOString()
        });
    }
}

/**
 * Sends a JSON message to a specific WebSocket client
 * @param {WebSocket} ws - The client WebSocket connection
 * @param {Object} message - The message object to send
 */
function wsSendToClient(ws, message) {
    if (ws.readyState === ws.OPEN) {
        try {
            ws.send(JSON.stringify(message));
        } catch (error) {
            utils.log(`❌ Error sending to WebSocket client: ${error.message}`, 'error');
        }
    }
}

/**
 * Broadcasts a message to all connected WebSocket clients
 * @param {Object} message - The message object to broadcast
 */
function wsBroadcast(message) {
    const messageStr = JSON.stringify(message);
    wsClients.forEach(client => {
        if (client.readyState === client.OPEN) {
            try {
                client.send(messageStr);
            } catch (error) {
                utils.log(`❌ Error broadcasting to client: ${error.message}`, 'error');
            }
        }
    });
}

/**
 * Registers a handler for a specific message type
 * @param {string} messageType - The message type to handle
 * @param {Function} handler - Handler function (message, ws) => response or Promise<response>
 */
function registerMessageHandler(messageType, handler) {
    if (typeof handler !== 'function') {
        throw new Error('Handler must be a function');
    }
    messageHandlers.set(messageType, handler);
    utils.log(`📝 Registered message handler for: ${messageType}`, 'debug');
}

/**
 * Unregisters a handler for a specific message type
 * @param {string} messageType - The message type to unregister
 */
function unregisterMessageHandler(messageType) {
    const removed = messageHandlers.delete(messageType);
    if (removed) {
        utils.log(`🗑️ Unregistered message handler for: ${messageType}`, 'debug');
    }
    return removed;
}

/**
 * Gets all registered message types
 * @returns {Array<string>} Array of registered message types
 */
function getRegisteredMessageTypes() {
    return Array.from(messageHandlers.keys());
}

module.exports = {
    initWebSocketServer,
    wsBroadcast,
    registerMessageHandler,
    unregisterMessageHandler,
    getRegisteredMessageTypes
};
