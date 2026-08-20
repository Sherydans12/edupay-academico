# Teacher Experience & Authoring Workspace Design Notes

This document complements `apps/web/DESIGN.md` and `docs/design/STUDENT-EXPERIENCE.md` with specifications, principles, and workflows specific to the **Teacher** persona of EduPay Académico.

---

## 1. Principles & Design Philosophy

1. **Natural Educational Vocabulary (Chilean Spanish)**
   - All screens use natural, clear educational terms: *Asignatura, Curso, Unidad, Contenido, Material, Actividad, Evaluación en documento, Anuncio, Entrega, Revisión, Borrador, Publicado, Programado*.
   - Internal technical terms (*CourseSubject, effective CourseSubject, LearningItem, SubmissionRevision, Learning API*) are never exposed in user-facing surfaces.

2. **White/Paper Surfaces Dominate, Brand as Purposeful Accent**
   - Workspaces use clean, ambient light surfaces with subtle borders (`--border-default`) and crisp typography.
   - Deep navy (`#1d2f70`) and gold accent (`#e6b83f`) serve as purposeful accents for active states, badges, and primary action affordances.

3. **"¿Qué necesito hacer hoy?" — Calm, Honest Teacher Dashboard**
   - The dashboard avoids artificial business KPIs.
   - It directly answers teacher operational needs:
     - Real counts of pending student submissions needing review.
     - Active drafts in progress.
     - Scheduled upcoming publications.
     - Direct links into course workspaces and chronological upcoming deadlines.

4. **Zero XSS Risk — Pure React AST Markdown Rendering**
   - Rich text authoring in materials, activities, assessments, and announcements uses a zero-dependency, pure React AST parser (`MarkdownRenderer`).
   - It never touches `dangerouslySetInnerHTML`, ensuring complete immunity to script injection.
   - Links are strictly sanitized against unsafe pseudo-protocols (such as `javascript:` or `data:`).

---

## 2. Information Architecture & Key Routes

```
/docente (Inicio / Dashboard)
├── /docente/asignaturas (Catálogo de Asignaturas Asignadas)
│   └── /docente/asignaturas/[courseSubjectId] (Espacio de Autoría del Curso)
│       └── items/[learningItemId] (Editor Avanzado Directo)
├── /docente/revisiones (Bandeja de Revisiones)
│   └── /docente/revisiones/[submissionId] (Detalle y Acciones de Revisión)
└── /docente/calendario (Agenda Cronológica Docente)
```

---

## 3. Core Authoring & Workspace Workflows

### A. Subject / Course Workspace (`/docente/asignaturas/[courseSubjectId]`)
- **Header**:
  - Asignatura mark and course badge.
  - Quick counters for *Borradores*, *Programados*, and *Publicados*.
  - Actions: *Nueva unidad*, *Vista alumno* (direct preview from the student perspective).
- **Units Outline**:
  - Numbered unit header with availability date range badges (*startAt* / *endAt*).
  - Accessible unit reordering (Up / Down buttons), unit duplication, version history inspection, and archiving.
- **Learning Items**:
  - Categorized by type badge and icon (*Material*, *Actividad*, *Evaluación en documento*, *Anuncio*).
  - Publication state pills (*Borrador*, *Programado*, *Publicado*).
  - Actions: *Subir/Bajar* order within unit, *Editar* inline or in advanced editor, *Archivos* attachment manager, *Publicar*, *Programar*, *Mover a otra unidad*, *Duplicar contenido*, *Historial de versiones*, *Archivar*.

### B. Working Drafts for Published Content
- When editing a **published** item, teachers work on a **working draft** (`LearningItemDraft`).
- Students continue seeing the published version without interruption.
- A prominent status banner clarifies: *"Estás editando un borrador de trabajo. Los estudiantes continúan viendo la versión publicada."*
- Actions:
  - *Guardar borrador de trabajo*: saves changes to the draft entity without altering the published record.
  - *Descartar borrador*: discards draft modifications and reverts to the live published state.
  - *Publicar cambios*: atomically publishes the draft content to the live item with optional sensitive change confirmation.

### C. Dirty State Tracking & Concurrency Conflict (409 `STALE_REVISION`)
- **Unsaved Changes Tracking**:
  - Live dirty state calculation comparing the active form with the last saved snapshot.
  - Visual indicators: *"Sin guardar"* (amber dot), *"Guardando..."*, *"Guardado HH:mm"*.
  - `beforeunload` browser protection preventing accidental tab closure.
- **Optimistic Concurrency**:
  - In the event of a 409 `STALE_REVISION` response from another concurrent session, the UI warns: *"Este contenido cambió en otra sesión"*.
  - Offers an *"Actualizar contenido"* action while protecting any uncommitted text in the editor.

### D. Attachments & Quota Awareness (`TeacherAttachmentManager`)
- Full support for Spanish accented filenames (á, é, í, ó, ú, ñ, spaces, parentheses).
- **Safe Detach**:
  - Detach button triggers a confirmation modal: *"¿Quitar archivo del contenido?"*.
  - Explains: *"El archivo se desvinculará de este contenido. Si no es referenciado por otros contenidos, el espacio se liberará automáticamente."*
- **Storage Quota**:
  - Dynamic display of tenant storage quota (`getStorageUsage` & `getStoragePolicy`).
  - Progress and percentage of remaining capacity; disables uploads gracefully when storage state is `FULL`.

### E. Immutable Version History & Restore (`ContentHistoryDrawer`)
- Revisions drawer inspecting both `LearningUnit` and `LearningItem` versions (`ContentRevision`).
- Displays revision numbers (v1, v2, ...), timestamps, actor, and operation labels (*Creación inicial, Contenido actualizado, Publicado, Programado, etc.*).
- Snapshot inspection displaying title, description, markdown content, instructions, and due dates.
- Safe Restore button:
  - Explains: *"Restaurar no elimina cambios posteriores. Se creará una nueva versión."*
  - Reverts unit or item state while maintaining an append-only audit trail.

### F. Reviews Workflow (`/docente/revisiones`)
- Organized by course and assignment.
- Clear status filtering tabs:
  - **Pendientes** (`SUBMITTED`)
  - **Cambios solicitados** (`CHANGES_REQUESTED`)
  - **Revisadas** (`REVIEWED`)
- Submission detail view:
  - Complete chronological timeline of student revisions and teacher decisions.
  - Direct, authorized download of student uploaded files.
  - Review actions: *Comentar*, *Marcar revisada*, *Solicitar cambios*.

### G. Calendar (`/docente/calendario`)
- Chronological daily agenda grouping (*Hoy*, *Mañana*, *Día de la semana*).
- Aggregates assignment due dates, scheduled publication times, and unit availability windows across all authorized subjects.

---

## 4. Accessibility & Responsive Design

- **WCAG 2.1 AA Compliance**:
  - Semantic HTML landmarks (`<nav>`, `<header>`, `<main>`, `<article>`, `<aside>`, `<section>`).
  - High-contrast text exceeding 4.5:1 on light backgrounds.
  - Explicit `aria-label` for icon-only action buttons.
  - Visible focus indicators (`--brand-focus`).
  - Keyboard-accessible formatting toolbar with standard shortcuts (Ctrl+B, Ctrl+I).
- **Responsive Layout**:
  - Seamlessly scales from 375px mobile screens to 1440px desktop displays.
  - Bottom sticky navigation bar on mobile devices with safe-area insets.
  - Stacked form fields and adaptive two-column layouts.
