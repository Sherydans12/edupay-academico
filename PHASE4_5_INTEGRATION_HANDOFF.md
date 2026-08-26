# Handoff de integración RC — Fases 4 y 5

Estado: `RELEASE_CANDIDATE_BLOCKED_PENDING_OWNER_APPROVAL`.

Este worktree es una integración aislada creada desde `e2b2688640b70f7f89489d3af1ccfb91f551f4a6`:

- Rama: `codex/course-builder-release-integration`.
- Ruta: `C:\Users\nicol\Documents\EduPayAcademico-worktrees\course-builder-release-integration`.
- No se hizo merge, push, deploy ni migración productiva.
- El worktree original, las ramas fuente y EduPay Identity no fueron modificados.
- El Identity disposable usado por el piloto fue `C:\Users\nicol\Documents\EduPayIdentity-worktrees\pilot-release-origin-main`, en `main`, limpio y sincronizado con `origin/main` en `98da17b013c9fbf74f618a2f54e0eea8779c5136`.

## Commits integrados

1. `e2b2688640b70f7f89489d3af1ccfb91f551f4a6` — candidato original preservado como base.
2. `963872b` — cherry-pick verificable de `208c0396baa79347954edb200ec3c273c453d105`; añadió capacidad de volumen y respuesta estricta de `/storage/usage`. Se resolvieron conflictos conservando los contratos y fixtures del candidato.
3. `2184349` — recuperación de TrustedTenantContext, política de visibilidad, validación de archivos y Learning Domain E2E completo.
4. `7075683` — suite de teacher experience adaptada a `BlockBodyEditor`; no restaura `rich-text-editor.tsx`.

El commit `7081279aa2834ccb6d364ecc2beb18c1de7c5464` no forma parte de esta integración ni se considera solución.

## Cobertura integrada y verificada

- Trusted tenant context: membresía/tenant/rol, contexto congelado, mismatch de tenant y casos negativos.
- `learning-visibility.policy`: lifecycle, ventanas temporales, publicación programada, enrollment, cross-tenant y authoring teacher/support.
- Learning Domain E2E: aislamiento, visibility, drafts, publicación, historial/restauración, move/duplicate/unpublish, carreras de reorder e idempotencia.
- Course Builder: estado dirty, `beforeunload`, reorder optimista, rollback `409 STALE_REVISION`, idempotency key, sparse revisions, foco/teclado y feature flag legacy.
- Teacher experience: Markdown seguro, drafts/publicación, historial/restauración, adjuntos/cuota, calendario/revisiones y `BlockBodyEditor` con preview/XSS fail-closed.
- Body document: schema, fallback scalar, límites, IDs, URLs seguras, referencias de recursos/imágenes autorizadas y renderer sin HTML crudo.
- Archivos: extensión/MIME, firmas, aliases browser, nombres multipart UTF-8, límites y rechazo fail-closed.
- Storage: `/storage/usage` usa `storageUsageSchema.strict()`, expone accounting lógico/físico/staged y `reconciliationStatus`; no hay waiver de contrato.

Pasada dirigida:

- API: 7 suites, `87 passed`.
- Web: 3 suites, `19 passed`.
- Suites completas: API `23 passed | 5 skipped`, `189 passed | 37 skipped`; Web `19 passed`, `94 passed`. Los skips API corresponden a suites DB condicionadas cuando la ejecución local no tiene `DATABASE_URL`; el piloto disposable ejecutó el flujo real.

## Gates

| Gate | Resultado |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS |
| Prisma generate/validate local | PASS |
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `git diff --check` | PASS |
| `pnpm --filter @edupay/api test` | PASS, con skips DB condicionados documentados |
| `pnpm --filter @edupay/web test` | PASS |
| `pnpm release:check` sin URLs públicas | FAIL de precondición de build: faltaron URLs públicas |
| `pnpm release:check` con URLs sintéticas `.invalid` | PASS |
| `pnpm release:config:check -- --service academico --env-file deploy/env/academico-api.ci.env.example` | PASS, 35 settings |
| `pnpm pilot:e2e` con Identity disposable explícito | PASS, `CHECKPOINT PASS full real-service pilot cross-service smoke` |

`pnpm format:check` ejecuta directamente `prettier --check .`, por lo que el gate global exige cero diferencias. En esta ejecución quedan 104 archivos heredados del baseline; todas las rutas propias de esta integración están formateadas. No se modificaron masivamente esos archivos ni existe un waiver válido registrado. Por tanto el gate global sigue FAIL y el release permanece bloqueado.

## Exclusiones pendientes de decisión

- `apps/web/src/features/student-deliverables-screens.spec.tsx` no se incorpora: requiere decisión explícita del owner sobre el alcance Student Deliverables.
- Suites baseline no propietarias de Fases 4/5 no se incorporan sin decisión explícita de alcance.
- Los 104 archivos heredados con formato pendiente no se reformatean dentro de F4/F5; requieren aprobación o waiver formal separado.
- No se copian cambios de `.claude/**`, Identity, Fase 6, notificaciones/sincronización fuera del RFC ni scripts de laboratorio.

## Rollback

- Rollback de código: revertir en orden inverso `7075683`, `2184349` y `963872b`, sin reescribir historia, para volver al candidato `e2b2688`.
- El body document y receipts/ordering son migraciones aditivas ya presentes en el candidato; ante rollback operacional se vuelve al código anterior y se deja `ACADEMIC_BODY_DOCUMENT_READ_ENABLED=0` si corresponde.
- No ejecutar `DROP COLUMN`, borrar tablas ni aplicar migraciones productivas como parte de este handoff.

No emitir `GO` de release mientras `format:check` global siga fallando sin waiver, mientras permanezcan exclusiones sin decisión explícita o si el owner no aprueba el alcance final.
