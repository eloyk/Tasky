# Solución de Problemas - Docker

## ✅ Problemas Resueltos

### 1. Error: "connect ETIMEDOUT" / Conexión a Base de Datos Falla

**Síntoma**:
```
Error: connect ETIMEDOUT 10.2.188.232:443
wss://postgresql.tools.svc.cluster.local/v2
```

**Causa**: La aplicación estaba usando `@neondatabase/serverless` driver que requiere WebSocket, pero Docker usa PostgreSQL estándar.

**Solución Implementada** ✅:
- Actualizado `server/db.ts` para **detectar automáticamente** el tipo de base de datos:
  - Si la URL contiene `neon.tech` → Usa driver Neon serverless (WebSocket)
  - **Cualquier otra conexión** (Docker, Replit postgres, local) → Usa driver PostgreSQL estándar (`pg`)
- Corregida importación ESM/CommonJS del módulo `pg`
- **Importante**: `postgresql.tools.svc.cluster.local` (Replit) usa driver estándar, NO Neon

**Qué hacer ahora**:
```bash
# Reconstruir la imagen Docker con el nuevo código
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# Verificar logs
docker-compose logs -f app
```

Deberías ver: `[Database] Using standard PostgreSQL driver`

---

### 1b. Error: "Named export 'Pool' not found" (pg module)

**Síntoma**:
```
SyntaxError: Named export 'Pool' not found. The requested module 'pg' is a CommonJS module
```

**Causa**: El módulo `pg` es CommonJS y no soporta named exports en ESM.

**Solución Implementada** ✅:
- Cambiada importación de `pg` a usar default import + destructuring
- Compatible con ESM module system de Node.js

---

### 2. Error: "relation \"sessions\" does not exist"

**Causa**: Las migraciones no se ejecutaban automáticamente.

**Solución Implementada** ✅:
- Creado `docker-entrypoint.sh` que ejecuta `drizzle-kit push` antes de iniciar
- Actualizado Dockerfile para usar este entrypoint

**Verificación**:
Cuando reconstruyas el contenedor, verás en los logs:
```
Running database migrations...
```

---

## ⚠️ Problema Pendiente: Error de Keycloak OAuth

**Síntoma**:
```
ResponseBodyError: server responded with an error in the response body
at processAuthorizationCodeResponse
```

**Causas Posibles**:

### A. Callback URL Incorrecto en Keycloak

El callback URL debe estar configurado en Keycloak exactamente como:
```
https://tasky-dev.vimcashcorp.com/api/callback
```

**Cómo verificar/corregir en Keycloak**:

1. Inicia sesión en tu consola de Keycloak Admin
2. Ve a: `Realm Settings` → Tu realm (`tasky-dev` o similar)
3. Ve a: `Clients` → Tu cliente (probablemente llamado `tasky` o similar)
4. En la pestaña `Settings`, verifica:
   - **Valid redirect URIs**: Debe incluir `https://tasky-dev.vimcashcorp.com/*` o específicamente `https://tasky-dev.vimcashcorp.com/api/callback`
   - **Valid post logout redirect URIs**: `https://tasky-dev.vimcashcorp.com/*`
   - **Web origins**: `https://tasky-dev.vimcashcorp.com`

5. Guarda los cambios

### B. Client Secret Incorrecto

**Verificar**:
1. En Keycloak Admin → Clients → Tu cliente
2. Pestaña `Credentials`
3. Copia el `Client Secret`
4. Compara con la variable de entorno `KEYCLOAK_CLIENT_SECRET` en tu deployment

**Actualizar en Docker**:
```bash
# Edita .env o docker-compose.yml
KEYCLOAK_CLIENT_SECRET=<tu-secret-correcto>

# Reinicia
docker-compose restart app
```

### C. Access Type / Client Authentication

**Verificar en Keycloak**:
1. Clients → Tu cliente → Settings
2. **Client authentication**: Debe estar **ON** (enabled)
3. **Authorization**: Puede estar OFF
4. **Standard Flow**: Debe estar **ON** (enabled)
5. **Direct Access Grants**: Puede estar ON u OFF

### D. Verificar Variables de Entorno

Asegúrate de que todas las variables estén configuradas correctamente:

```bash
# Ver variables de entorno del contenedor
docker-compose exec app env | grep KEYCLOAK

# Deberías ver:
# KEYCLOAK_URL=https://tu-keycloak-server.com
# KEYCLOAK_REALM=tu-realm
# KEYCLOAK_CLIENT_ID=tu-client-id
# KEYCLOAK_CLIENT_SECRET=tu-client-secret
```

---

## Comandos Útiles para Debugging

### Ver logs completos
```bash
docker-compose logs -f app
```

### Verificar conexión a base de datos
```bash
docker-compose exec app node -e "console.log(process.env.DATABASE_URL)"
```

### Ejecutar shell dentro del contenedor
```bash
docker-compose exec app sh

# Dentro del contenedor:
env | grep -E "(DATABASE|KEYCLOAK)"
```

### Verificar que las tablas existan
```bash
docker-compose exec postgres psql -U postgres -d tasky -c "\dt"
```

Deberías ver:
- sessions
- users
- tasks
- comments
- attachments
- activityLog

### Reiniciar todo desde cero
```bash
# CUIDADO: Esto borra todos los datos
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```

---

## Checklist de Verificación

Después de reconstruir:

- [ ] `docker-compose logs -f app` muestra `[Database] Using standard PostgreSQL driver`
- [ ] Logs muestran `Running database migrations...`
- [ ] Logs muestran `serving on port 5000`
- [ ] No hay errores de `ETIMEDOUT` 
- [ ] No hay errores de `relation "sessions" does not exist`
- [ ] Callback URL en Keycloak coincide con `https://tasky-dev.vimcashcorp.com/api/callback`
- [ ] Client Secret es correcto
- [ ] Client authentication está ON en Keycloak
- [ ] Standard Flow está ON en Keycloak

---

## Próximos Pasos

1. **Reconstruir Docker**:
   ```bash
   docker-compose down
   docker-compose build --no-cache
   docker-compose up -d
   ```

2. **Verificar logs de base de datos**: Deberías ver el mensaje del driver correcto

3. **Verificar configuración de Keycloak**: Sigue la sección "Callback URL Incorrecto"

4. **Probar login**: Intenta iniciar sesión y verifica los logs

5. **Reportar resultados**: Comparte los nuevos logs si aún hay errores
