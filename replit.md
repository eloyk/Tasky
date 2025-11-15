# Tasky RD - Task Management Application

## Overview

Tasky RD is a collaborative task management web application built with a modern full-stack architecture. The application provides an intuitive Kanban board interface for creating, organizing, and managing tasks through three workflow states: Pendiente (Pending), En Progreso (In Progress), and Completada (Completed). Users can collaborate on tasks with features including comments, file attachments, priority levels, due dates, and activity history tracking.

The application is designed with a desktop-first approach following a Linear + Notion hybrid design system, emphasizing information clarity and efficient task completion workflows.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System:**
- React 18 with TypeScript for type-safe component development
- Vite as the build tool and development server
- Wouter for lightweight client-side routing
- TanStack Query (React Query) for server state management with optimistic updates

**UI Component System:**
- Radix UI primitives for accessible, unstyled component foundations
- shadcn/ui component library with the "new-york" style variant
- Tailwind CSS for utility-first styling with custom design tokens
- CSS variables for theme customization supporting light/dark modes

**State Management Strategy:**
- Server state managed through TanStack Query with aggressive caching (staleTime: Infinity)
- Local UI state using React hooks
- Form state handled via react-hook-form with Zod validation
- Theme state persisted to localStorage

**Drag-and-Drop Implementation:**
- @dnd-kit/core for accessible drag-and-drop functionality
- Pointer sensor with 8px activation distance to prevent accidental drags
- Visual feedback through DragOverlay component
- Task status updates on drag completion

**Design System:**
- Typography: Inter font family for UI, JetBrains Mono for monospaced content
- Spacing primitives: Consistent Tailwind units (2, 4, 6, 8, 12, 16)
- Responsive breakpoints: Desktop (default 3-column), tablet (horizontal scroll), mobile (single column)
- Custom CSS properties for elevation effects (--elevate-1, --elevate-2)

### Backend Architecture

**Server Framework:**
- Express.js for HTTP server and API routing
- TypeScript with ESM modules for type safety
- Custom middleware for request logging and JSON response capture

**Authentication System:**
- Replit Auth integration via OpenID Connect (OIDC)
- Passport.js strategy for authentication flow
- Session management using express-session with PostgreSQL storage
- Session persistence with 7-day TTL
- Protected routes via isAuthenticated middleware

**API Design:**
- RESTful endpoints under `/api` namespace
- Authentication required for all task/user operations
- Zod schema validation on incoming requests
- Consistent error handling with appropriate HTTP status codes
- JSON response logging for debugging (truncated at 80 characters)

**File Upload Strategy:**
- Google Cloud Storage via @google-cloud/storage client
- Replit sidecar authentication for GCS access
- Custom ObjectAclPolicy system for permission management (owner, visibility, ACL rules)
- Support for public object search paths via environment variable
- ObjectStorageService abstraction layer for storage operations

### Data Storage

**Database:**
- PostgreSQL via Neon serverless driver (@neondatabase/serverless)
- Drizzle ORM for type-safe database queries and migrations
- WebSocket connection for serverless compatibility

**Schema Design:**
- `users` table: Stores user profile data (email, name, profile image) with timestamps
- `tasks` table: Core task data with status, priority, title, description, assignee, due dates, creator reference
- `comments` table: Task comments with user reference and timestamps
- `attachments` table: File metadata linked to tasks (name, URL, size, MIME type)
- `activity_log` table: Audit trail for task actions (created, status_change) with user attribution, timestamps, and old/new values
- `sessions` table: Express session storage with expiration indexing

**Type Safety:**
- Schema definitions in shared directory for frontend/backend reuse
- Drizzle-Zod integration for runtime validation schemas
- Inferred TypeScript types from schema definitions
- Enum types for task status (pendiente, en_progreso, completada) and priority (low, medium, high)

### External Dependencies

**Third-Party Services:**
- Replit Auth (OIDC): User authentication and identity management
- Google Cloud Storage: Object/file storage with ACL management
- Neon Database: Serverless PostgreSQL hosting
- Replit Sidecar: Service for GCS credential provisioning

**Key NPM Packages:**
- **UI/Interaction:** @radix-ui components, @dnd-kit for drag-and-drop, lucide-react for icons
- **Forms/Validation:** react-hook-form, @hookform/resolvers, zod
- **Data Fetching:** @tanstack/react-query, native fetch API
- **Database:** drizzle-orm, @neondatabase/serverless, connect-pg-simple
- **Authentication:** passport, openid-client, express-session
- **Build/Dev Tools:** vite, tsx, esbuild, tailwindcss, postcss

**Development Tooling:**
- @replit/vite-plugin-runtime-error-modal: Development error overlay
- @replit/vite-plugin-cartographer: Code navigation assistance
- @replit/vite-plugin-dev-banner: Development environment indicator

**API Integration Patterns:**
- Client-side fetch with credentials included for session cookies
- Centralized apiRequest utility for consistent error handling
- 401 error detection for authentication redirects
- Query invalidation on mutations for real-time UI updates

### Recent Changes (November 15, 2025)

**Activity History System:**
- Added `activity_log` table to track task lifecycle events with user attribution
- Implemented automatic activity logging on task creation and status changes
- Backend routes (`POST /api/tasks`, `PATCH /api/tasks/:id/status`) now create activity log entries
- New API endpoint `GET /api/tasks/:id/activity` returns chronologically ordered activity history
- TaskDetailPanel displays activity history section with formatted Spanish messages
- Activity entries show user avatar, timestamp, and action description
- Supported actions: task creation ("Creó la tarea") and status transitions ("Cambió el estado de X a Y")
- Cache invalidation ensures real-time activity updates after mutations