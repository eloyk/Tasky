# Guía del Centro de Control del Administrador

## Acceso
El **Centro de Control** está disponible solo para usuarios con rol de **Administrador** u **Owner** de la organización. Se accede desde el sidebar haciendo clic en "Centro de Control".

---

## Pestañas Disponibles

### 📊 1. Organización
Muestra información general de tu organización:
- **Información básica**: Nombre y descripción de la organización
- **Estadísticas**: 
  - Número total de miembros
  - Número de equipos creados
  - Número de proyectos
  - Número de tableros
- **Lista de miembros**: Tabla con todos los usuarios, mostrando:
  - Avatar y nombre
  - Email
  - Rol (Owner, Admin, Member)

**Acciones disponibles**:
- Ver toda la información de la organización de un vistazo
- Revisar quiénes son los miembros y sus roles

---

### 👥 2. Equipos
Gestiona los equipos de trabajo de tu organización.

**¿Qué puedes hacer?**

#### Crear un nuevo equipo:
1. Haz clic en el botón **"Crear equipo"**
2. Completa el formulario:
   - **Nombre**: Nombre del equipo (ej: "Desarrollo Frontend")
   - **Descripción**: Breve descripción del equipo (opcional)
   - **Color**: Elige un color identificador (opcional)
3. Haz clic en **"Crear"**

#### Ver y gestionar miembros de un equipo:
1. En la tarjeta de cualquier equipo, haz clic en el botón **"Ver miembros"**
2. Se abrirá un diálogo mostrando todos los miembros actuales
3. Para **agregar un miembro**:
   - Haz clic en **"Agregar miembro"**
   - Selecciona un usuario de la lista
4. Para **eliminar un miembro**:
   - Haz clic en el ícono **X** junto al nombre del usuario

#### Editar un equipo:
1. Haz clic en el ícono de **lápiz (editar)** en la tarjeta del equipo
2. Modifica el nombre, descripción o color
3. Guarda los cambios

#### Eliminar un equipo:
1. Haz clic en el ícono de **basura (eliminar)** en la tarjeta del equipo
2. Confirma la eliminación
3. **⚠️ Nota**: Esto NO elimina a los usuarios, solo el equipo

---

### 📁 3. Proyectos
Muestra todos los proyectos de la organización.

**¿Qué ves aquí?**
- Lista completa de todos los proyectos
- Para cada proyecto:
  - Nombre y descripción
  - Creador del proyecto
  - Número de equipos asignados
  - Fecha de creación

**Roles y visibilidad**:
- **Owners y Admins**: Ven TODOS los proyectos de la organización
- **Miembros regulares**: Solo ven proyectos donde fueron asignados explícitamente

---

### 📋 4. Tableros
Muestra todos los tableros Kanban de la organización.

**¿Qué ves aquí?**
- Lista completa de todos los tableros
- Para cada tablero:
  - Nombre y descripción
  - Proyecto al que pertenece
  - Creador del tablero
  - Número de equipos asignados
  - Fecha de creación

**Roles y visibilidad**:
- **Owners y Admins**: Ven TODOS los tableros de la organización
- **Miembros regulares**: Solo ven tableros de proyectos donde fueron asignados

---

## Preguntas Frecuentes

### ¿Quién puede acceder al Centro de Control?
Solo usuarios con rol de **Owner** o **Admin** en la organización.

### ¿Cómo asigno equipos a proyectos/tableros?
Por ahora, esta funcionalidad está en desarrollo. Podrás asignar equipos a proyectos y tableros desde la UI próximamente.

### ¿Puedo invitar nuevos usuarios?
Sí, la funcionalidad de invitaciones está implementada en el backend. La interfaz de usuario para enviar invitaciones estará disponible próximamente.

### ¿Los cambios se reflejan en tiempo real?
Los cambios se reflejan al recargar o navegar entre pestañas. Usa el selector de proyectos en el sidebar para actualizar la vista.

---

## Tips de Uso

1. **Organiza tu equipo primero**: Crea equipos según las áreas de trabajo (ej: Frontend, Backend, Diseño)
2. **Asigna miembros a equipos**: Agrupa a las personas según sus responsabilidades
3. **Usa el selector de proyectos**: En el sidebar verás un selector que te permite cambiar rápidamente entre proyectos
4. **Revisa las estadísticas**: La pestaña de Organización te da una vista rápida del estado de tu workspace

---

## Próximas Funcionalidades

Las siguientes características están implementadas en el backend y pronto estarán en la interfaz:

- ✉️ **Invitar usuarios**: Enviar invitaciones por email con roles y equipos pre-asignados
- 🔗 **Asignar equipos a proyectos/tableros**: Interfaz para gestionar qué equipos tienen acceso a cada proyecto
- 👤 **Gestión avanzada de permisos**: Control granular de permisos por equipo
