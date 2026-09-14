# Decisión de release — Fase 1 Academic Financial Projection

Estado: **PARCIAL — ACADÉMICO DESPLEGADO CON FLAGS OFF; BL-002 NO-GO**

Fecha de validación: 2026-09-13

## Actualización de ejecución — 2026-09-14

La autorización posterior se ejecutó de forma acotada. Académico pasó la
reconciliación real: backfill de 21 items y 0 drafts, resolución verificada de
8/24 y 8/25, ejecución de 9/3, ledger final completo y API publicada desde el
build funcional `e5bd78a3c0588df540878b130d7d22cd039cf7d1` con digest
`sha256:87daba03ee6ab34f00998270e4959a0e5073fdb3548c3a11d60b140bd0280cff`.
El main documental final Académico es
`59f434c8cb41547b042d6e7283d11a7a88bce110`.

BL-002 quedó bloqueado por el preflight real: 34 filas de ledger, 8
incompletas por registros históricos con `rolled_back_at` y sin `finished_at`.
No se marcaron migraciones como aplicadas, no se ejecutaron las migraciones de
mapping/shadow y no se desplegó el artefacto candidato. El BACK sigue en
`502e6463464de0a54b440362a64da0c31450818f` con `RUN_MIGRATIONS=false`.
La restauración del backup real protegido sigue comprobada, con las
limitaciones documentadas de consistencia viva y uploads.

Las funcionalidades producer, publisher y shadow siguen apagadas; no se
crearon mappings ni credenciales S2S productivas nuevas. La decisión no
autoriza activar funcionalidades ni reintentar BL sin reconciliar primero esas
8 filas sin alterar checksums ni historia.

## Candidatos evaluados

| Servicio | Candidato | Base `origin/main` | SHA candidato evaluado |
| --- | --- | --- | --- |
| Académico | `codex/projection-phase1-production-integration` | `28480b3533e65d035a279cd28a53b8b88e6aa0be` | `6bb4ff5` |
| BL-002 | `codex/projection-phase1-production-integration` | `4dd3f109556d01afbd708d946b5d494d2c6fc20a` | `c5ed3c0` |

Los candidatos permanecen locales, separados de `main`. Esta validación no
modificó Coolify, secretos, flags, mappings, bases ni datos productivos.

## Entorno reproducible

- Docker Desktop 4.44.3 / Engine 28.3.2 iniciado localmente.
- PostgreSQL 15 efímero para Académico y PostgreSQL 18 efímero para BL.
- Usuarios, bases y datos exclusivamente sintéticos; los contenedores no usan
  volúmenes de producción.

## Resultados de migración

| Escenario | Académico | BL-002 |
| --- | --- | --- |
| A. Base vacía | 9/9 migraciones aplicadas; `migrate status` al día | 28/28 migraciones aplicadas; `migrate status` al día |
| B. Ledger versionado de `origin/main` | 8 migraciones base + sólo `20260903110000_financial_projection_producer` | 26 migraciones base + `20260903090000_add_tenant_canonical_mapping`, luego `20260903113000_add_academic_financial_projection_shadow` |

El escenario B es una reproducción de la cadena versionada del repositorio,
no de la base productiva de Académico. Falta una extracción autorizada y de
solo lectura de `_prisma_migrations`, hashes y catálogo efectivo de producción
para reconstruir la divergencia conocida del ledger. No se ejecutó
`migrate resolve` fuera de las bases efímeras y no existe autorización para
hacerlo en producción.

## QA ejecutado

- Las cinco suites Academic antes condicionadas por `TEST_DATABASE_URL` se
  ejecutaron realmente sobre PG15: `academic-domain`, `edupay-sync-consumer`,
  `notifications`, `learning-domain` y `storage-submissions`: **37/37**.
  Antes de la corrección se observaron 13 fallos HTTP 500; la causa fue que
  una matrícula escribía outbox con el productor apagado. El commit `6bb4ff5`
  condiciona esa escritura al flag y la reejecución aprobó las 37 pruebas.
- Académico: typecheck correcto; pruebas de contrato incluyen rechazo de JWT
  de usuario, cross-tenant, cursor alterado, tombstone, duplicado y stale.
- BL: 145/145 pruebas del candidato, build, validación Prisma y las 12
  pruebas específicas de projection/auth sobre schema anterior. Estas cubren
  mapping ausente, cuarentena, duplicado, stale, tombstone, flag apagado y
  rechazo de credencial/tenant incorrectos; no escriben `Charge`, `Payment`,
  `Student` ni `Course`.
- Rollback de aplicación: Académico de `origin/main` pasó 11/11 pruebas sobre
  PG15 actualizado; BL de `origin/main` pasó 129/129 y build sobre PG18
  actualizado tras regenerar Prisma.

## Compatibilidad y orden obligatorio

El candidato Académico **no** opera sobre el schema previo aun con flags
apagados: el cliente Prisma candidato conoce las nuevas columnas de
`CourseEnrollment` y una mutación devuelve 500 si la migración no está
aplicada. Esto valida que el orden de release debe ser:

1. backup/restauración verificada y ledger de producción reconciliado;
2. aplicar las migraciones de cada servicio en su ventana aprobada;
3. desplegar el binario candidato con ambos flags apagados;
4. smoke test sin tráfico S2S; luego mapping sintético/no productivo,
   snapshot y reconciliación controlada;
5. una autorización separada por tenant para activar flags.

Un rollback de aplicación a `origin/main` es compatible con el schema aditivo
validado, pero no revierte datos nuevos. La recuperación de datos exige backup
restaurable y compensación lógica; nunca `reset`, borrado masivo ni downgrade
automático de migraciones.

## Gates pendientes

1. Evidencia autorizada del ledger y catálogo de la base productiva de
   Académico; sin ella no se puede afirmar que el escenario B represente la
   divergencia real.
2. Ensayo end-to-end en vivo entre ambas aplicaciones aisladas: publisher HTTP
   Académico, consumer HTTP BL, snapshot interrumpido/reanudado y
   reconciliación. Las pruebas actuales cubren sus componentes y contratos,
   pero no sustituyen ese ensayo conjunto.
3. Evidencia de backup y restauración de BL, con RPO/RTO aprobados.
4. Revisión de operación, secretos S2S y autorización formal antes de todo
   mapping o flag real.

ADR-0022 continúa **Propuesto**. La Fase 1A ya resuelve mapping único,
auditable, idempotente y `dryRun` para `SUPER_ADMIN`; onboarding añade
segregación de funciones, aprobación independiente, trazabilidad de
transiciones y recuperación de fallos. No se implementan aquí tablas, estados
ni contratos de onboarding.
