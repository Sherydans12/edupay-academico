# Validación técnica final — Release Candidate Fases 4 y 5

Fecha: 2026-08-26
Base funcional: `8fbae42acd260f7ca9c201d1c8a88d1aba65ac4b`
Base de validación DB: `9a2da4f08513355ba203e09d4a6ca09da5937dac`
Commit posterior separado: `317f60fb3b72eaad451186bda24f058cf8f2874f`
Estado: `RELEASE_CANDIDATE_BLOCKED_PENDING_OWNER_APPROVAL`

Esta validación se ejecutó en el worktree aislado
`C:\Users\nicol\Documents\EduPayAcademico-worktrees\course-builder-db-gates-fix`,
branch `codex/course-builder-db-gates-fix`. No se hizo merge, push, deploy ni
migración productiva.

## Formato baseline

El branch separado
`codex/baseline-format-cleanup-final` se creó desde
`5b0ad1f5f8ab0552ed1c502f30840b4afcc13fd8`. La comparación contra la
integración aisló exactamente 104 archivos heredados; las 15 rutas restantes
del baseline se solapan con superficies F4/F5 ya formateadas en la
integración.

- `fdbf238e02e785fd06c61b9f0dfebabc50c2a2fa` — formato de los 104 archivos.
- El cherry-pick produjo `1168a2d` con 103 archivos por un conflicto en la
  suite de storage; se conservó el contenido F4/F5.
- `628a3d33e74eca3bfd805b63aa67752d7171c397` — formato mecánico del único
  archivo conflictivo, `apps/api/test/storage-submissions.e2e-spec.ts`.
- `pnpm format:check` en esta integración: **PASS**, cero diferencias.
- `git diff --check`: **PASS**.
- `7081279aa2834ccb6d364ecc2beb18c1de7c5464` no está en la cadena.

No se creó política CI baseline-aware ni waiver.

## Gates finales

| Gate                                                                                                  | Resultado         | Evidencia                                                                           |
| ----------------------------------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                      | PASS              | Lockfile sin cambios; 6 proyectos                                                   |
| `pnpm typecheck`                                                                                      | PASS              | Contracts, UI, API y Web                                                            |
| `pnpm lint`                                                                                           | PASS              | ESLint global                                                                       |
| `pnpm format:check`                                                                                   | PASS              | Cero diferencias globales                                                           |
| `git diff --check`                                                                                    | PASS              | Sin errores de whitespace                                                           |
| `pnpm --filter @edupay/api test` con `TEST_DATABASE_URL`                                              | PASS              | 28 suites; 226 passed; 0 skipped                                                    |
| `pnpm --filter @edupay/web test`                                                                      | PASS              | 19 suites; 94 passed                                                                |
| `pnpm release:check`                                                                                  | PASS condicionado | URLs `.invalid`; schema, build y tests verdes; su subgate API sin DB omite 37 tests |
| `pnpm release:config:check -- --service academico --env-file deploy/env/academico-api.ci.env.example` | PASS              | 35 settings; secretos omitidos                                                      |
| `pnpm pilot:e2e`                                                                                      | PASS              | Identity `main` disposable; smoke cross-service completo, incluido `/storage/usage` |

## Validación API con PostgreSQL disposable

Se usó un contenedor PostgreSQL 16 disposable y aislado, con
`DATABASE_URL`/`TEST_DATABASE_URL` explícitos. Se aplicó únicamente
`prisma migrate deploy` dentro de esas bases disposable. Los contenedores se
retiraron al terminar.

La ejecución completa `pnpm --filter @edupay/api test` con
`TEST_DATABASE_URL=postgresql://edupay:***@127.0.0.1:55440/edupay_academico`
reportó `28 suites passed`, `226 tests passed` y `0 skipped`. Las tres suites
afectadas se verificaron además de forma dirigida: Learning `11/11`, Storage
`3/3` y Notifications `1/1`.

La reconciliación contractual quedó así:

1. `POST /learning-units/:learningUnitId/items/reorder` responde `201`: es un
   `POST` sin `@HttpCode(200)`, `ContractResponse` declara `2XX` y Nest aplica
   `201` por defecto. El `status: 200` del servicio es metadato interno del
   receipt, no el status HTTP. La expectativa exige `[201, 409]`.
2. `IDEMPOTENCY_KEY_REUSED` se valida exclusivamente con
   `apiErrorEnvelopeSchema`: `{ error: { code, message, details, requestId } }`.
   No se acepta `code` en el body raíz.
3. Los cleanups borran `commandReceipt`, `contentRevision` y
   `learningItemDraft` antes de `learningItem`/`tenant`, respetando las FK
   `command_receipts_tenant_id_fkey` y `content_revisions_tenant_id_fkey`.
   También se alinearon los cleanups compartidos de Academic y Sync para que
   el gate completo sea reproducible. No se cambió el schema ni se agregaron
   cascadas.

La solicitud previa de enumerar exactamente 14 skips no es reproducible en
este commit: la enumeración exacta con DB es vacía (`0`). La búsqueda de
declaraciones de skip encontró únicamente cinco suites condicionadas por
`TEST_DATABASE_URL`, sin `.skip`/`.todo` explícitos:

- `test/academic-domain.e2e-spec.ts`: 11 tests omitidos solo sin DB.
- `test/edupay-sync-consumer.e2e-spec.ts`: 11 tests omitidos solo sin DB.
- `test/learning-domain.e2e-spec.ts`: 11 tests omitidos solo sin DB.
- `test/notifications.e2e-spec.ts`: 1 test omitido solo sin DB.
- `test/storage-submissions.e2e-spec.ts`: 3 tests omitidos solo sin DB.

Total del modo sin `TEST_DATABASE_URL`: 37 skips, todos condicionales y no
PASS. `release:check` usa ese modo sin DB para su subgate de tests, por lo que
su resultado de comando es PASS condicionado; el gate DB explícito arriba es
el resultado de cobertura PostgreSQL y no tiene skips.

## Decisión de estado

El formato global está resuelto mediante commits separados y las exclusiones
Fase 6/baseline están documentadas en
`PHASE4_5_RELEASE_DECISIONS.md`. La validación PostgreSQL está verde, pero el
estado se mantiene explícitamente como
`RELEASE_CANDIDATE_BLOCKED_PENDING_OWNER_APPROVAL` hasta la aprobación del
owner y la aceptación formal de las exclusiones. Este estado no equivale a
`GO PRODUCCIÓN`.

## Rollback

Para retirar únicamente esta corrección, ejecutar en una rama de revisión
`git revert 317f60f`; no reescribir historia. Para volver funcionalmente al
candidato original, revertir en orden inverso los commits funcionales
`7075683`, `2184349` y `963872b`, dejando los commits de formato y
documentación para una revisión separada. No ejecutar `migrate reset`,
`DROP COLUMN`, borrado de tablas, merge, push ni deploy.
