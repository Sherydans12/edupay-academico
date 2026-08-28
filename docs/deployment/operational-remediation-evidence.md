# Evidencia operativa de remediación

Estado: **CANDIDATO PREPARADO; PRODUCCIÓN SIGUE BLOQUEADA SIN AUTORIZACIÓN EXPLÍCITA**.

Base exacta: `c5b92d3308b92a5dfc6f60da9b111f47344b7765`.
Worktree: `C:\Users\nicol\Documents\EduPayAcademico-worktrees\course-builder-operational-remediation`.
Rama: `codex/operational-remediation`.

No se accedió ni modificó producción, R2 productivo, Identity productivo ni
bases productivas.

## Storage/ClamAV disposable

- `pilot:e2e`: **PASS** con ClamAV privado disposable fijado por digest.
- Upload limpio y descarga autorizada: **PASS**.
- EICAR: pasó validaciones preliminares, llegó al scanner real y devolvió
  `MALWARE_DETECTED`.
- Blob publicado para EICAR: **0**.
- Staging después de EICAR y outage: **vacío**.
- Outage ClamAV: readiness falló y el upload fue rechazado
  `MALWARE_SCANNER_UNAVAILABLE` (fail-closed).
- Contenedores piloto al finalizar: retirados; no quedaron contenedores
  `edupay-pilot`.

La causa original de `VALIDATION_ERROR` fue la cuarentena/intercepción del
archivo EICAR por el antivirus del host disposable antes de que la ruta de
validación pudiera leerlo. En el perfil de prueba con ClamAV, Multer usa un
buffer acotado, la validación preliminar se ejecuta sobre esos bytes, el
scanner recibe el buffer real y el storage solo escribe después de `CLEAR`.
El perfil productivo mantiene disk staging.

## Backup/restore R2 no productivo disposable

Conjunto transferido: `20260828T150741Z`.

Cliente validado: AWS CLI `2.23.6`.

- Configuración aplicada: región `auto`, checksums `when_required`,
  `addressing_style=path`, `payload_signing_enabled=false` y metadata EC2
  deshabilitada.
- PutObject sintético de compatibilidad: **PASS**; objeto de prueba eliminado:
  **PASS**.
- `backup-pilot.sh` con `BACKUP_REQUIRE_OFFHOST=1`: **PASS**.
- Transferencia al bucket R2 no productivo aprobado bajo el prefijo
  `edupay-academico/pilot`: **PASS**.
- Verificación remota por listado, presencia, tamaño y SHA-256: **PASS**.
- Restore desde artefactos descargados a PostgreSQL disposable: **PASS**.
- Tenant sintético, archivo privado y SHA-256: **PASS**.
- Staging sintético después del restore: **vacío**.
- Recursos disposable (runner, PostgreSQL y redes): **eliminados**.

- Checksum local: **PASS**, `sha256sum --check --strict SHA256SUMS`.
- Restore disposable separado: **PASS**.
- Tenant canónico restaurado en ambas bases: **PASS**.
- File object restaurado: **1**; tamaño y SHA del archivo privado: **PASS**.
El artefacto remoto no productivo queda como evidencia del ejercicio. No se
creó otro bucket y no se usó el destino productivo. Las credenciales se
inyectaron solo en el runner disposable y no aparecen en este repositorio,
logs ni evidencia.

## Validaciones ejecutadas

- `pnpm --filter @edupay/api db:generate`: PASS.
- Suites dirigidas `file-validation` y ClamAV adapter: **20/20 PASS**.
- `pnpm pilot:e2e` disposable con migraciones solo en bases efímeras: **PASS**.
- `pnpm typecheck`: PASS después de generar Prisma.
- `pnpm lint`: PASS.
- `pnpm format:check`: PASS.
- `pnpm release:check` con URLs públicas sintéticas `.invalid`: PASS. El
  intento sin esas URLs falló en la precondición esperada del build web.
- `pnpm release:config:check -- --service academico --env-file
deploy/env/academico-api.ci.env.example`: PASS; 35 settings, secretos
  omitidos.
- Sintaxis de los tres helpers de backup: PASS en contenedor disposable.
- Las migraciones `20260824140000` y `20260825113000` no contienen `DROP`,
  `TRUNCATE` ni `DELETE`; la cadena heredada contiene un `DROP INDEX` en
  `20260811190000`, sin borrado de filas, pendiente de aprobación del
  responsable DB antes de cualquier uso productivo.

El gate técnico de backup/restore no productivo está cerrado. El artefacto de
producción queda preparado, pero cualquier migración, deploy, merge, push o
acción contra producción requiere una autorización posterior explícita.
