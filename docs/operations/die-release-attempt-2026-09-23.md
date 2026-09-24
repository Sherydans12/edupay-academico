# Release DIE: corrección de migradores y reconciliación del destino productivo

Fecha de registro: 2026-09-23T23:30:50Z
Estado actual: **DIE_PROMOTION_SUSPENDED_BY_USER; PRODUCTION_TARGET_RECONCILED**

Rectificación de 2026-09-24: el bloqueo por divergencia de base de datos fue
un diagnóstico erróneo. La comprobación inicial atribuyó a los APIs un ledger
vacío y las bases `edupay_identity`/`edupay_academico` de otro stack 2/6. La
reconciliación del contenedor activo, su entorno real y una conexión de sólo
lectura demuestra el destino administrado correcto y los ledgers 3/10. Véase
[la evidencia de reconciliación](die-database-target-reconciliation-2026-09-24.md).
Producción sigue disponible; la promoción DIE permanece suspendida por
instrucción del usuario. No se migró, redeplegó ni modificó configuración.

Este registro cubre el trabajo posterior al primer intento. No cambia SQL,
checksums ni el alcance DIE. El módulo DIE no está desplegado ni configurado
como piloto.

## Código, CI y procedencia

Los SHAs de aplicación autorizados siguen siendo Identity
93418b68eaf41976b4bc695039afcbc8eab4fdbc y Académico
bd413666ebb3674dc791d8cb735bcea1aadbed62.

Los publishers corregidos están en origin/main:

| Repositorio | SHA origin/main | CI principal |
| --- | --- | --- |
| Identity | f4327a3f089755df7b4ba3b4e056e41461d00fbe | run 35930770895, success |
| Académico | 369596c0e96ae59f15443bf619136b11fee71561 | run 35930774985, success |

Identity PR #14 corrigió el pin del checkout; Identity PR #15 corrigió la
validación Bash del digest. Académico PR #12 corrigió el pin del checkout y
Académico PR #13 corrigió la validación Bash del digest. Los runs publisher
35931270154 y 35931270221 terminaron correctamente desde los SHAs anteriores,
respectivamente.

Los artefactos migradores nuevos se publicaron para linux/amd64 con BuildKit,
provenance mode=max, SBOM y attestations remotas. Cada digest se obtuvo del
publisher, se descargó por digest y se cotejaron revisión, origen y comando
predeterminado. No se usa ningún ID local como digest remoto.

| Artefacto | Digest remoto verificado |
| --- | --- |
| Identity migrate | ghcr.io/sherydans12/edupay-identity-migrate@sha256:ad9edaa31bf01d4916846527041eadd65310ce21454bfb4d419d4ca2bfba9363 |
| Académico migrate | ghcr.io/sherydans12/edupay-academico-migrate@sha256:15247fe66c8345181a6bfe7e6ab9b40c889372bcab7dfa75de481cc074e34a13 |

El migrador Identity anterior
ghcr.io/sherydans12/edupay-identity-migrate@sha256:fa88615b0d08abf807ad4667b2812326648fa855aacc6221bb752b35cf2409b7
queda **retirado; no usar**. La causa corregida fue que el stage de migración
no instalaba/generaba el schema-engine compatible con Prisma CLI.

## Ensayo aislado de los contenedores publicados

Comando versionado en Académico: scripts/verify-die-migration-runners.ps1.
Se ejecutó contra los dos digests de la tabla y una instancia desechable de
PostgreSQL 15. El runner verificó que ambos contenedores son linux/amd64 y que
su Cmd coincide con el comando predeterminado de Coolify: Identity
pnpm prisma:migrate:deploy; Académico
pnpm --filter @edupay/api db:migrate:deploy.

Resultados:

- Identity desde cero: cuatro checksums exactos, incluidas las tres migraciones
  históricas y STAFF; una segunda ejecución no tuvo migraciones pendientes.
- Identity actualización: desde las tres históricas, sólo agregó
  20260924000000_add_staff_role; conservó datos sintéticos, checksums y recibo
  de idempotencia.
