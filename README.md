# Tasky RD 📋

Aplicación web de gestión de tareas colaborativa con tablero Kanban, desarrollada con tecnologías modernas y diseño inspirado en Linear y Notion.

![Tasky RD](client/public/favicon.png)

## 🌟 Características

- **Tablero Kanban Intuitivo**: Organiza tareas en columnas (Pendiente, En Progreso, Completada)
- **Drag & Drop**: Mueve tareas entre columnas fácilmente
- **Gestión Completa de Tareas**: Crea, edita, elimina y asigna tareas
- **Sistema de Prioridades**: Clasifica tareas como Baja, Media o Alta
- **Fechas de Vencimiento**: Establece y visualiza fechas límite
- **Adjuntar Archivos**: Sube archivos a tus tareas usando Object Storage
- **Sistema de Comentarios**: Colabora con tu equipo mediante comentarios
- **Historial de Actividad**: Rastrea todos los cambios realizados en las tareas
- **Autenticación OAuth**: Login seguro mediante Keycloak
- **Modo Claro/Oscuro**: Interfaz adaptable a tus preferencias
- **Diseño Responsive**: Funciona perfectamente en desktop, tablet y móvil
- **Dockerizado**: Listo para despliegue en producción

## 🛠️ Tecnologías

### Frontend
- **React 18** - Framework UI
- **TypeScript** - Type safety
- **Vite** - Build tool ultra rápido
- **Wouter** - Routing ligero
- **TanStack Query** - Server state management
- **@dnd-kit** - Drag and drop accesible
- **Tailwind CSS** - Utility-first CSS
- **shadcn/ui** - Componentes UI de alta calidad
- **Radix UI** - Primitivos UI accesibles

### Backend
- **Node.js** - Runtime
- **Express.js** - Web framework
- **TypeScript** - Type safety
- **Drizzle ORM** - Type-safe database queries
- **PostgreSQL** - Base de datos relacional
- **Passport.js** - Autenticación
- **openid-client** - OAuth2/OIDC

### Servicios Externos
- **Keycloak** - Identity and Access Management
- **Google Cloud Storage** - Almacenamiento de archivos (via Replit Object Storage)
- **Neon/PostgreSQL** - Base de datos

## 📋 Requisitos Previos

- Node.js 20+
- PostgreSQL 15+ (o cuenta en Neon)
- Servidor Keycloak configurado
- Cuenta de Replit (para desarrollo) o Docker (para producción)

## 🚀 Instalación y Configuración

### Opción 1: Desarrollo en Replit

1. **Clonar el proyecto en Replit**

2. **Configurar variables de entorno** en Replit Secrets:
   ```
   DATABASE_URL=postgresql://...
   KEYCLOAK_URL=https://tu-keycloak.com
   KEYCLOAK_REALM=tu-realm
   KEYCLOAK_CLIENT_ID=tasky-client
   KEYCLOAK_CLIENT_SECRET=tu-secret
   SESSION_SECRET=genera-un-string-aleatorio-seguro
   ```

3. **Instalar dependencias** (automático en Replit):
   ```bash
   npm install
   ```

4. **Crear workflow** en Replit:
   - Presiona `Cmd/Ctrl + K`
   - Busca "Workflows"
   - Crea nuevo workflow: `Iniciar Aplicación`
   - Comando: `npm run dev`
   - Asigna al botón "Run"

5. **Ejecutar la aplicación**:
   - Presiona el botón "Run"
   - La app estará disponible en tu URL de Replit

📖 **Documentación detallada**: Ver `REPLIT_SETUP.md`

### Opción 2: Producción con Docker

1. **Clonar el repositorio**:
   ```bash
   git clone https://github.com/tu-usuario/tasky-rd.git
   cd tasky-rd
   ```

2. **Crear archivo `.env`**:
   ```bash
   cp .env.example .env
   ```

3. **Configurar variables en `.env`**:
   ```env
   DATABASE_URL=postgresql://postgres:postgres@postgres:5432/tasky
   KEYCLOAK_URL=https://tu-keycloak.com
   KEYCLOAK_REALM=tu-realm
   KEYCLOAK_CLIENT_ID=tasky-client
   KEYCLOAK_CLIENT_SECRET=tu-secret
   SESSION_SECRET=genera-un-string-aleatorio-seguro-de-al-menos-32-caracteres
   ```

4. **Construir y ejecutar con Docker**:
   ```bash
   docker-compose up -d
   ```

5. **Verificar logs**:
   ```bash
   docker-compose logs -f app
   ```

6. **Acceder a la aplicación**:
   - Abre tu navegador en `http://localhost:5000`

📖 **Solución de problemas**: Ver `DOCKER_TROUBLESHOOTING.md`

## 🔧 Configuración de Keycloak

Para que la autenticación funcione correctamente, configura lo siguiente en Keycloak Admin Console:

1. **Crear un Cliente**:
   - Client ID: `tasky-client` (o el que hayas configurado)
   - Client Protocol: `openid-connect`

2. **Configurar Settings**:
   - Client authentication: `ON`
   - Standard Flow: `ON`
   - Valid redirect URIs: `https://tu-dominio.com/*`
   - Específicamente: `https://tu-dominio.com/api/callback`
   - Web origins: `https://tu-dominio.com`

3. **Obtener Client Secret**:
   - En la pestaña "Credentials"
   - Copia el "Client Secret" a tu `.env`

## 📁 Estructura del Proyecto

