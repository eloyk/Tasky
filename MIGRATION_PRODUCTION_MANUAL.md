# Migración Manual para Producción - Tasky RD

## ⚠️ IMPORTANTE: LEE ESTO PRIMERO

Esta guía asume que tu base de datos de producción tiene un schema antiguo donde:
- La tabla `boards` NO existe
- La tabla `tasks` tiene columna `status` (no `column_id`)
- La tabla `project_columns` tiene `board_id` (no `project_id`)

## 🔴 PASO 0: BACKUP OBLIGATORIO

**ANTES de hacer CUALQUIER COSA**, haz un backup completo:

```bash
# En tu servidor de producción
pg_dump $DATABASE_URL > backup_pre_migration_$(date +%Y%m%d_%H%M%S).sql
```

**Verifica que el backup se creó correctamente antes de continuar.**

## 📋 PASO 1: Conectarse a la Base de Datos

```bash
# Opción A: Si tienes psql instalado
psql $DATABASE_URL

# Opción B: Desde Node.js con Drizzle
# Sigue usando las instrucciones SQL de esta guía
```

## 🔧 PASO 2: Crear Tabla `boards`

La tabla `boards` no existe en tu producción. Créala primero:

```sql
-- Crear tabla boards
CREATE TABLE IF NOT EXISTS boards (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_by_id VARCHAR NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Crear índice para búsquedas eficientes
CREATE INDEX IF NOT EXISTS boards_project_id_idx ON boards(project_id);
```

## 🔧 PASO 3: Crear Board por Defecto para Cada Proyecto

Como no existen boards, necesitas crear uno por cada proyecto:

```sql
-- Crear un board "Principal" para cada proyecto existente
INSERT INTO boards (id, project_id, name, description, created_by_id, created_at)
SELECT 
  gen_random_uuid(),
  p.id,
  'Tablero Principal',
  'Tablero principal del proyecto',
  p.created_by_id,
  NOW()
FROM projects p
WHERE NOT EXISTS (
  SELECT 1 FROM boards b WHERE b.project_id = p.id
);
```

## 🔧 PASO 4: Migrar `project_columns.board_id` → `project_id`

Ahora que existen boards, actualiza las columnas:

```sql
-- 1. Renombrar la columna
ALTER TABLE project_columns 
RENAME COLUMN board_id TO project_id;

-- 2. Actualizar los valores (convertir board_id a project_id)
UPDATE project_columns pc
SET project_id = b.project_id
FROM boards b
WHERE pc.project_id = b.id;

-- 3. Eliminar constraint antiguo
ALTER TABLE project_columns 
DROP CONSTRAINT IF EXISTS project_columns_board_id_boards_id_fk;

-- 4. Agregar nuevo constraint
ALTER TABLE project_columns 
ADD CONSTRAINT project_columns_project_id_projects_id_fk 
FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- 5. Actualizar índice
DROP INDEX IF EXISTS unique_board_order;
CREATE UNIQUE INDEX unique_project_order ON project_columns(project_id, "order");
```

## 🔧 PASO 5: Migrar `tasks.status` → `tasks.column_id`

Este es el paso más crítico. La columna `status` necesita convertirse en `column_id`:

```sql
-- 1. Primero, agregar la nueva columna column_id (permitir NULL temporalmente)
ALTER TABLE tasks 
ADD COLUMN column_id VARCHAR;

-- 2. Mapear los valores de status a column_id
-- IMPORTANTE: Ajusta estos IDs según tus columnas reales
-- Para obtener los IDs de tus columnas, ejecuta:
-- SELECT id, name, project_id FROM project_columns ORDER BY project_id, "order";

-- Ejemplo de mapeo (DEBES AJUSTAR ESTOS IDs):
-- Si status='open' → columna 'Pendiente'
-- Si status='in_progress' → columna 'En Progreso'  
-- Si status='closed' → columna 'Completada'

-- Esta query asume que cada proyecto tiene sus columnas en orden:
-- orden 0 = 'Pendiente', orden 1 = 'En Progreso', orden 2 = 'Completada'

UPDATE tasks t
SET column_id = (
  SELECT pc.id 
  FROM project_columns pc 
  WHERE pc.project_id = t.project_id 
  AND CASE 
    WHEN t.status = 'open' THEN pc."order" = 0
    WHEN t.status = 'in_progress' THEN pc."order" = 1
    WHEN t.status = 'closed' THEN pc."order" = 2
    ELSE pc."order" = 0  -- default a 'Pendiente'
  END
  LIMIT 1
);

-- 3. Verificar que todas las tareas tienen column_id asignado
SELECT COUNT(*) as tareas_sin_columna FROM tasks WHERE column_id IS NULL;
-- Si este query devuelve 0, puedes continuar. Si no, investiga qué pasó.

-- 4. Hacer column_id NOT NULL y agregar foreign key
ALTER TABLE tasks 
ALTER COLUMN column_id SET NOT NULL;

ALTER TABLE tasks
ADD CONSTRAINT tasks_column_id_project_columns_id_fk
FOREIGN KEY (column_id) REFERENCES project_columns(id) ON DELETE RESTRICT;

-- 5. Eliminar la columna status antigua
ALTER TABLE tasks 
DROP COLUMN status;
```

## 🔧 PASO 6: Verificación Post-Migración

Ejecuta estas queries para verificar que todo está correcto:

```sql
-- Verificar que boards existen
SELECT COUNT(*) as total_boards FROM boards;

-- Verificar que project_columns está correcto
SELECT pc.id, pc.name, pc.project_id, p.name as project_name
FROM project_columns pc
INNER JOIN projects p ON pc.project_id = p.id
LIMIT 5;

-- Verificar que tasks tienen column_id correcto
SELECT t.id, t.title, pc.name as column_name, p.name as project_name
FROM tasks t
INNER JOIN project_columns pc ON t.column_id = pc.id
INNER JOIN projects p ON t.project_id = p.id
LIMIT 10;

-- Verificar el constraint único
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'project_columns';
```

## 🔧 PASO 7: Sincronizar Schema con Drizzle (Opcional)

Si todo lo anterior funcionó, puedes ejecutar esto para que Drizzle vea que está sincronizado:

```bash
npm run db:push
```

Deberías ver: "No changes detected"

## ❌ Si Algo Sale Mal

Si ocurre un error durante la migración:

```bash
# Restaurar el backup
psql $DATABASE_URL < backup_pre_migration_XXXXXXXX.sql

# O si prefieres dropear y recrear
dropdb nombre_de_tu_db
createdb nombre_de_tu_db
psql $DATABASE_URL < backup_pre_migration_XXXXXXXX.sql
```

## 📞 Necesitas Ayuda?

Si te quedas atascado en algún paso:

1. **NO continues** con los siguientes pasos
2. Verifica los logs de error completos
3. Ejecuta este query para ver el estado actual:

```sql
-- Ver qué columnas tiene tasks
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'tasks' 
ORDER BY ordinal_position;

-- Ver qué columnas tiene project_columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'project_columns' 
ORDER BY ordinal_position;

-- Ver si existe la tabla boards
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_name = 'boards'
);
```

Comparte estos resultados para recibir ayuda específica.
