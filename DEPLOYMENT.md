# Guía de Despliegue - Tasky RD

## Sincronización de Base de Datos de Producción

### Problema
Si ves el error `relation "boards" does not exist` en producción, significa que el schema de tu base de datos no está sincronizado con el código.

### Solución

#### Opción 1: Usar Drizzle Kit (Recomendado)

1. **Conecta a tu entorno de producción** (servidor, Docker container, etc.)

2. **Ejecuta el comando de sincronización:**
   ```bash
   npm run db:push --force
   ```

   Este comando:
   - Lee el schema definido en `shared/schema.ts`
   - Compara con tu base de datos de producción
   - Crea las tablas faltantes (como `boards`)
   - Actualiza las columnas según sea necesario

3. **Verifica la sincronización:**
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