- Pruebas PostgreSQL Identity test/account-lifecycle.integration-spec.ts:
  10/10; incluyó replay, conflicto de payload, concurrencia a una sola operación
  y recibo, rollback, invitación, activación de un uso, recuperación de contraseña,
  revocación de sesión y contrato STAFF.
- Académico desde cero: trece checksums exactos.
- Académico actualización: de diez a trece migraciones; sólo agregó las tres
  autorizadas y preservó diez checksums y datos sintéticos de tenant/alumno.
- Las tablas del perfil y DIE quedaron vacías en el ensayo de actualización.

No se descargó schema-engine durante una migración. No se ejecutó ningún ensayo
contra producción.

## Preflight productivo inicial (23:30Z; hallazgo invalidado)

El siguiente resultado conserva la observación inicial para explicar el
incidente. No describe el estado de los APIs activos y no debe usarse como
preflight vigente. La comprobación posterior identificó que se mezclaron
contenedores de un Compose antiguo con los recursos nativos de Coolify; los
valores correctos, la cronología y el límite de la evidencia del recovery point
están en el documento de reconciliación enlazado arriba.

La comprobación del DATABASE_URL efectivo, proyectada sin usuario, contraseña ni
URL completa, mostró que ambos contenedores API apuntan al nombre de base
/postgres y sin parámetro schema. En cada servicio PostgreSQL:

| Servicio | Base usada por el API | Ledger allí | Otra base con esquema/ledger observado |
| --- | --- | --- | --- |
| Identity | postgres | No existe _prisma_migrations ni tablas Identity | edupay_identity: 2 terminadas, 0 no terminadas |
| Académico | postgres | No existe _prisma_migrations | edupay_academico: 6 terminadas, 0 no terminadas |

En edupay_identity se observaron:
- 20260808000000_identity_foundation:
  cf9aab4a7bc6b91c890bb3e5d981c523ffbd7df7fb1586c6d310c6fc463fb230
- 20260809000000_account_lifecycle:
  0257f6d7ca0676536ef93c27fe89fbbeff1639c291eb4d488f4719c57f07ff78

La tabla de recibos histórica no está presente en esa base observada. El preflight
anterior esperaba tres migraciones, incluida
20260831000000_provisioning_idempotency_receipts con checksum
c615b7fd9db0ea642ad08fa5981f498dd9a73e97b9db7c0d2d0d2d7cd53eb68b.

En edupay_academico se observaron seis filas terminadas:
20260808195654_academic_structure,
20260808220000_learning_content,
20260808230000_storage_submissions,
20260809000000_hardened_upload_transport,
20260809100000_academic_notifications y
20260811190000_edupay_sync_consumer. El preflight anterior esperaba diez
migraciones históricas.

Esto no permite determinar si las bases nombradas son la fuente de verdad, si
el API debe usar otro destino ni si los catálogos contienen efectos históricos
sin registrar. No se cambió DATABASE_URL, no se escribió en ninguna base y no
se ejecutó migrate resolve.

## Estado operativo y siguiente acción

- No se abrió mantenimiento en esta continuación; no hay 503 activo.
- No se pausaron escritores ni contenedores.
- No se obtuvo un recovery point nuevo. El punto
  20260923194655Z es anterior a actividad posterior y no es válido para esta
  promoción.
- No se ejecutó ninguna migración ni deployment de candidato. Los runtimes
  anteriores siguen disponibles; el último chequeo público observado antes de
  esta lectura dio Identity health 200, Académico API 200 y FRONT 200.
- El alias privado S2S corregido se conserva:
  IDENTITY_INTERNAL_BASE_URL=http://identity-0vrvqepcukwcubxga0narorf:3000.
  La verificación privada de health/JWKS y S2S sintético anterior pasó.

El destino de los APIs activos ya quedó verificado por conexión. Si se retoma
la promoción DIE en otra ventana, repetir el preflight desde cada proceso API,
seleccionando los PostgreSQL por UUID Coolify y verificando servidor, base,
schema y ledger. Obtener entonces un recovery point conjunto vigente. No
apuntar los APIs a las bases del Compose antiguo ni aplicar migraciones
históricas para hacer coincidir conteos.
