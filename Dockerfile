# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev for build)
RUN npm ci

# Copy source code
COPY . .

# Build the application (frontend + backend)
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built frontend from builder
COPY --from=builder /app/dist/public ./dist/public

# Copy built backend from builder
COPY --from=builder /app/dist/index.js ./dist/index.js

# Copy server source (needed for static.ts and other runtime files)
COPY --from=builder /app/server ./server

# Copy shared code
COPY --from=builder /app/shared ./shared

# Copy drizzle config
COPY --from=builder /app/drizzle.config.ts ./

# Expose port
EXPOSE 5000

# Set environment
ENV NODE_ENV=production

# Start the application
CMD ["node", "dist/index.js"]
