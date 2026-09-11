# Handoff de integración RC — Fases 4 y 5

Estado: `RELEASE_CANDIDATE_BLOCKED_PENDING_OWNER_APPROVAL`.

Las decisiones de alcance y las exclusiones cerradas en este handoff están
formalizadas en `PHASE4_5_RELEASE_DECISIONS.md`.

Este worktree de validación DB es una integración aislada creada desde `9a2da4f08513355ba203e09d4a6ca09da5937dac`:

- Rama: `codex/course-builder-db-gates-fix`.
- Ruta: `C:\Users\nicol\Documents\EduPayAcademico-worktrees\course-builder-db-gates-fix`.
- Commit posterior: `317f60fb3b72eaad451186bda24f058cf8f2874f`.
- No se hizo merge, push, deploy ni migración productiva.
- El worktree original, las ramas fuente y EduPay Identity no fueron modificados.
- El Identity disposable usado por el piloto fue `C:\Users\nicol\Documents\EduPayIdentity-worktrees\pilot-release-origin-main`, en `main`, limpio y sincronizado con `origin/main` en `98da17b013c9fbf74f618a2f54e0eea8779c5136`.

## Commits integrados

1. `e2b2688640b70f7f89489d3af1ccfb91f551f4a6` — candidato original preservado como base.
2. `963872b` — cherry-pick verificable de `208c0396baa79347954edb200ec3c273c453d105`; añadió capacidad de volumen y respuesta estricta de `/storage/usage`. Se resolvieron conflictos conservando los contratos y fixtures del candidato.
3. `2184349` — recuperación de TrustedTenantContext, política de visibilidad, validación de archivos y Learning Domain E2E completo.
4. `7075683` — suite de teacher experience adaptada a `BlockBodyEditor`; no restaura `rich-text-editor.tsx`.
5. `1168a2d`, `628a3d3` — formato baseline separado, sin cambios funcionales.
6. `317f60f` — reconciliación DB de contratos y cleanups FK; no cambia schema.

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
- Suites completas anteriores: API `23 passed | 5 skipped`, `189 passed | 37 skipped`; Web `19 passed`, `94 passed`. Esos skips API son suites DB condicionadas cuando la ejecución local no tiene `DATABASE_URL`.

## Gates

| Gate                                                                                                  | Resultado                                                           |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                      | PASS                                                                |
| Prisma generate/validate local                                                                        | PASS                                                                |
| `pnpm typecheck`                                                                                      | PASS                                                                |
| `pnpm lint`                                                                                           | PASS                                                                |
| `git diff --check`                                                                                    | PASS                                                                |
| `pnpm --filter @edupay/api test` con `TEST_DATABASE_URL`                                              | PASS, `28 suites / 226 tests`, 0 skips                              |
| `pnpm --filter @edupay/web test`                                                                      | PASS                                                                |
| `pnpm release:check` sin URLs públicas                                                                | FAIL de precondición de build: faltaron URLs públicas               |
| `pnpm release:check` con URLs sintéticas `.invalid`                                                   | PASS                                                                |
| `pnpm release:config:check -- --service academico --env-file deploy/env/academico-api.ci.env.example` | PASS, 35 settings                                                   |
| `pnpm pilot:e2e` con Identity disposable explícito                                                    | PASS, `CHECKPOINT PASS full real-service pilot cross-service smoke` |

`pnpm format:check` ejecuta directamente `prettier --check .`, por lo que el gate global exige cero diferencias. Los 104 archivos heredados fueron formateados en el commit baseline separado `fdbf238`; el único conflicto en una suite F4/F5 se resolvió conservando su contenido y formateándolo en `628a3d3`. La comprobación global final es PASS y no usa waiver.

## Cierre DB posterior

Con `TEST_DATABASE_URL` explícito, `pnpm --filter @edupay/api test` pasó
`28/28` archivos y `226/226` tests, con `0` skips. Learning pasó `11/11`,
Storage `3/3` y Notifications `1/1`. El cleanup elimina
`commandReceipt`, `contentRevision` y `learningItemDraft` antes de las filas
de Learning/Tenant, sin cascadas nuevas ni cambios de schema. Academic y Sync
comparten el mismo orden para que la ejecución API completa sea reproducible.

La enumeración exacta de 14 skips solicitada no existe en este commit: con DB
es `0`, y no hay declaraciones `.skip`/`.todo`. Solo se detectan cinco
suites condicionadas por `TEST_DATABASE_URL`, que suman 37 tests omitidos en
el modo sin DB usado por el subgate interno de `release:check`: Academic 11,
Sync 11, Learning 11, Notifications 1 y Storage 3. Esos 37 no se cuentan
como PASS.

## Exclusiones vigentes y pendientes

- `apps/web/src/features/student-deliverables-screens.spec.tsx` no se incorpora: queda excluida por pertenecer a Fase 6.
- Las suites baseline fuera del alcance F4/F5 quedan excluidas y enumeradas en `PHASE4_5_RELEASE_DECISIONS.md`; ampliar ese alcance requiere aprobación explícita y commit separado.
- La limpieza de los 104 archivos heredados queda en commits de formato separados; no contiene cambios funcionales F4/F5 ni incluye `7081279`.
- No se copian cambios de `.claude/**`, Identity, Fase 6, notificaciones/sincronización fuera del RFC ni scripts de laboratorio.

## Rollback

- Rollback de código: revertir en orden inverso `7075683`, `2184349` y `963872b`, sin reescribir historia, para volver al candidato `e2b2688`.
- El body document y receipts/ordering son migraciones aditivas ya presentes en el candidato; ante rollback operacional se vuelve al código anterior y se deja `ACADEMIC_BODY_DOCUMENT_READ_ENABLED=0` si corresponde.
- No ejecutar `DROP COLUMN`, borrar tablas ni aplicar migraciones productivas como parte de este handoff.

El candidato permanece bloqueado para aprobación del owner hasta que se
confirme formalmente el resultado DB y las exclusiones; no emitir `GO` de
release.
