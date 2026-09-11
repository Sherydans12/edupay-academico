# Manifest de Fase 5 — Block body

Estado: **implementación intencional en `codex/course-builder-phase5`; no
merge, push, deploy ni migración productiva ejecutados**.

## Alcance implementado

- Contrato `bodyDocument` versión 1 con bloques `TEXT`, `CALLOUT`, `RESOURCE`,
  `LINK` e `IMAGE`, límites de tamaño, IDs únicos y URLs restringidas.
- Persistencia additive JSONB en `LearningItem` y `LearningItemDraft`.
- Backfill determinista desde los campos scalar existentes, conservando los
  originales para compatibilidad legacy.
- Dual-read con fallback scalar y seam de rollback
  `ACADEMIC_BODY_DOCUMENT_READ_ENABLED`.
- Renderer React seguro, editor teacher con preview, bloques, teclado, foco,
  estados vacíos/error y referencias a adjuntos autorizados.
- Copy/duplicate, drafts, publicación, historial/restauración y auditoría con
  snapshots de `bodyDocument`.
- Renderer compatible para alumnos; no se agregan edición, publicación,
  reorder, administración ni acciones teacher-only.
- Corrección responsive compartida para evitar overflow móvil del tooltip.

## Archivos propios de esta entrega

### Contratos y persistencia

- `packages/contracts/src/learning.ts`
- `packages/contracts/src/learning-read.ts`
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260825113000_add_learning_body_document/migration.sql`
- `apps/api/.env.example`

### API, lectura y pruebas

- `apps/api/src/learning/body-document.ts`
- `apps/api/src/learning/body-document.spec.ts`
- `apps/api/src/learning/learning.mapper.ts`
- `apps/api/src/learning/learning.service.ts`
- `apps/api/src/learning/read/learning-read.mapper.ts`
- `apps/api/src/learning/read/learning-read.mapper.spec.ts`
- `apps/api/src/learning/read/learning-read.service.ts`
- `apps/api/src/learning/read/learning-read.types.ts`

### Web, UX y pruebas

- `apps/web/src/components/body-document.tsx`
- `apps/web/src/components/body-document.spec.tsx`
- `apps/web/src/components/content-history-drawer.tsx`
- `apps/web/src/components/icons.tsx`
- `apps/web/src/components/teacher-content-editor.tsx`
- `apps/web/src/features/course-builder/course-builder.tsx`
- `apps/web/src/features/course-builder/item-editor.tsx`
- `apps/web/src/features/course-builder/types.ts`
- `apps/web/src/features/student-screens.tsx`
- `apps/web/src/app/globals.css`
- `packages/ui/src/styles.css`

### Trazabilidad y release

- `.prettierignore`
- `PHASE5_SCOPE_CONFLICT.md`
- `PHASE5_MANIFEST.md`
- `PHASE5_RELEASE_CANDIDATE.md`

## Exclusiones verificadas

- No se modificó el repositorio EduPay Identity.
- No se implementó la Fase 6 completa de alumnos.
- No se implementaron notificaciones ni sincronización del roadmap global.
- No se ejecutó `prisma migrate deploy` contra producción.
- No se eliminaron `body`, `content` ni `instructions` legacy.
- Se conservaron `Fuera de alcance de esta vista`, `PHASE4_MANIFEST.md` y los
  cambios previos presentes al crear la rama.

## Nota sobre el worktree base

La rama se creó con cambios previos ya presentes y no se hizo reset, checkout
destructivo ni limpieza global. Por eso este manifiesto lista la superficie
intencional de Fase 5, mientras el informe RC separa esos cambios previos del
conjunto propio y exige revisión antes de cualquier commit o merge.
