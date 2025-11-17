# Cómo Ejecutar Tasky RD en Replit

## Problema: Aplicación no inicia

Si ves el mensaje "No workflows configured" o la aplicación no está corriendo, sigue estos pasos:

## Solución: Crear Workflow para Ejecutar la Aplicación

### Opción 1: Usar el Botón Run (Recomendado)

1. **Abre el panel de Workflows**:
   - Presiona `Command + K` (Mac) o `Ctrl + K` (Windows/Linux)
   - Busca "Workflows" y selecciónalo

2. **Crea un Nuevo Workflow**:
   - Haz clic en "New Workflow"
   - Nombre: `Iniciar Aplicación` (o el nombre que prefieras)

3. **Configura el Comando**:
   - Selecciona "Execute Shell Command"
   - En el campo de comando, escribe: `npm run dev`

4. **Asigna al Botón Run**:
   - Haz clic en el dropdown al lado del botón "Run"
   - Selecciona tu workflow "Iniciar Aplicación"

5. **Ejecuta la Aplicación**:
   - Haz clic en el botón "Run"
   - La aplicación debería iniciar y estar disponible en el puerto 5000

### Opción 2: Desde la Terminal

Si prefieres usar la terminal directamente:

```bash
npm run dev
```

## Verificar que la Aplicación Está Corriendo

Deberías ver en los logs:
```
serving on port 5000
```

## Solución de Problemas

### Error: "relation \"sessions\" does not exist"

Este error ya está **resuelto en Docker**. Las migraciones se ejecutan automáticamente.

Para desarrollo en Replit, ejecuta una sola vez:

```bash
npm run db:push
```

Esto creará todas las tablas necesarias (sessions, users, tasks, comments, attachments, activityLog).

### La Aplicación no Responde

1. Verifica que el workflow esté corriendo
2. Revisa los logs del workflow para errores
3. Asegúrate de que las variables de entorno estén configuradas (KEYCLOAK_URL, etc.)

## Variables de Entorno Necesarias

Asegúrate de tener configuradas en Replit Secrets:

- `DATABASE_URL` - URL de la base de datos PostgreSQL
- `KEYCLOAK_URL` - URL del servidor Keycloak
- `KEYCLOAK_REALM` - Nombre del realm
- `KEYCLOAK_CLIENT_ID` - ID del cliente
- `KEYCLOAK_CLIENT_SECRET` - Secret del cliente
- `SESSION_SECRET` - Secret para las sesiones

## Docker (Producción)

Para ejecutar en producción con Docker, consulta el archivo `DOCKER_README.md`.

**Cambio importante**: Las migraciones de base de datos ahora se ejecutan automáticamente al iniciar el contenedor Docker. No necesitas ejecutarlas manualmente.
