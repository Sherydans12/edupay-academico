# Release candidate local — Fases 4 y 5

Fecha de corte: 2026-08-26. Estado: **BLOQUEADO / no apto para producción**.

Este documento registra únicamente la preparación del commit local. No hubo
merge, push, deploy ni migración productiva. El inventario exacto de rutas,
exclusiones y baseline está en `PHASE4_5_RELEASE_INVENTORY.md`.

## Base y commit candidato

- Worktree original auditado: rama `codex/course-builder-phase5`, `HEAD`
  `0149c397990d1f78294beb53533ae8c9272f5828`.
- Estado inicial original: 287 tracked modificados, 24 entradas no rastreadas
  (43 archivos al expandir directorios con `--untracked-files=all`), 0
  eliminados; 311 entradas de `git status --porcelain=v1` y 330 archivos
  expandidos.
- Worktree candidato: rama `codex/course-builder-release-candidate-main`.
- Base inmutable: `main`
  `5b0ad1f5f8ab0552ed1c502f30840b4afcc13fd8`.
- SHA del commit candidato: se registra en el handoff final con `git rev-parse HEAD`; no se embebe en el propio commit porque cambiaría su SHA.

La base operativa `main` evita arrastrar la variante incompatible de
`TrustedTenantContext` presente en el `HEAD` original. No se copiaron cambios
de Identity del worktree original.

## Gates ejecutados — primera pasada histórica

| Gate                                                                                                  | Resultado  | Evidencia concreta                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                      | PASS       | Instalación reproducible; lockfile vigente.                                                                                                                                                                                                             |
| `pnpm typecheck`                                                                                      | PASS       | Contracts, UI, API y Web.                                                                                                                                                                                                                               |
| `pnpm lint`                                                                                           | PASS       | 0 errores y 0 warnings después de retirar imports/props muertos y sustituir `watch` por `useWatch`.                                                                                                                                                     |
| `pnpm format:check`                                                                                   | FAIL       | Prettier reportó 125 archivos, incluyendo superficies heredadas del baseline y archivos compartidos del candidate; no se reformatearon masivamente porque eso ampliaría el release.                                                                     |
| `git diff --check`                                                                                    | PASS       | Sin errores de whitespace en el diff candidate.                                                                                                                                                                                                         |
| `pnpm --filter @edupay/api test`                                                                      | PASS final | La primera ejecución aislada tuvo timeout de 30 s en `test/security-foundation.e2e-spec.ts`; la repetición final pasó con 19 archivos, 5 skipped, 122 tests y 31 skipped.                                                                               |
| `pnpm --filter @edupay/web test`                                                                      | PASS       | 18 archivos y 84 tests pasaron; jsdom imprimió avisos `Not implemented: navigation to another Document`, sin fallo de suite.                                                                                                                            |
| `pnpm release:check`                                                                                  | FAIL       | Schema/generate, lint, typecheck y tests internos pasaron (Web 18/84; API 19/122, 5 archivos/31 tests skipped); el build web falló al prerenderizar `/activate` y `/docente` por `NEXT_PUBLIC_API_BASE_URL` y `NEXT_PUBLIC_IDENTITY_BASE_URL` ausentes. |
| `pnpm release:config:check -- --service academico --env-file deploy/env/academico-api.ci.env.example` | PASS       | 35 settings requeridos comprobados; valores secretos omitidos.                                                                                                                                                                                          |
| `pnpm pilot:e2e`                                                                                      | FAIL       | Topología disposable y preparación iniciadas; el harness abortó porque el checkout EduPay Identity estaba en `feat/account-lifecycle-email-cors`, no en `main`.                                                                                         |

No se reporta un PASS global mientras permanecen fallos de formato, API,
release build y pilot.

## Warnings de lint — primera pasada histórica

El primer `pnpm lint` tuvo 12 warnings: imports no usados en
`course-builder.tsx`, `types.ts` y `unit-card.tsx`; props de schedule no usadas;
y la incompatibilidad de `watch` con React Hook Form. Se corrigieron dentro del
worktree candidato, sin cambiar el comportamiento funcional. El segundo lint
terminó con 0 warnings.

