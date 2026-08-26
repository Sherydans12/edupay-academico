# Validación técnica final — Release Candidate Fases 4 y 5

Fecha: 2026-08-26  
Base funcional: `8fbae42acd260f7ca9c201d1c8a88d1aba65ac4b`  
Estado: `RELEASE_CANDIDATE_READY_FOR_OWNER_APPROVAL`

Esta validación se ejecutó en el worktree aislado
`C:\Users\nicol\Documents\EduPayAcademico-worktrees\course-builder-release-integration-final`,
branch `codex/course-builder-release-integration-final`. No se hizo merge,
push, deploy ni migración productiva.

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
| `pnpm --filter @edupay/api test`                                                                      | PASS condicionado | 23 suites; 189 passed, 37 skipped sin `TEST_DATABASE_URL`                           |
| `pnpm --filter @edupay/web test`                                                                      | PASS              | 19 suites; 94 passed                                                                |
| `pnpm release:check`                                                                                  | PASS              | URLs públicas sintéticas `.invalid`; schema, build y tests verdes                   |
| `pnpm release:config:check -- --service academico --env-file deploy/env/academico-api.ci.env.example` | PASS              | 35 settings; secretos omitidos                                                      |
| `pnpm pilot:e2e`                                                                                      | PASS              | Identity `main` disposable; smoke cross-service completo, incluido `/storage/usage` |

## Validación API con PostgreSQL disposable

Se usaron contenedores PostgreSQL 15 nuevos y aislados, con
`DATABASE_URL`/`TEST_DATABASE_URL` explícitos. Se aplicó únicamente
`prisma migrate deploy` dentro de esas bases disposable. Los contenedores se
retiraron al terminar.

La ejecución completa `pnpm --filter @edupay/api test` con PostgreSQL reportó:

- 25 suites pasadas, 3 suites fallidas;
- 220 tests pasados, 14 skips y 6 fallos.

Los fallos reproducibles del baseline funcional fueron:

1. `test/learning-domain.e2e-spec.ts`: la carrera de reorder recibió
   `[201, 409]` pero la expectativa exige `[200, 409]`.
2. `test/learning-domain.e2e-spec.ts`: el test de idempotencia espera
   `code` en el body raíz, pero la API devuelve el error bajo `body.error`.
3. `test/notifications.e2e-spec.ts` y
   `test/storage-submissions.e2e-spec.ts`: el cleanup intenta borrar tenants
   con filas dependientes, provocando P2003 en
   `command_receipts_tenant_id_fkey` o `content_revisions_tenant_id_fkey`.

Ejecuciones aisladas adicionales confirmaron que notifications pasa 1/1 en
una base nueva; storage pasa 1/3 y vuelve a fallar al limpiar las filas de
`content_revisions`; Learning pasa 9/11 y conserva los dos fallos de contrato
anteriores. No se modificaron tests ni código para ocultar estos resultados.

Los 37 skips del gate estándar son los tests PostgreSQL condicionados por
`TEST_DATABASE_URL` en `academic-domain.e2e-spec.ts`,
`edupay-sync-consumer.e2e-spec.ts`, `learning-domain.e2e-spec.ts`,
`notifications.e2e-spec.ts` y `storage-submissions.e2e-spec.ts`. Con DB
disposable se redujeron a 14, que permanecen visibles en el reporte; no hay
declaraciones explícitas `.skip` en las suites API rastreadas. Los fallos de
setup/contrato impiden declarar la ejecución DB completamente verde.

## Decisión de estado

El formato global está resuelto mediante commits separados y las exclusiones
Fase 6/baseline están documentadas en
`PHASE4_5_RELEASE_DECISIONS.md`. Por cumplir esas dos condiciones explícitas,
el estado cambia a `RELEASE_CANDIDATE_READY_FOR_OWNER_APPROVAL`. La
validación API con PostgreSQL mantiene seis fallos y 14 skips visibles para
la aprobación del owner; este estado no equivale a `GO PRODUCCIÓN`.

## Rollback

Para volver funcionalmente a `e2b2688640b70f7f89489d3af1ccfb91f551f4a6`,
revertir en orden inverso `7075683`, `2184349` y `963872b`. Los commits de
formato y documentación pueden revertirse separadamente. No ejecutar
`migrate reset`, `DROP COLUMN`, borrado de tablas, merge, push ni deploy.
