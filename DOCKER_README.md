# Tasky RD - Docker Deployment

Este documento explica cómo ejecutar Tasky RD usando Docker.

## Requisitos

- Docker 20.10+
- Docker Compose 2.0+

## Configuración Rápida

### 1. Configurar Variables de Entorno

Copia el archivo de ejemplo y configura tus credenciales:

```bash
cp .env.example .env
```

Edita `.env` y configura:
- `KEYCLOAK_URL`: URL de tu servidor Keycloak
- `KEYCLOAK_REALM`: Nombre del realm
- `KEYCLOAK_CLIENT_ID`: ID del cliente
- `KEYCLOAK_CLIENT_SECRET`: Secret del cliente
- `SESSION_SECRET`: Un secret aleatorio para las sesiones

### 2. Iniciar con Docker Compose

```bash
# Construir y ejecutar
docker-compose up -d

# Ver logs
docker-compose logs -f app

# Detener
docker-compose down

# Detener y eliminar volúmenes (¡CUIDADO! Borra la base de datos)
docker-compose down -v
```

La aplicación estará disponible en `http://localhost:5000`

### 3. Migraciones de Base de Datos

✅ **Las migraciones se ejecutan automáticamente** al iniciar el contenedor.

El script `docker-entrypoint.sh` ejecuta automáticamente en orden:

1. **Script de migración de datos** (`server/migrate.ts`):
   - Detecta automáticamente el estado de tu base de datos
   - **Base de datos nueva**: Omite automáticamente los pasos de migración (las tablas aún no existen)
   - **Base de datos antigua con datos**: Ejecuta las migraciones necesarias:
     - Crea tabla `boards` si no existe
     - Crea boards por defecto para cada proyecto
     - Migra `project_columns.board_id` → `project_id`
     - Migra `tasks.status` → `tasks.column_id`
     - Actualiza constraints e índices
   - **Es idempotente**: Puedes reiniciar el contenedor sin problemas

2. **Sincronización de schema** (`drizzle-kit push --force`):
   - Crea todas las tablas con el schema correcto (base de datos nueva)
   - Sincroniza cambios adicionales en el esquema (base de datos existente)
   - Crea tablas auxiliares como `sessions`

3. **Inicia la aplicación**

**No necesitas ejecutar migraciones manualmente**. Cada vez que inicies el contenedor, se ejecutarán automáticamente y de forma segura.

Si necesitas ejecutar solo el script de migración:

```bash
docker-compose exec app npx tsx server/migrate.ts
```

## Solo Docker (sin Docker Compose)

### Construir la Imagen

```bash
docker build -t tasky-rd .
```

### Ejecutar el Contenedor

```bash
docker run -d \
  -p 5000:5000 \
  -e DATABASE_URL="postgresql://user:password@host:5432/tasky" \
  -e KEYCLOAK_URL="https://keycloak.example.com" \
  -e KEYCLOAK_REALM="tasky" \
  -e KEYCLOAK_CLIENT_ID="tasky-backend" \
  -e KEYCLOAK_CLIENT_SECRET="your-secret" \
  -e SESSION_SECRET="random-secret-here" \
  --name tasky-rd \
  tasky-rd
```

## Configuración Keycloak para Docker

Asegúrate de configurar en tu cliente de Keycloak:

### Valid Redirect URIs
- `http://localhost:5000/api/callback`
- `http://localhost:5000/*`
- (Agrega tu dominio de producción si corresponde)

### Valid Post Logout Redirect URIs
- `http://localhost:5000`
- `http://localhost:5000/*`

### Web Origins
- `http://localhost:5000`
- `+` (para permitir todos los orígenes válidos)

## Volúmenes

Docker Compose crea un volumen para persistir los datos de PostgreSQL:
- `postgres_data`: Almacena los datos de la base de datos

## Troubleshooting

### La aplicación no se conecta a la base de datos

Verifica que el servicio de PostgreSQL esté saludable:
```bash
docker-compose ps
```

### Errores de conexión con Keycloak

1. Verifica que `KEYCLOAK_URL` sea accesible desde el contenedor
2. Si Keycloak está en `localhost`, usa `host.docker.internal` en lugar de `localhost`

### Ver logs detallados

```bash
# Logs de la aplicación
docker-compose logs -f app

# Logs de PostgreSQL
docker-compose logs -f postgres
```

## Producción

Para producción, considera:

1. Usar una base de datos PostgreSQL externa (no la del contenedor)
2. Configurar `SESSION_SECRET` con un valor aleatorio y seguro
3. Usar HTTPS con un proxy reverso (nginx, Traefik, etc.)
4. Configurar variables de entorno vía secretos (Docker Secrets, Kubernetes Secrets, etc.)
5. Implementar backups regulares de la base de datos
6. Usar un gestor de secretos (AWS Secrets Manager, HashiCorp Vault, etc.)

### Ejemplo con Nginx

```nginx
server {
    listen 80;
    server_name tasky.tudominio.com;
    
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Arquitectura del Contenedor

### Build Multi-Etapa

1. **Etapa de Build**: 
   - Instala todas las dependencias (incluye devDependencies)
   - Compila el frontend con Vite → `dist/public`
   - Compila el backend con TypeScript Compiler (tsc) → `dist/server`
   
2. **Etapa de Producción**: 
   - Instala solo dependencias de producción (sin devDependencies)
   - Copia archivos JavaScript compilados desde la etapa de build
   - Ejecuta el servidor con `node dist/server/index.js`

### Estrategia de Compilación

**Frontend**: Vite bundlea y optimiza el código React → `dist/public`

**Backend**: TypeScript Compiler transpila sin bundlear → `dist/server`
- No usa bundling (mantiene estructura de módulos)
- Preserva importaciones dinámicas de Vite
- Path aliases resueltos por TypeScript
- Importaciones ESM funcionan correctamente

**Ventajas**:
- Imagen de producción optimizada (solo dependencias runtime)
- Sin overhead de transpilación en tiempo de ejecución
- Código JavaScript compilado y listo para ejecutar
- Build determinista y reproducible

**Tamaño de imagen**: ~200-300MB (solo producción, sin devDependencies)

## Comandos Útiles

```bash
# Reconstruir la imagen después de cambios en el código
docker-compose up -d --build

# Ejecutar comandos dentro del contenedor
docker-compose exec app npm run db:push

# Acceder a la shell del contenedor
docker-compose exec app sh

# Ver recursos utilizados
docker-compose stats

# Limpiar contenedores e imágenes antiguas
docker system prune -a
```