## Verificación de alcance

- Se incluyeron únicamente rutas del inventario F4/F5 y dependencias de
  compatibilidad explicadas allí.
- Se excluyeron `.claude/**`, fases previas no necesarias, el archivo literal
  `Fuera de alcance de esta vista`, artefactos de laboratorio, secretos,
  Identity, Fase 6 y notificaciones/sincronización fuera del RFC incremental.
- Los archivos compartidos se contrastaron contra `main` por hunks; no se
  incluyeron automáticamente como superficie completa de Fase 4 o Fase 5.
- No se ejecutó `prisma migrate deploy`; la generación/validación fue local y
  las pruebas disposable no representan una migración productiva.

## Migración y rollback

Las migraciones de receipts/orden y body document son additives. El backfill
crea un bloque `TEXT` determinista desde los scalars legacy y conserva `body`,
`content` e `instructions`. Ante rollback se debe volver al código anterior o
poner `ACADEMIC_BODY_DOCUMENT_READ_ENABLED=0`, manteniendo las columnas nuevas;
no se debe ejecutar `DROP COLUMN` ni modificar producción desde este candidato.

## Riesgos restantes — primera pasada histórica

1. El formato heredado/compartido fue medido inicialmente en 125 archivos y requiere
   decisión separada del owner del baseline.
2. La suite API tuvo un timeout transitorio en la primera ejecución; la
   repetición posterior pasó. La revalidación final está documentada abajo.
3. El pilot smoke requiere un checkout Identity en `main` y variables públicas
   de build; no se deben resolver incorporando cambios de Identity a este
   candidate.
4. El candidate queda deliberadamente condicional y no habilita GO producción.

## Revalidación de cierre Fases 4 y 5

Esta sección supersede los resultados históricos de la tabla anterior y deja
constancia de la reejecución solicitada sobre el worktree candidato.

### Alcance final

- El commit base preservado sigue siendo `2ddd4734b91a76c67f6bd53c3b6e7850d483f75a`.
- Se mantuvieron las 59 rutas originales del candidato.
- Se añadieron únicamente las dos suites de regresión ausentes que pertenecen
  al dominio Learning: `apps/api/src/learning/learning-atomic-commands.spec.ts`
  y `apps/api/src/learning/read/learning-read.service.spec.ts`.
- Se corrigió en la migración propia del candidato la materialización faltante
  de `content_revisions`, `learning_item_drafts` y las columnas `version` de
  `learning_units`/`learning_items`. Esto evita que una base disposable nueva
  quede distinta del schema aprobado.
- Permanecen excluidos los archivos heredados de `main`, las suites Web no
  presentes en este candidato y cualquier cambio de Identity, Fase 6 o
  infraestructura productiva.

### Formato: clasificación explícita

La cifra histórica de 125 archivos del inventario no se reproduce con la
ejecución actual de Prettier 3.9.6 y el lockfile vigente. La medición de cierre
antes de corregir las rutas compartidas fue de 110 archivos globales: 105 eran
únicamente baseline y 5 eran rutas compartidas del candidate que también
fallaban en baseline:

- `apps/web/src/app/globals.css`
- `apps/web/src/features/learning-screens.spec.tsx`
- `apps/web/src/features/storage-submission-screens.spec.tsx`
- `apps/web/src/features/student-screens.tsx`
- `packages/ui/src/styles.css`

Las cinco rutas compartidas fueron formateadas de forma acotada. La comprobación
posterior sobre las 61 rutas del candidate (59 originales y 2 suites añadidas)
queda limpia; el gate global conserva 105 fallos, todos exclusivos del
baseline. No se reformatearon esos 105 archivos heredados. La diferencia
histórica entre 125 y 110 queda registrada como discrepancia del baseline y
requiere aprobación explícita separada; no se mezcla silenciosamente con
Fases 4/5.

### Cobertura

