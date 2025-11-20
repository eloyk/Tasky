#!/bin/bash
# Script de migración automática para Tasky RD
# Ejecuta: ./migrate.sh o bash migrate.sh

echo "🚀 Ejecutando migración automática de base de datos..."
echo ""

# Verificar que DATABASE_URL está configurado
if [ -z "$DATABASE_URL" ]; then
  echo "❌ Error: DATABASE_URL no está configurado"
  echo "Por favor, configura la variable de entorno DATABASE_URL"
  exit 1
fi

# Ejecutar migración
npx tsx server/migrate.ts

# Capturar código de salida
exit_code=$?

if [ $exit_code -eq 0 ]; then
  echo ""
  echo "✅ Migración completada exitosamente"
else
  echo ""
  echo "❌ Error durante la migración (código: $exit_code)"
  exit $exit_code
fi
