# 🚀 Migración Automática de Base de Datos - Tasky RD

## Pasos Rápidos para Producción

### 1. ⚠️ BACKUP PRIMERO (OBLIGATORIO)
```bash
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
```

### 2. 🏃 Ejecutar Migración Automática

**Opción A - Script Shell:**
```bash
./migrate.sh
```

**Opción B - NPX Directo:**
```bash
npx tsx server/migrate.ts
```

**Solo Verificar (sin migrar):**
```bash
npx tsx server/migrate.ts verify
```

### 3. ✅ Verificar que Funcionó

Después de la migración, verás:
```
✅ Migración completada exitosamente!
   • Pasos completados: X
   • Pasos omitidos (ya hechos): Y
```

Luego inicia tu aplicación normalmente y verifica que todo funciona.

## ¿Qué hace la migración?

1. Crea la tabla `boards` (si no existe)
2. Crea un board por defecto para cada proyecto
3. Migra `project_columns.board_id` → `project_id`
4. Migra `tasks.status` → `tasks.column_id`
5. Actualiza todos los constraints e índices
6. Verifica que todo está correcto

## Características del Script

- ✅ **Inteligente**: Detecta qué ya está hecho y solo ejecuta lo necesario
- ✅ **Seguro**: Puedes ejecutarlo múltiples veces sin problemas
- ✅ **Informativo**: Muestra exactamente qué está haciendo en cada paso
- ✅ **Validador**: Verifica que todo funcionó correctamente al final

## ❌ Si Algo Sale Mal

Restaura el backup:
```bash
psql $DATABASE_URL < backup_XXXXXXXX.sql
```

## 📚 Más Información

Para detalles técnicos completos, consulta:
- `DEPLOYMENT.md` - Guía completa de despliegue
- `MIGRATION_PRODUCTION_MANUAL.md` - Pasos SQL manuales (si el script automático falla)
- `server/migrate.ts` - Código fuente del script de migración
