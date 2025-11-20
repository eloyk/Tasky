# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./
COPY tsconfig.server.json ./

# Install all dependencies
RUN npm ci

# Copy source code
COPY . .

# Build frontend (outputs to dist/public)
RUN npx vite build

# Build backend (outputs to dist/server, dist/shared, dist/drizzle.config.js)
RUN npm run build:server

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (tsx and drizzle-kit are in devDependencies but needed for migrations)
RUN npm ci

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist

# Copy drizzle config to project root (needed by Drizzle at runtime)
COPY --from=builder /app/dist/drizzle.config.js ./drizzle.config.js

# Copy shared schema (needed for migrations)
COPY --from=builder /app/shared ./shared

# Copy migration script
COPY --from=builder /app/server/migrate.ts ./server/migrate.ts

# Copy entrypoint script
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Expose port
EXPOSE 5000

# Set environment
ENV NODE_ENV=production

# Start the application with migrations
CMD ["./docker-entrypoint.sh"]