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

### 3. Ejecutar Migraciones

Si necesitas ejecutar migraciones de base de datos:

```bash
docker-compose exec app npm run db:push
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
