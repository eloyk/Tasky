# Guía de Despliegue - Tasky RD

## 🚨 MIGRACIÓN CRÍTICA: project_columns.board_id → project_id

### Cambio de Arquitectura (Noviembre 2025)
El schema se corrigió para que las **columnas pertenezcan a proyectos**, no a boards individuales. Esto permite que múltiples boards compartan las mismas columnas del proyecto.

### ⚠️ IMPORTANTE: Backup Obligatorio
**ANTES de ejecutar cualquier comando**, haz un backup completo de tu base de datos de producción:
```bash
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
```

## 🐳 Despliegue con Docker (Migraciones Automáticas)

Si usas Docker, **no necesitas hacer nada manualmente**. El contenedor ejecuta automáticamente:

1. Script de migración inteligente (`server/migrate.ts`)
2. Sincronización de schema (`drizzle-kit push`)
3. Inicio de la aplicación

```bash
# Simplemente inicia tu contenedor
docker-compose up -d

# O reconstruye si actualizaste el código
docker-compose up -d --build

# Ver logs de migración
docker-compose logs -f app
```

Las migraciones se ejecutan en el `docker-entrypoint.sh` cada vez que inicias el contenedor. El script es idempotente, así que puedes reiniciar el contenedor sin problemas.

📖 **Más información**: Ver `DOCKER_README.md` para detalles completos sobre Docker.

---

## ✨ Migración Automática (Sin Docker)

Hemos creado un script de migración completamente automático que detecta el estado de tu base de datos y ejecuta todos los pasos necesarios.

### Opción 1: Usar el script shell (Linux/Mac/Docker)

```bash
# Asegúrate de que DATABASE_URL está configurado
export DATABASE_URL="postgresql://..."

# Ejecutar migración
./migrate.sh
```

### Opción 2: Usar npx directamente (Cualquier plataforma)

```bash
# Asegúrate de que DATABASE_URL está configurado
export DATABASE_URL="postgresql://..."

# Ejecutar migración
npx tsx server/migrate.ts

# O solo verificar el estado sin migrar
npx tsx server/migrate.ts verify
```

### ¿Qué hace la migración automática?

El script automáticamente:

1. ✅ **Verifica el estado actual** de tu base de datos
2. ✅ **Crea la tabla `boards`** si no existe
3. ✅ **Crea boards por defecto** para cada proyecto
4. ✅ **Migra `project_columns`**: renombra `board_id` → `project_id`
5. ✅ **Migra `tasks`**: convierte `status` → `column_id`
6. ✅ **Actualiza constraints e índices** correctamente
7. ✅ **Verifica** que todo funcionó correctamente
8. ✅ **Es idempotente**: puedes ejecutarlo múltiples veces sin problemas

### Salida esperada

```
🚀 Iniciando migración automática de base de datos...

📋 Crear tabla boards
  → Creando tabla boards...
  ✓ Tabla boards creada

📋 Crear boards por defecto para proyectos
  → Creando boards por defecto...
  ✓ 5 boards creados

📋 Migrar project_columns.board_id → project_id
  → Migrando project_columns...
    • Renombrando board_id → project_id
    • Actualizando valores de project_id
    • Eliminando constraint antiguo
    • Agregando nuevo constraint
    • Eliminando índice antiguo
    • Creando índice único
  ✓ project_columns migrado correctamente

📋 Migrar tasks.status → tasks.column_id
  → Migrando tasks...
    • Agregando columna column_id
    • Mapeando valores de status a column_id
    • Configurando column_id como NOT NULL
    • Agregando foreign key constraint
    • Eliminando columna status
  ✓ tasks migrado correctamente

═══════════════════════════════════════════════════
✅ Migración completada exitosamente!
   • Pasos completados: 4
   • Pasos omitidos (ya hechos): 0
═══════════════════════════════════════════════════
```

## 🔧 Migración Manual (Solo si la automática falla)

### Paso 1: Migración Manual de Columnas

Si tu base de datos ya tiene datos en `project_columns`, **DEBES** ejecutar esta migración manual antes de usar `db:push`:

