# Tasky RD Design Guidelines

## Design Approach

**Selected Approach:** Design System-Inspired (Linear + Notion hybrid)
Drawing from Linear's clean typography and focused layouts combined with Notion's flexible card-based interface. This creates a professional, efficient environment optimized for desktop-first task management with minimal visual distraction.

**Core Principle:** Information clarity over decoration. Every UI element serves task completion.

---

## Typography System

**Font Family:** 
- Primary: Inter (via Google Fonts CDN)
- Monospace: JetBrains Mono (for timestamps, IDs)

**Type Scale:**
- Page headers: text-2xl font-semibold
- Section titles: text-lg font-medium
- Task card titles: text-base font-medium
- Body text: text-sm font-normal
- Metadata/labels: text-xs font-medium uppercase tracking-wide
- Timestamps: text-xs font-normal

**Line Height:** Maintain tight leading (leading-tight) for headers, comfortable (leading-normal) for body text.

---

## Layout System

**Spacing Primitives:** Use Tailwind units of **2, 4, 6, 8, 12, 16** consistently (e.g., p-4, gap-6, mb-8).

**Grid Structure:**
- Kanban board: 3-column grid with equal widths (grid-cols-3)
- Sidebar navigation: Fixed width (w-64) on desktop, collapsible on mobile
- Main content area: flex-1 with max-width constraints
- Task cards: Full width within columns, min-height for consistency

**Container Widths:**
- Full application: w-full h-screen (fixed viewport)
- Kanban columns: flex-1 with max-w-md per column
- Modals/dialogs: max-w-2xl centered
- Forms: max-w-xl

**Responsive Breakpoints:**
- Desktop (default): 3-column Kanban layout
- Tablet (md): Horizontal scrollable columns
- Mobile (sm): Single column stack with tab navigation

---

## Component Library

### Navigation
- **Top Bar:** Fixed height (h-16), contains logo, workspace selector, user profile, notifications
- **Sidebar:** Vertical navigation with workspace sections, recent tasks, filters
- **Breadcrumbs:** Show current board/workspace context

### Kanban Board
- **Column Headers:** Sticky positioning, display column name + task count
- **Column Container:** Vertical scroll, min-height to show drop zones
- **Task Cards:** Compact design with clear visual hierarchy:
  - Title (font-medium)
  - Priority badge (top-right corner)
  - Due date indicator (bottom-left, with icon)
  - Assignee avatar (bottom-right, circular)
  - Hover state: Subtle elevation increase
  - Active drag state: Reduced opacity, elevated shadow

### Forms & Inputs
- **Task Creation Modal:** Centered overlay with backdrop blur
- **Input Fields:** Consistent height (h-10), rounded corners (rounded-md), clear focus states
- **Textareas:** Min-height (min-h-32) for descriptions
- **Dropdowns:** Native-styled with consistent padding
- **File Upload:** Drag-drop zone with dashed border, file preview thumbnails

### Task Detail Panel
- **Side Drawer:** Slides from right (w-96 on desktop, full-width mobile)
- **Content Sections:** Clear separation with dividers
  - Task metadata at top
  - Description area
  - Comment thread (chronological)
  - File attachments grid (2-column on desktop)
- **Action Buttons:** Sticky footer with edit/delete/close

### Notifications
- **Toast Alerts:** Top-right corner, auto-dismiss, stacked vertically
- **Inline Validation:** Below form fields with icon indicators

### Buttons
- **Primary Actions:** Medium size (px-4 py-2), rounded (rounded-md)
- **Secondary Actions:** Ghost style (border with transparent background)
- **Icon Buttons:** Square (w-10 h-10), centered icons
- **Destructive Actions:** Require confirmation dialog

### Status Indicators
- **Priority Badges:** Pill-shaped (px-3 py-1 rounded-full), text-xs
- **Due Date Labels:** Inline with calendar icon, conditional styling for overdue
- **User Avatars:** Circular (w-8 h-8), initials fallback, border on hover

---

## Visual Rhythm & Spacing

**Vertical Rhythm:**
- Section spacing: mb-8 between major sections
- Component spacing: gap-4 within component groups
- Form field spacing: space-y-4 for stacked inputs
- Card internal padding: p-4 consistently

**Horizontal Rhythm:**
- Column gaps in Kanban: gap-6
- Grid gaps in file previews: gap-3
- Button groups: gap-2

---

## Interaction Patterns

**Drag & Drop:**
- Visual feedback: Reduced opacity (opacity-50) during drag
- Drop zones: Highlighted border when card hovers over
- Smooth transitions: transition-all duration-200

**Modal Behavior:**
- Backdrop: Semi-transparent overlay with blur effect
- Entry animation: Fade in + scale from 95% to 100%
- Close actions: Click outside, ESC key, explicit close button

**Loading States:**
- Skeleton screens for initial board load
- Spinner overlays for in-progress actions
- Optimistic UI updates for drag-drop (instant visual feedback)

**Empty States:**
- Centered content with illustration or icon
- Clear call-to-action ("Create your first task")
- Helpful onboarding hints for new users

---

## Accessibility Standards

- All interactive elements: Minimum touch target 44x44px
- Keyboard navigation: Full support with visible focus indicators (ring-2 ring-offset-2)
- Form labels: Always visible, associated with inputs
- ARIA labels: For icon-only buttons and drag handles
- Screen reader announcements: For dynamic content updates

---

## Icons

**Library:** Heroicons (via CDN)
**Usage:**
- Navigation items: 20x20px (w-5 h-5)
- Task metadata: 16x16px (w-4 h-4)
- Action buttons: 20x20px
- Priority indicators: Solid style
- UI chrome: Outline style

---

## Images

**Profile Avatars:** User-uploaded or generated initials with subtle gradient backgrounds
**Empty State Illustrations:** Simple, friendly SVG illustrations (use placeholder comments for custom graphics)
**File Attachment Previews:** Thumbnail generation for images, file type icons for documents

**No Hero Image:** This is an application interface, not a marketing page. Focus on functional UI.

---

## Performance Considerations

- Virtualized scrolling for task lists with 50+ items
- Lazy loading for file attachment previews
- Debounced search/filter inputs
- Minimal animations (only purposeful transitions)