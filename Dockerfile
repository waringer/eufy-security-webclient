
# Dockerfile for eufy-security-webclient (H.265 Transcoding Proxy)
#
# IMPORTANT: You must set environment variables (e.g. EUFY_WS_URL) to point to your running eufy-security-ws server.
# See https://github.com/bropat/eufy-security-ws for details.
# All other environment variables are optional and can be tuned for performance/quality.

FROM node:20-alpine

# Install ffmpeg and other dependencies
RUN apk add --no-cache \
    ffmpeg \
    && rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev && npm cache clean --force

# Copy application code
COPY server.js ./
COPY public ./public

# Expose application port
EXPOSE 3001

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start the server
CMD ["node", "server.js"]
