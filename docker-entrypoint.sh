#!/bin/sh
set -e

echo "Running database migrations..."
#npx drizzle-kit push --force
npm run db:push --force

echo "Starting application..."
exec node dist/server/index.js