- API esperada: 191 tests. La ejecución completa con las suites recuperadas
  terminó `21 passed | 5 skipped` en 26 archivos, con `158 passed | 31
skipped`; la suite está verde, pero aún no alcanza el baseline aprobado.
- Las dos suites nuevas sí pasan aisladamente: 16/16 tests atómicos y 20/20
  tests de lectura.
- Web esperada: 107 tests; el candidato ejecuta 84/84 en 18 archivos.
- La brecha no se redujo silenciosamente: faltan suites API de visibilidad,
  validación de archivos, trusted tenant context y deltas E2E que existen en el
  worktree original; en Web faltan las suites `student-deliverables` y
  `teacher-experience`, esta última además requiere `rich-text-editor.tsx`,
  ausente del candidato. Incluirlas implicaría ampliar el alcance del RC.
  Queda pendiente aprobación formal del owner o incorporación en una revisión
  posterior.

### Gates reejecutados

| Gate                                                                                                  | Resultado    | Evidencia                                                                                                            |
| ----------------------------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                      | PASS         | Lockfile vigente; ejecutado en candidato y checkout Identity disposable.                                             |
| `pnpm typecheck`                                                                                      | PASS         | Contracts, UI, API y Web.                                                                                            |
| `pnpm lint`                                                                                           | PASS         | Sin errores ni warnings.                                                                                             |
| `pnpm format:check`                                                                                   | FAIL         | 105 fallos globales, todos exclusivos del baseline; las 61 rutas del candidate pasan.                                |
| `git diff --check`                                                                                    | PASS         | Sin whitespace inválido en el diff candidato.                                                                        |
| `pnpm --filter @edupay/api test`                                                                      | PASS parcial | 21 archivos, 158 tests pass y 31 skipped; queda por debajo de los 191 tests esperados.                               |
| `pnpm --filter @edupay/web test`                                                                      | PASS         | 18 archivos, 84 tests.                                                                                               |
| `pnpm release:check`                                                                                  | PASS         | Con URLs públicas sintéticas pasó schema/generate, lint, typecheck, API 158/31 skipped, Web 84/84 y build Web 26/26. |
| `pnpm --filter @edupay/web build`                                                                     | PASS         | Build directo con URLs sintéticas; prerender 26/26.                                                                  |
| `pnpm release:config:check -- --service academico --env-file deploy/env/academico-api.ci.env.example` | PASS         | 35 settings requeridos; secretos omitidos.                                                                           |
| `pnpm pilot:e2e`                                                                                      | FAIL         | Topología real y Learning pasan; falla en `GET /storage/usage` con 500 por desalineación baseline servicio/contrato. |

URLs de build usadas, no productivas:
`https://academico.example.invalid/api/v1` y
`https://identity.example.invalid`.

### Evidencia del checkout Identity

Se usó exclusivamente el disposable
`C:\Users\nicol\Documents\EduPayIdentity-worktrees\pilot-release-origin-main`.
La verificación fue: rama `main`, `HEAD`
`98da17b013c9fbf74f618a2f54e0eea8779c5136`, igual a `origin/main`, y checkout
limpio. El checkout original `C:\Users\nicol\Documents\EduPayIdentity` no se
modificó ni limpió.

El primer intento del piloto detectó una migración académica incompleta
(`P3018`, relación `learning_item_drafts` inexistente); la corrección propia del
candidato la resolvió. La ejecución siguiente confirmó los checkpoints de
seguridad, onboarding, publicación y acceso; se detuvo en `/storage/usage`,
que no se simuló ni se ocultó.

### Rollback y estado

El rollback de código es volver al commit candidato base
`2ddd4734b91a76c67f6bd53c3b6e7850d483f75a` o al commit posterior de cierre que
se entrega, sin reescribir ninguno. La migración es aditiva; no se debe hacer
`DROP COLUMN`, borrar tablas ni ejecutar migraciones productivas como parte de
este cierre. Para el body document, el fallback documentado sigue siendo
`ACADEMIC_BODY_DOCUMENT_READ_ENABLED=0`.

Estado: **BLOQUEADO — pendiente de aprobación explícita del owner para formato,
brecha de cobertura y el fallo baseline de `/storage/usage`**. No se solicita
GO producción.
