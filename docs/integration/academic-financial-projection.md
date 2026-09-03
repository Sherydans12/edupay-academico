# Contrato Académico → Financial Projection

Estado: **diseñado para Fase 1B; no implementado ni conectado a BL**.

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

## Snapshot propuesto

El productor expondrá un namespace versionado y read-only, por ejemplo
`/api/v1/integrations/financial-projection`. Los nombres definitivos de rutas
deben aparecer en OpenAPI antes de implementarse.

1. `GET /snapshot` captura una frontera común, devuelve `snapshotToken`,
   `runId`, `schemaVersion`, `canonicalTenantId` y entidades requeridas.
2. `GET /enrollments` drena páginas de la proyección mediante cursor opaco.
   La respuesta contiene `page`, `watermark` terminal y tombstones explícitos.
3. `GET /snapshot/complete` sólo confirma el snapshot si todos sus watermarks
   pertenecen a la misma frontera.

Los cursores/watermarks son opacos, tenant-bound, versión-bound y no se
persisten como `page.nextCursor`. Se adopta la semántica de fronteras, replay,
orden determinista y reconciliación del contrato v2 de BL, no su ownership.

## Eventos propuestos

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
