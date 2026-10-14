# Dockerfile for eufy-security-webclient (H.265 Transcoding Proxy)
FROM node:25-alpine

# Install ffmpeg and other dependencies
RUN apk add --no-cache \
    ffmpeg \
    && rm -rf /var/cache/apk/*

# Intel VAAPI drivers for hardware acceleration (x86_64 only; i965 for older, iHD for newer GPUs)
RUN if [ "$(apk --print-arch)" = "x86_64" ]; then \
        apk add --no-cache libva-intel-driver intel-media-driver; \
    fi

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev && npm cache clean --force

# Copy application code
COPY *.js ./
COPY server ./server
COPY public ./public

# Create data directory for persistent config
RUN mkdir -p /app/data

# Expose application port
EXPOSE 3001

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start the server
CMD ["node", "main.js"]
