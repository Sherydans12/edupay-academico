# Release candidate local — Fases 4 y 5

Fecha de corte: 2026-08-25. Estado: **CONDICIONAL / no apto para producción**.

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

## Gates ejecutados

| Gate | Resultado | Evidencia concreta |
|---|---|---|
| `pnpm install --frozen-lockfile` | PASS | Instalación reproducible; lockfile vigente. |
| `pnpm typecheck` | PASS | Contracts, UI, API y Web. |
| `pnpm lint` | PASS | 0 errores y 0 warnings después de retirar imports/props muertos y sustituir `watch` por `useWatch`. |
| `pnpm format:check` | FAIL | Prettier reportó 125 archivos, incluyendo superficies heredadas del baseline y archivos compartidos del candidate; no se reformatearon masivamente porque eso ampliaría el release. |
| `git diff --check` | PASS | Sin errores de whitespace en el diff candidate. |
| `pnpm --filter @edupay/api test` | PASS final | La primera ejecución aislada tuvo timeout de 30 s en `test/security-foundation.e2e-spec.ts`; la repetición final pasó con 19 archivos, 5 skipped, 122 tests y 31 skipped. |
| `pnpm --filter @edupay/web test` | PASS | 18 archivos y 84 tests pasaron; jsdom imprimió avisos `Not implemented: navigation to another Document`, sin fallo de suite. |
| `pnpm release:check` | FAIL | Schema/generate, lint, typecheck y tests internos pasaron (Web 18/84; API 19/122, 5 archivos/31 tests skipped); el build web falló al prerenderizar `/activate` y `/docente` por `NEXT_PUBLIC_API_BASE_URL` y `NEXT_PUBLIC_IDENTITY_BASE_URL` ausentes. |
| `pnpm release:config:check -- --service academico --env-file deploy/env/academico-api.ci.env.example` | PASS | 35 settings requeridos comprobados; valores secretos omitidos. |
| `pnpm pilot:e2e` | FAIL | Topología disposable y preparación iniciadas; el harness abortó porque el checkout EduPay Identity estaba en `feat/account-lifecycle-email-cors`, no en `main`. |

No se reporta un PASS global mientras permanecen fallos de formato, API,
release build y pilot.

## Warnings de lint

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

## Riesgos restantes

1. El formato heredado/compartido sigue fallando en 125 archivos y requiere decisión
   separada del owner del baseline.
2. La suite API tuvo un timeout transitorio en la primera ejecución; la
   repetición final pasó. `release:check` sí falla posteriormente en el build web.
3. El pilot smoke requiere un checkout Identity en `main` y variables públicas
   de build; no se deben resolver incorporando cambios de Identity a este
   candidate.
4. El candidate queda deliberadamente condicional y no habilita GO producción.
