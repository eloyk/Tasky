# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev for build)
RUN npm ci

# Copy source code
COPY . .

# Build frontend (vite build)
RUN npx vite build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files and tsconfig (needed for path aliases)
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (tsx needs to be available for runtime)
# Using full install instead of --only=production to get tsx and types
RUN npm ci

# Copy built frontend from builder
COPY --from=builder /app/dist/public ./dist/public

# Copy server source (TypeScript files)
COPY server ./server

# Copy shared code
COPY shared ./shared

# Copy drizzle config
COPY drizzle.config.ts ./

# Expose port
EXPOSE 5000

# Set environment
ENV NODE_ENV=production

# Start the application with tsx
CMD ["npx", "tsx", "server/index.ts"]
