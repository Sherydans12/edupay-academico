# Decisiones de release — Fases 4 y 5

Fecha de cierre documental: 2026-08-26  
Estado: `RELEASE_CANDIDATE_READY_FOR_OWNER_APPROVAL`

Este registro cierra el alcance de release sin cambiar código funcional. La
integración está en `codex/course-builder-release-integration`, creada desde
`e2b2688640b70f7f89489d3af1ccfb91f551f4a6`. El candidato original, las ramas
fuente, el worktree original y EduPay Identity permanecen sin cambios.

## 1. Prettier global: decisión ejecutada

La ruta elegida y ejecutada es **un commit separado de limpieza del
baseline**, fuera de los commits funcionales F4/F5. No se adopta una política
CI baseline-aware para este RC: cambiaría la semántica del gate global y
requeriría una aprobación específica de política CI.

El branch `codex/baseline-format-cleanup-final` se creó desde
`5b0ad1f5f8ab0552ed1c502f30840b4afcc13fd8` y produjo
`fdbf238e02e785fd06c61b9f0dfebabc50c2a2fa`, con los 104 archivos heredados.
Al integrarlo en el worktree final, un conflicto mecánico afectó
`apps/api/test/storage-submissions.e2e-spec.ts`, ya modificado funcionalmente
por F4/F5. Se preservó el lado integración y se completó su formato en
`628a3d33e74eca3bfd805b63aa67752d7171c397`.

Por tanto:

- `pnpm format:check` global es `PASS`, con cero diferencias.
- No existe waiver ni se modificó la semántica de CI.
- El commit `7081279aa2834ccb6d364ecc2beb18c1de7c5464` no es solución ni
  forma parte de la cadena.

## 2. Exclusión confirmada: Student Deliverables

`apps/web/src/features/student-deliverables-screens.spec.tsx` y la
funcionalidad Student Deliverables quedan **excluidas de este RC por
pertenecer a Fase 6**. No se restaura ni se incorpora mecánicamente. La
compatibilidad de lectura/render del body document que F5 necesita no amplía
el alcance a entregables, edición, publicación o acciones teacher-only para
alumnos.

## 3. Cobertura obligatoria F4/F5

La aceptación F4/F5 exige, como mínimo, la siguiente cobertura:

- trusted tenant context, incluyendo membresía, mismatch de tenant,
  contexto congelado, roles y casos negativos; junto con la prueba e2e de
  aislamiento/autorización de la foundation;
- `learning-visibility.policy`, con lifecycle, ventanas temporales,
  publicación programada, enrollment, cross-tenant y authoring teacher;
- Learning Domain E2E completo: aislamiento, visibility, drafts, publicación,
  historial/restauración, move/duplicate/unpublish, carreras de reorder e
  idempotencia;
- Course Builder: reducer optimista, dirty state, `beforeunload`, rollback
  `409 STALE_REVISION`, foco/teclado, feature flag y comandos;
- teacher experience adaptada a `BlockBodyEditor`, sin restaurar
  `rich-text-editor.tsx`, incluyendo preview seguro y XSS fail-closed;
- comandos atómicos, idempotencia, sparse ordering y propagación de
  revisiones/`Idempotency-Key`;
- body document: schema, fallback scalar, límites, IDs, URLs seguras,
  referencias autorizadas de recursos/imágenes y renderer sin HTML crudo;
- validación de archivos: extensión/MIME, firmas, aliases browser, nombres
  multipart UTF-8, límites y rechazo fail-closed;
- storage y submissions, incluido `/storage/usage` con
  `storageUsageSchema.strict()`, accounting lógico/físico/staged,
  `reconciliationStatus`, deduplicación, cuota y aislamiento cross-tenant.

Las suites dirigidas y el `pilot:e2e` de esta integración cubren esta lista;
los resultados y comandos exactos están en
`PHASE4_5_INTEGRATION_HANDOFF.md`.

## 4. Suites baseline restantes excluidas

Las siguientes suites permanecen como baseline del repositorio o de fases
fuera del alcance de aceptación F4/F5. No se incorporan como nueva cobertura
propia ni se usan para declarar resueltas las decisiones de este RC:

### API

- `apps/api/src/authorization/authorization.service.spec.ts`
- `apps/api/src/bootstrap/tenant-bootstrap.spec.ts`
- `apps/api/src/config/environment.spec.ts`
- `apps/api/src/identity/identity-internal-http.spec.ts`
- `apps/api/src/identity/jwks-identity-access-token-verifier.spec.ts`
- `apps/api/src/notifications/notification-templates.spec.ts`
- `apps/api/src/notifications/notification-worker.spec.ts`
- `apps/api/src/sync/edupay-integration.client.spec.ts`
- `apps/api/src/sync/sync-configuration.spec.ts`
- `apps/api/src/sync/sync-worker.service.spec.ts`
- `apps/api/test/academic-domain.e2e-spec.ts`
- `apps/api/test/edupay-sync-consumer.e2e-spec.ts`
- `apps/api/test/health.e2e-spec.ts`
- `apps/api/test/notifications.e2e-spec.ts`

### Web

- `apps/web/src/app/page.spec.tsx`
- `apps/web/src/auth/session-provider.spec.tsx`
- `apps/web/src/components/account-provisioning.spec.tsx`
- `apps/web/src/components/app-shell.spec.tsx`
- `apps/web/src/components/notification-center.spec.tsx`
- `apps/web/src/components/ui-foundation.spec.tsx`
- `apps/web/src/config/environment.spec.ts`
- `apps/web/src/features/academic-admin.spec.tsx`
- `apps/web/src/features/academic-context-screens.spec.tsx`
- `apps/web/src/features/account-screens.spec.tsx`
- `apps/web/src/features/learning-datetime.spec.ts`
- `apps/web/src/features/learning-screens.spec.tsx`
- `apps/web/src/features/representative-screens.spec.tsx`
- `apps/web/src/features/storage-submission-screens.spec.tsx`
- `apps/web/src/identity/identity-client.spec.ts`

Estas exclusiones no eliminan ni alteran archivos del baseline. Cualquier
ampliación posterior requiere una decisión explícita de alcance y un commit
separado. Los 104 archivos con diferencias de Prettier son una exclusión de
formato independiente y no deben confundirse con exclusiones de suites.

## 5. Decisión de release

El formato global está resuelto y las exclusiones están formalizadas. Por
tanto, el estado es `RELEASE_CANDIDATE_READY_FOR_OWNER_APPROVAL`. Esto no
emite `GO PRODUCCIÓN`; la aprobación del owner debe considerar los seis
fallos y 14 skips de la validación API con PostgreSQL documentados en
`PHASE4_5_FINAL_VALIDATION.md`.

No emitir `GO PRODUCCIÓN` hasta que:

1. el owner acepte explícitamente las exclusiones de alcance, incluida Fase 6
   y las suites baseline de esta página;
2. exista una decisión técnica sobre los seis fallos/14 skips DB o una
   ejecución posterior completamente verde.

El `pilot:e2e` verde, incluido `/storage/usage`, no sustituye la validación
DB pendiente ni la aprobación del owner.

## Rollback

La integración funcional se revierte sin reescribir historia revirtiendo, en
orden inverso, `7075683`, `2184349` y `963872b`, volviendo a
`e2b2688640b70f7f89489d3af1ccfb91f551f4a6`. El commit documental de esta
decisión también puede revertirse por separado. No ejecutar `DROP COLUMN`,
borrar tablas, hacer merge, push, deploy ni aplicar migraciones productivas.
