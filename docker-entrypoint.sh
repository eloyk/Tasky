#!/bin/sh
set -e

echo "🔄 Ejecutando script de migración automática..."
npx tsx server/migrate.ts

echo "📦 Sincronizando schema con Drizzle..."
npx drizzle-kit push --force

echo "🚀 Iniciando aplicación..."
exec node dist/server/index.js
