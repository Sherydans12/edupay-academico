# Contrato Académico → Financial Projection

Estado: **Fase 1A (mapeo explícito de tenant), 1B (contrato estricto) y 1C
(producer/outbox Académico y shadow BL) están implementadas en worktrees
aislados**. No hay activación de producción, migraciones ni backfills reales;
el producer está desactivado por defecto y BL no toma decisiones financieras
desde la sombra.

Este contrato invierte la dirección futura de sincronización: EduPay
Académico será el productor de la proyección mínima que EduPay Pagos/BL-002
necesita para operar finanzas. No modifica ni sustituye los feeds de
compatibilidad BL → Académico v1/v2.

## Modelo y minimización

El modelo físico existente de Académico se reutiliza sin crear un
`CourseOffering`: `Course` ya pertenece a un `AcademicYear`. La proyección
lleva sólo:

```text
canonicalTenantId
academicStudentId
academicYearId
academicCourseId
academicEnrollmentId
enrollmentStatus
effectiveFrom / effectiveTo cuando existan
entityVersion
eventId cuando aplique
```

No lleva credenciales, tokens, contraseñas, RUT, datos de Guardian, notas,
evaluaciones, entregas, hoja de vida, asignaturas ni información pedagógica.

## Snapshot implementado

El productor expondrá un namespace versionado y read-only, por ejemplo
`/api/v1/integrations/financial-projection`. Los nombres definitivos de rutas
deben aparecer en OpenAPI antes de implementarse.

1. `POST /snapshots` inicia una frontera común y devuelve `snapshotToken`,
   `snapshotId`, `schemaVersion`, `canonicalTenantId` y entidad requerida.
2. `GET /snapshots/{snapshotToken}/enrollments` drena páginas mediante cursor opaco.
   La respuesta contiene `page`, `watermark` terminal y tombstones explícitos.
3. `GET /snapshots/{snapshotToken}/complete` confirma el snapshot si se
   drenaron las páginas de la misma frontera.

Cada `POST` materializa las filas contractuales en
`financial_projection_snapshot_items` dentro de una transacción Prisma. Por
ello una página posterior no observa una matrícula creada, modificada o dada
de baja después del inicio. El orden es `CourseEnrollment.id ASC`; el cursor
lleva `{snapshotToken, ordinal}` con HMAC, no es offset contra tablas vivas.
El watermark persistido es la secuencia monotónica máxima del outbox al
capturar la frontera y sólo se revela al final. El token caduca y está ligado
al tenant del principal S2S, nunca a un selector del request.

## Eventos y outbox implementados

Un outbox académico durable publicará cambios después de la transacción de
dominio. Cada evento contendrá, como mínimo:

```json
{
  "schemaVersion": "1",
  "eventId": "uuid",
  "eventType": "academic.enrollment.changed",
  "occurredAt": "ISO-8601 instant",
  "canonicalTenantId": "uuid",
  "entityVersion": "opaque monotonically ordered version",
  "data": {
    "academicEnrollmentId": "uuid",
    "academicStudentId": "uuid",
    "academicYearId": "uuid",
    "academicCourseId": "uuid",
    "status": "ACTIVE"
  }
}
```

El consumer deduplica por productor/tenant/eventId, conserva la mayor versión
de entidad y repara eventos tardíos o fallidos mediante snapshot. Un tombstone
no elimina obligaciones ni pagos; sólo actualiza la proyección/eligibilidad
financiera bajo política de BL.

## Autorización y tenancy

El consumidor BL se autentica como workload server-to-server. El tenant no se
acepta como autorización desde query, body o navegador: el productor resuelve
el tenant del principal de servicio y de su mapeo explícito. La Fase 1A crea en
BL la relación auditada `tenant local BL ↔ canonicalTenantId`; la integración
futura sólo procesa mensajes cuya pareja esté configurada y activa.

No hay acceso directo a bases, FKs entre servicios ni selección libre del
tenant por clientes. Los logs excluyen PII, tokens y payloads completos.

## Pruebas requeridas para Fase 1B/1C

- schemas estrictos, compatibilidad de versión y OpenAPI;
- paginación, watermark terminal, snapshot incompleto, tombstone y replay;
- evento duplicado, fuera de orden y de otro tenant;
- mapping ausente/ambiguo, tenant cruzado y token de servicio inválido;
- confirmación de ausencia de campos prohibidos y de RUT/PII no aprobada;
- reconciliación de snapshot después de interrupción del consumer.

## Resolución implementada en Fase 1B

La fuente de contrato es `packages/contracts/src/academic-financial-projection.ts`: Zod 4 estricto, tipos inferidos y OpenAPI derivado mediante `ContractResponse`. Es la infraestructura de contratos existente; no se crearon DTOs duplicados ni modelos Prisma públicos.

| Campo contractual               | Modelo Prisma      | Campo/regla real                                                                            |
| ------------------------------- | ------------------ | ------------------------------------------------------------------------------------------- |
| `canonicalTenantId`             | `Tenant`           | `Tenant.id`, UUID canónico de Identity en contexto de integración.                          |
| `academicYearId`                | `AcademicYear`     | `AcademicYear.id`.                                                                          |
| `academicStudentId`             | `Student`          | `Student.id`; `identityUserId` se excluye y puede ser nulo.                                 |
| `academicCourseId`              | `Course`           | `Course.id`; su año es `Course.academicYearId`.                                             |
| `academicEnrollmentId`          | `CourseEnrollment` | `CourseEnrollment.id`.                                                                      |
| `enrollmentStatus`              | `CourseEnrollment` | `CourseEnrollment.status` (`ACTIVE`/`INACTIVE`).                                            |
| `updatedAt`                     | `CourseEnrollment` | `CourseEnrollment.updatedAt`, ISO 8601.                                                     |
| `effectiveFrom` / `effectiveTo` | lifecycle futuro   | No hay columnas actuales; 1C debe obtener fecha efectiva auditable sin inventar historia.   |
| `version` / `entityVersion`     | versión futura     | No hay columna monotónica actual; 1C debe producir versión durable separada de `updatedAt`. |

