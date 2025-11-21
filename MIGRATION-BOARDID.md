# Migración de boardId - Documentación

## Resumen

Esta migración agregó el campo `boardId` a la tabla `tasks` para separar tareas por board. **Las tareas legacy fueron asignadas automáticamente al primer board de su proyecto**.

## Limitación Conocida

⚠️ **IMPORTANTE**: La migración asignó TODAS las tareas pre-existentes al primer board (ordenado por `created_at`) de su proyecto. 

Si tu proyecto tenía múltiples boards ANTES de esta migración, es posible que algunas tareas estén en el board incorrecto.

## Verificar la distribución de tareas

Ejecuta este query para ver cómo están distribuidas las tareas:

```sql
SELECT 
  p.name as proyecto,
  b.name as board,
  COUNT(t.id) as num_tareas,
  STRING_AGG(t.title, ', ') as titulos_tareas
FROM boards b
INNER JOIN projects p ON b.project_id = p.id
LEFT JOIN tasks t ON t.board_id = b.id
GROUP BY p.id, p.name, b.id, b.name
ORDER BY p.name, b.name;
```

## Reasignar una tarea a otro board

Si necesitas mover una tarea al board correcto:

### Opción 1: Desde la interfaz (Recomendado)
1. Abre la tarea en el board incorrecto
2. Usa la función de edición para cambiarla de board (si está implementada)

### Opción 2: SQL directo (Avanzado)

```sql
-- 1. Primero, identifica el ID del board correcto
SELECT id, name, project_id FROM boards WHERE name = 'NOMBRE_DEL_BOARD';

-- 2. Luego, actualiza la tarea
UPDATE tasks 
SET board_id = 'BOARD_ID_CORRECTO'
WHERE id = 'TASK_ID';
```

### Ejemplo completo:

```sql
-- Ver todas las tareas con sus boards actuales
SELECT 
  t.id,
  t.title,
  b.name as board_actual,
  p.name as proyecto
FROM tasks t
INNER JOIN boards b ON t.board_id = b.id
INNER JOIN projects p ON b.project_id = p.id;

-- Mover una tarea específica
UPDATE tasks 
SET board_id = (
  SELECT id FROM boards 
  WHERE name = 'Board de Producción' 
  AND project_id = (SELECT project_id FROM tasks WHERE id = 'TASK_ID')
)
WHERE id = 'TASK_ID';
```

## Estado actual de la migración

- ✅ Migración ejecutada exitosamente
- ✅ 3 tareas asignadas al primer board de su proyecto
- ✅ Nuevas tareas se crean correctamente con boardId
- ⚠️ Verifica manualmente que las tareas estén en los boards correctos

## Validación implementada

Las nuevas tareas creadas después de esta migración tienen validación robusta:

- ✅ `boardId` debe ser un UUID válido (frontend + backend)
- ✅ `boardId` no puede ser vacío
- ✅ Foreign key constraint asegura que el board exista
- ✅ Cascade delete: si se elimina un board, sus tareas también se eliminan

## Notas técnicas

- La migración solo afecta tareas con `board_id IS NULL`
- Una vez ejecutada, no se vuelve a ejecutar
- El script está en `server/migrate-boardid.ts`
- La migración se ejecuta automáticamente en `docker-entrypoint.sh`
- **Importante**: El script está excluido del build de TypeScript (`tsconfig.server.json`) ya que es solo para migración one-time

## Ejecutar la migración manualmente

Si necesitas ejecutar la migración manualmente en desarrollo:

```bash
npx tsx server/migrate-boardid.ts
```

**Nota**: Este script NO se compila en el build de producción. Solo se ejecuta a través de `docker-entrypoint.sh` durante el inicio del contenedor.