```
tasky-rd/
├── client/                    # Frontend React
│   ├── src/
│   │   ├── components/       # Componentes reutilizables
│   │   │   ├── ui/          # Componentes shadcn/ui
│   │   │   ├── KanbanBoard.tsx
│   │   │   ├── KanbanColumn.tsx
│   │   │   ├── TaskCard.tsx
│   │   │   └── ...
│   │   ├── pages/           # Páginas de la app
│   │   ├── lib/             # Utilidades y configuración
│   │   └── main.tsx         # Entry point
│   ├── index.html
│   └── public/              # Assets estáticos
├── server/                   # Backend Node.js
│   ├── db.ts               # Configuración de base de datos
│   ├── index.ts            # Entry point del servidor
│   ├── routes.ts           # API endpoints
│   ├── keycloakAuth.ts     # Configuración OAuth
│   └── vite.ts             # Integración Vite
├── shared/                  # Código compartido
│   └── schema.ts           # Schemas de Drizzle y Zod
├── docker-compose.yml      # Configuración Docker
├── Dockerfile              # Imagen de producción
├── docker-entrypoint.sh    # Script de inicio con migraciones
└── package.json
```

## 🗄️ Esquema de Base de Datos

- **users** - Cuentas de usuario (email, nombres, imagen de perfil)
- **tasks** - Tareas (título, descripción, estado, prioridad, fechas, asignado)
- **comments** - Comentarios en tareas
- **attachments** - Archivos adjuntos
- **activityLog** - Registro de actividad/cambios
- **sessions** - Sesiones de usuario

## 🔐 Variables de Entorno

| Variable | Descripción | Requerida |
|----------|-------------|-----------|
| `DATABASE_URL` | Conexión a PostgreSQL | ✅ |
| `KEYCLOAK_URL` | URL del servidor Keycloak | ✅ |
| `KEYCLOAK_REALM` | Nombre del realm | ✅ |
| `KEYCLOAK_CLIENT_ID` | ID del cliente OAuth | ✅ |
| `KEYCLOAK_CLIENT_SECRET` | Secret del cliente | ✅ |
| `SESSION_SECRET` | Secret para sesiones (32+ caracteres) | ✅ |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Rutas de Object Storage | ⚪ |
| `PRIVATE_OBJECT_DIR` | Directorio privado de Object Storage | ⚪ |

## 🧪 Comandos Disponibles

### Desarrollo
```bash
# Instalar dependencias
npm install

# Ejecutar en modo desarrollo
npm run dev

# Linter
npm run lint

# Sync de base de datos (sin migraciones)
npm run db:push
```

### Producción
```bash
# Construir para producción
npm run build

# Ejecutar build de producción
npm run start

# Docker
docker-compose up -d          # Iniciar
docker-compose down           # Detener
docker-compose logs -f app    # Ver logs
docker-compose restart app    # Reiniciar
```

## 🐛 Solución de Problemas Comunes

### Base de Datos No Conecta en Docker
- **Síntoma**: `connect ETIMEDOUT`
- **Solución**: Reconstruir contenedores con `docker-compose build --no-cache`
- Ver: `DOCKER_TROUBLESHOOTING.md` sección 1

### Error de Keycloak OAuth
- **Síntoma**: `ResponseBodyError: server responded with an error`
- **Solución**: Verificar callback URL en Keycloak Admin
- Ver: `DOCKER_TROUBLESHOOTING.md` sección 3

### Las Tareas No Aparecen / No Puedo Hacer Scroll
- **Solución**: Limpia la caché del navegador con `Ctrl+Shift+R`
- Verifica que el usuario esté autenticado correctamente

### Error "relation does not exist"
- **Solución**: Ejecuta `npm run db:push` o reconstruye Docker
- Ver: `DOCKER_TROUBLESHOOTING.md` sección 2

## 📚 Documentación Adicional

- **REPLIT_SETUP.md** - Guía completa para ejecutar en Replit
- **DOCKER_TROUBLESHOOTING.md** - Solución de problemas Docker
- **DOCKER_README.md** - Información sobre deployment con Docker

## 🎨 Diseño y UX

- Diseño desktop-first inspirado en Linear y Notion
- Paleta de colores pastel con énfasis en claridad
- Sistema de diseño consistente con tokens de Tailwind
- Animaciones sutiles y transiciones fluidas
- Feedback visual inmediato en todas las acciones
- Accesibilidad mediante componentes Radix UI

## 🔄 Arquitectura de Base de Datos

El proyecto utiliza **detección automática de drivers**:

- **Entorno Neon** (Replit): Usa `@neondatabase/serverless` con WebSocket
- **PostgreSQL Estándar** (Docker/Local): Usa driver `pg` nativo
- **Auto-detección**: Verifica si la URL contiene `neon.tech`
- **Migraciones**: Automáticas vía `drizzle-kit push` en Docker

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📝 Licencia

Este proyecto está bajo la licencia MIT.

## 👥 Autores

- **Tu Nombre** - *Desarrollo Inicial*

## 🙏 Agradecimientos

- shadcn/ui por los componentes UI
- Radix UI por los primitivos accesibles
- Replit por la plataforma de desarrollo
- Keycloak por la gestión de identidad

---

**Nota**: Para deployment en producción, asegúrate de:
- Usar HTTPS en todas las URLs
- Configurar correctamente CORS
- Actualizar los callback URLs en Keycloak
- Establecer `SESSION_SECRET` fuerte y único
- Configurar backups de la base de datos