El contrato declara `POST /api/v1/integrations/financial-projection/snapshots`, `GET /api/v1/integrations/financial-projection/snapshots/{snapshotToken}/enrollments` y `GET /api/v1/integrations/financial-projection/snapshots/{snapshotToken}/complete`. En 1B los tres endpoints fallan cerrados para principals de usuario y no leen Prisma ni devuelven datos. Sus páginas limitan 1–100, asocian cursor/snapshot/watermark a tenant y sólo exponen watermark terminal.

Los eventos futuros concretos son `academic.financial-projection.enrollment.upserted.v1` y `academic.financial-projection.enrollment.tombstoned.v1`. El envelope incluye `eventId`, `eventType`, `schemaVersion`, tenant, aggregate, versión, fecha y `correlationId`; la schema exige coherencia con el payload. El consumidor futuro deduplica `(producer, canonicalTenantId, eventId)`, sólo aplica versión mayor y repara replay o reordenamiento mediante snapshot completo.

La proyección excluye password, hashes, tokens, sesiones, RUT, nombre, email, dirección, teléfono, apoderados, notas, evaluaciones, entregas, hoja de vida, datos clínicos y financieros. Profesores no aparecen. Una necesidad de nombre para UI/reportes de BL requiere una decisión futura de minimización, no se incorporó silenciosamente.

## Fase 1C-A implementada y no activada

`FinancialProjectionOutboxEvent` se inserta en la **misma transacción** que
la creación o baja de un `CourseEnrollment`. La versión durable es
`CourseEnrollment.financialProjectionVersion` (BIGINT); la baja incrementa la
versión y fija `financialProjectionEffectiveTo`, por lo que genera el
tombstone v1. Los cambios futuros de matrícula, incluido cambio de curso,
deben usar el mismo escritor antes de confirmar su transacción.

El worker `pnpm --filter @edupay/api financial-projection:publish` drena una
cantidad acotada, reclama el registro, entrega por HTTP S2S a BL y sólo marca
`PUBLISHED` después de 2xx. `PUBLISHING` vencido se recupera como `RETRY`; el
`eventId` estable permite entrega at-least-once. Eventos `FAILED` conservan
intentos y código seguro para operar/reintentar sin guardar secretos ni PII.

Las rutas son `@Public` sólo para omitir el JWT de usuario; exigen después el
guard dedicado. `ACADEMIC_FINANCIAL_PROJECTION_S2S_CREDENTIALS` es un arreglo
JSON de `{keyId, token, canonicalTenantId}`. El `keyId` y token se comparan en
tiempo constante, `X-EduPay-Service` debe ser `BL_SHADOW` y el tenant se toma
exclusivamente de la credencial. Varias filas permiten solapamiento para
rotación. JWTs de usuario, un `canonicalTenantId` en body/query y credenciales
no registradas son rechazados. La solución es reversible/transitoria hasta que
un ADR defina identidad workload emitida por Identity.

La migración `20260903110000_financial_projection_producer` fue **CREADA y
validada contra schema Prisma; NO EJECUTADA en datos reales**. Crea versión
durable, outbox y snapshots; no hace backfill de eventos ni toca entidades
financieras. El producer requiere explícitamente
`ACADEMIC_FINANCIAL_PROJECTION_ENABLED=true`; el publisher requiere además su
flag separado y URL/credencial de BL. El valor por defecto de ambos es
`false`.

No se implementaron pagos, obligaciones, reportes, login BL, feed v1/v2,
backfill real, `PromotionRun` ni rollover.
# HTTP integration gate (isolated only)

The cross-repository HTTP gate is `apps/api/test/financial-projection.integrated-http.e2e-spec.ts`. It starts the real BL Nest application on loopback, creates the real Academic Nest application, and uses synthetic tenants and PostgreSQL databases supplied by the runner. It must never receive a production URL.

From the Academic candidate, run:

```powershell
$env:TEST_ACADEMIC_DATABASE_URL='postgresql://gate:gate@127.0.0.1:55415/academic?schema=public'
$env:TEST_BL_DATABASE_URL='postgresql://gate:gate@127.0.0.1:55418/bl?schema=public'
$env:BL002_BACKEND_ROOT='C:\path\to\BL-002\backend'
corepack pnpm@10.19.0 --filter @edupay/api exec vitest run test/financial-projection.integrated-http.e2e-spec.ts --reporter=verbose
```

The gate is skipped when its three isolated-environment variables are absent; skipped is not a passing release result.

The harness also stops the real BL test process during a newly-created outbox
delivery, verifies the durable `RETRY` state, then starts BL again and drains
the same event. This exercises the production publisher retry path over HTTP;
it does not mock either side of the integration.

It also creates and deactivates one synthetic enrollment through Academic HTTP,
then deliberately posts the newer outbox event before the older one to BL's
real S2S consumer. The older event must return `STALE`; replaying it returns
`DUPLICATE` and cannot overwrite the newer shadow row.