```sql
-- 1. Renombrar la columna
ALTER TABLE project_columns 
RENAME COLUMN board_id TO project_id;

-- 2. Actualizar los valores para que apunten al project_id correcto
-- (Esto convierte los board_id antiguos a project_id correctos)
UPDATE project_columns pc
SET project_id = b.project_id
FROM boards b
WHERE pc.project_id = b.id;

-- 3. Eliminar el foreign key constraint antiguo
ALTER TABLE project_columns 
DROP CONSTRAINT IF EXISTS project_columns_board_id_boards_id_fk;

-- 4. Agregar el nuevo foreign key constraint
ALTER TABLE project_columns 
ADD CONSTRAINT project_columns_project_id_projects_id_fk 
FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- 5. Actualizar índices
DROP INDEX IF EXISTS unique_board_order;
CREATE UNIQUE INDEX IF NOT EXISTS unique_project_order ON project_columns(project_id, "order");
```

### Paso 2: Sincronizar Schema con Drizzle

Una vez completada la migración manual (o si es una instalación nueva), ejecuta:

```bash
npm run db:push --force
```

Este comando:
- Lee el schema definido en `shared/schema.ts`
- Compara con tu base de datos de producción
- Crea las tablas faltantes
- Actualiza las columnas según sea necesario

### Paso 3: Verificar la sincronización

```bash
npm run db:push
```

Si no hay cambios pendientes, verás: "No changes detected"

#### Opción 2: SQL Manual (Solo si Opción 1 falla)

Si por alguna razón no puedes usar Drizzle Kit, puedes ejecutar SQL directamente:

```sql
-- Crear tabla boards
CREATE TABLE IF NOT EXISTS boards (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  description TEXT,
  project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by_id VARCHAR NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Crear índices
CREATE INDEX IF NOT EXISTS boards_project_id_idx ON boards(project_id);
```

### ⚠️ Precauciones

1. **SIEMPRE haz un backup** de tu base de datos de producción antes de ejecutar `db:push --force`
2. **Prueba primero en staging** si es posible
3. **Verifica que tengas las variables de entorno correctas** apuntando a producción:
   - `DATABASE_URL` debe apuntar a tu base de datos de producción

### Verificación Post-Despliegue

Después de sincronizar, verifica que todo funcione correctamente:

```bash
# Conecta a PostgreSQL
psql $DATABASE_URL

# Verifica que la tabla existe
\dt boards

# Verifica el schema
\d boards

# Sal de psql
\q
```

## Variables de Entorno Requeridas

Asegúrate de que tu entorno de producción tiene todas estas variables configuradas:

```bash
# Base de Datos
DATABASE_URL=postgresql://...

# Autenticación Keycloak
KEYCLOAK_URL=https://...
KEYCLOAK_REALM=...
KEYCLOAK_CLIENT_ID=...
KEYCLOAK_CLIENT_SECRET=...

# Sesión
SESSION_SECRET=...

# Almacenamiento (Opcional)
PUBLIC_OBJECT_SEARCH_PATHS=...
PRIVATE_OBJECT_DIR=...
```

## Troubleshooting

### Error: "permission denied for schema public"
Solución: Tu usuario de base de datos necesita permisos para crear tablas.
```sql
GRANT ALL ON SCHEMA public TO your_db_user;
```

### Error: "database does not exist"
Solución: Crea la base de datos primero:
```bash
createdb your_database_name
```

### Los datos del dashboard no aparecen
Solución: Verifica que:
1. El usuario esté en una organización
2. La organización tenga proyectos
3. Los proyectos tengan tareas creadas

Puedes verificar con:
```sql
-- Verificar organizaciones del usuario
SELECT om.organization_id, o.name 
FROM organization_members om
INNER JOIN organizations o ON om.organization_id = o.id
WHERE om.user_id = 'YOUR_USER_ID';

-- Verificar proyectos
SELECT p.id, p.name
FROM projects p
WHERE p.organization_id = 'YOUR_ORG_ID';

-- Verificar tareas
SELECT COUNT(*) as total_tasks
FROM tasks t
WHERE t.project_id = 'YOUR_PROJECT_ID';
```

## Scripts Útiles

### Verificar estado del schema
```bash
npm run db:push  # Sin --force para solo ver cambios pendientes
```

### Generar migraciones (desarrollo)
```bash
npm run db:generate  # Genera archivos SQL de migración
```

### Aplicar migraciones
```bash
npm run db:migrate   # Aplica migraciones generadas
```
