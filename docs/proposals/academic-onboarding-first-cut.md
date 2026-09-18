# Propuesta implementable: primer corte del onboarding académico

**Estado:** aprobado para implementar este corte; no es un ADR aceptado.

**Alcance:** Académico, únicamente estructura base del colegio: año académico, cursos y estado de preparación. La vinculación de tenants en BL queda fuera de este diseño y fuera de sus prerrequisitos.

## Resumen de la propuesta

El primer corte debe reutilizar la administración académica que ya existe y limitarse a hacer explícito el recorrido:

`año académico → cursos → validación de estructura base`.

No se propone crear `OnboardingRun`, otra entidad de progreso, una migración, un flag ni un flujo de aprobación en este corte. El estado se calcula en tiempo real a partir de los registros existentes y se muestra dentro de `/administracion`.

La preparación de este corte significa solamente «existe exactamente un año activo y al menos un curso activo dentro de él». No significa que el colegio esté listo para operar todo el ciclo académico: asignaturas, profesores, alumnos, matrículas y asignaciones son etapas posteriores.

## Decisiones aprobadas para implementación — 2026-09-15

- El alcance es únicamente `año académico → cursos → validación de estructura base`.
- El estado es derivado, sin `OnboardingRun`, persistencia adicional ni migraciones.
- Se implementa `GET /api/v1/academic-preparation/status` con la autorización tenant-scoped existente.
- `READY` significa sólo un año activo y al menos un curso activo asociado a ese año.
- Más de un año activo produce `BLOCKED` para este indicador; no se cambian las reglas de escritura ni se cierran años automáticamente.
- No hay dependencia de BL, mappings ni sincronización, ni acceso implícito de `SYSTEM_ADMIN`.
- No se reintentan automáticamente mutaciones inciertas; antes de repetir se consulta el estado actual.
- No se implementa el resto de ADR-0022 en este corte.
- Con cero años, `ACADEMIC_YEAR` es `ACTION_REQUIRED` con la acción «Crear año académico».
- Si `selectedActiveYearId` es `null`, `COURSES` es `ACTION_REQUIRED`, `activeInSelectedYear` y `draftInSelectedYear` son `null`, y ningún curso draft se presenta como perteneciente al año seleccionado.

## Evidencia reutilizable

| Área               | Existente                                                                                                                                              | Consecuencia para el corte                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| API académica      | `AcademicAdminController` ya expone `GET/POST/PATCH /api/v1/academic-years` y `GET/POST/PATCH /api/v1/courses`.                                        | No se requiere una nueva entidad para años o cursos.                          |
| Reglas de dominio  | `AcademicService` ya valida fechas, transiciones, año mutable y que un curso activo pertenezca a un año activo.                                        | El flujo debe guiar las transiciones existentes, no duplicarlas en la UI.     |
| Pantallas          | `/administracion` muestra resumen; `/administracion/estructura` contiene las pestañas «Años y Cursos», asignaturas y roster.                           | El panel de preparación puede incorporarse al resumen y a la primera pestaña. |
| Contexto de tenant | Académico obtiene el tenant confiable del JWT de Identity y del `membership_id`; los selectores enviados por el cliente no son fuente de autorización. | Todas las lecturas y mutaciones siguen siendo tenant-scoped.                  |
| Roles              | `academic-structure:administer` está concedido a `TENANT_ADMIN`; `SYSTEM_ADMIN` sin contexto aprobado falla cerrado.                                   | No se agrega acceso implícito de plataforma.                                  |
| Salud existente    | `/api/v1/health/ready` verifica base de datos, storage y scanner.                                                                                      | Es readiness operativo del servicio, no preparación académica del colegio.    |
| Integración BL     | `GET /api/v1/sync/status` informa sincronización/configuración heredada.                                                                               | Se conserva como información separada; no bloquea este corte.                 |

Referencias revisadas: [AGENTS.md](../../AGENTS.md), [ADR-0021](../decisions/ADR-0021-ecosystem-domain-ownership-transition.md), [ADR-0022](../decisions/ADR-0022-academic-onboarding-governance-proposal.md), [RUNBOOK](../operations/RUNBOOK.md), [PRODUCTION](../operations/PRODUCTION.md), [AcademicService](../../apps/api/src/academic/academic.service.ts), [AcademicAdminScreen](../../apps/web/src/features/academic-admin.tsx) y [cliente académico](../../apps/web/src/api/academic-client.ts).

## 1. Flujo de usuario y capacidades reutilizables

### Flujo propuesto

1. El administrador inicia sesión en Identity y selecciona la membresía del colegio mediante el contexto actual existente. La administración se habilita sólo si esa membresía tiene `TENANT_ADMIN`.
2. En `/administracion`, el resumen muestra una tarjeta «Preparación académica base» con estado, conteos y siguiente acción. El botón «Revalidar» vuelve a consultar el estado; no crea una ejecución persistente.
3. En «Años y Cursos», el administrador crea un año en `DRAFT`, con etiqueta y fechas válidas.
4. Mientras el año está en `DRAFT`, crea cursos también en `DRAFT`. La UI debe usar `DRAFT` como valor inicial y explicar que un curso no puede activarse antes que su año.
5. El administrador activa el año mediante el `PATCH` existente. Luego activa cada curso mediante el `PATCH` existente.
6. La tarjeta se revalida y pasa a `READY` cuando hay un único año activo y al menos un curso activo asociado. Si falta algo, comunica la acción concreta sin presentar el colegio como completamente configurado.

El orden visual recomendado es un stepper de tres pasos —«Año», «Cursos», «Validación»—, pero no se deben bloquear ni eliminar las pestañas existentes de asignaturas/personas. Esas capacidades ya disponibles pueden seguir utilizándose de forma independiente, aunque pertenecen a cortes posteriores.

### Capacidades que se reutilizan

- Formularios y tablas actuales de `AcademicAdminScreen`.
- Paginación, búsqueda y filtros existentes para años y cursos.
- Transiciones de estado del servicio, incluyendo `DRAFT → ACTIVE` y las restricciones de años cerrados/archivados.
- Auditoría correlacionada existente con `tenantId`, `membershipId`, identidad y `requestId`.
- Renovación de sesión del cliente. Después de una renovación, el cliente no reintenta automáticamente un `POST` o `PATCH`.
- Contexto de membresía de Identity, incluyendo `GET /auth/memberships` y `POST /auth/sessions/current-context`.

No se duplica la administración de tenants de Identity ni la vinculación de tenants de BL. Tampoco se mueve la lógica académica a Identity.

## 2. Responsabilidades y límites de autorización

### `TENANT_ADMIN`

Con una membresía activa en el tenant actual puede:

- consultar el estado de preparación y el catálogo de años/cursos de ese tenant;
- crear y editar años mientras sean mutables;
- cambiar el estado de año y curso usando las transiciones permitidas;
- ver el resultado de la validación base y corregir los datos faltantes.

La autorización debe continuar usando `RequireCapabilities(academic-structure:administer)` y el tenant derivado del contexto confiable. El `tenantId` del body, query, path o header sólo puede ser un selector consistente; nunca puede ampliar el alcance.

### Plataforma y `SYSTEM_ADMIN`

Un `SYSTEM_ADMIN` sin una membresía `TENANT_ADMIN` o sin contexto de soporte aprobado no puede consultar ni modificar un colegio. El comportamiento actual de `DisabledSupportContextPolicy` es el correcto para este corte: denegar.

El soporte de plataforma sólo podría operar sobre un tenant concreto si existe posteriormente un contrato de elevación explícita, con actor, motivo, tenant objetivo, expiración y auditoría. Ese contrato requeriría una decisión y cambios revisados en Identity y Académico. No se propone un endpoint alternativo ni impersonación en este documento.

La vinculación BL, aun cuando exista un operador autorizado, sigue siendo un proceso separado. No participa en la autorización ni en la definición de `READY` de la estructura académica base.

## 3. Datos, endpoints y faltantes concretos

### Endpoints existentes a conservar

| Uso                               | Endpoint                                      | Permiso/contexto                                  |
| --------------------------------- | --------------------------------------------- | ------------------------------------------------- |
| Contexto local                    | `GET /api/v1/tenant`                          | `academic-structure:administer`; tenant confiable |
| Listar años                       | `GET /api/v1/academic-years`                  | `academic-structure:administer`                   |
| Crear año                         | `POST /api/v1/academic-years`                 | `academic-structure:administer`                   |
| Editar/activar año                | `PATCH /api/v1/academic-years/:id`            | `academic-structure:administer`                   |
| Listar cursos                     | `GET /api/v1/courses?academicYearId=&status=` | `academic-structure:administer`                   |
| Crear curso                       | `POST /api/v1/courses`                        | `academic-structure:administer`                   |
| Editar/activar curso              | `PATCH /api/v1/courses/:id`                   | `academic-structure:administer`                   |
| Estado de integración informativo | `GET /api/v1/sync/status`                     | separado; no es preparación académica             |

Identity continúa siendo la fuente de autenticación, membresías, roles y cambio de contexto. Los registros académicos permanecen en la base de Académico y se identifican por el mismo tenant lógico opaco, sin FK entre servicios.

### Endpoint nuevo mínimo implementado

Agregar un endpoint de sólo lectura, sin persistencia adicional:

`GET /api/v1/academic-preparation/status`

Usa la misma capacidad `academic-structure:administer`, el mismo `TrustedTenantContext`, el mismo patrón de `X-Request-Id` y `@RequireCurrentIdentityStatus()` para que una membresía revocada falle cerrado en tiempo real. Un contrato implementado es:

```json
{
  "scope": "ACADEMIC_BASE",
  "status": "ACTION_REQUIRED",
  "ready": false,
  "evaluatedAt": "2026-09-15T12:00:00.000Z",
  "academicYears": {
    "total": 1,
    "active": 0,
    "draft": 1,
    "selectedActiveYearId": null
  },
  "courses": {
    "activeInSelectedYear": null,
    "draftInSelectedYear": null
  },
  "checks": [
    {
      "code": "ACADEMIC_YEAR",
      "status": "ACTION_REQUIRED",
      "action": "Activar un año académico",
      "message": "Activa un año académico."
    },
    {
      "code": "COURSES",
      "status": "ACTION_REQUIRED",
      "action": "Activar un curso",
      "message": "Activa al menos un curso dentro del año activo."
    }
  ]
}
```

`READY`, `ACTION_REQUIRED` y `BLOCKED` serían valores del response, no estados persistidos ni nuevos estados de `AcademicYear`/`Course`.

Reglas recomendadas:

- `ACADEMIC_YEAR` es `READY` con exactamente un `ACTIVE`; `ACTION_REQUIRED` con cero activos y al menos un año existente; `BLOCKED` con más de uno activo.
- `ACADEMIC_YEAR` es `ACTION_REQUIRED` con cero años, con acción «Crear año académico»; con años sólo `DRAFT`, la acción es «Activar un año académico».
- Si no hay exactamente un año activo, `selectedActiveYearId` es `null`, `COURSES` es `ACTION_REQUIRED` y ambos conteos `*InSelectedYear` son `null`. No se cuentan ni se muestran como seleccionados cursos de años draft, cerrados o archivados.
- Con exactamente un año activo, `COURSES` es `READY` con al menos un curso `ACTIVE` en ese año; es `ACTION_REQUIRED` si no hay cursos activos, aunque existan cursos `DRAFT`.
- El estado general es `READY` sólo si ambos checks son `READY`; es `BLOCKED` si algún check es `BLOCKED`; en otro caso es `ACTION_REQUIRED`.
- No se evalúan asignaturas, personas, matrículas, asignaciones, sincronización BL, credenciales ni estado operativo del servicio.

### Faltantes que sí deben resolverse para implementar este corte

| Prioridad | Faltante                                                        | Tratamiento propuesto                                                                                                                                                                                                                                                                                                                                                  |
| --------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0        | Contrato Zod, handler, cliente web y tarjeta UI para el status. | Implementado sólo como lectura derivada, con pruebas de aislamiento tenant.                                                                                                                                                                                                                                                                                            |
| P0        | Guía de secuencia en el formulario de cursos.                   | Implementado con default `DRAFT`, mensajes de transición y CTA para activar el año antes del curso.                                                                                                                                                                                                                                                                    |
| P1        | Política para múltiples años `ACTIVE`.                          | No cambiar escrituras en este corte; reportar `BLOCKED` y pedir decisión explícita.                                                                                                                                                                                                                                                                                    |
| P1        | Idempotencia uniforme de creación de años/cursos.               | No reintentar automáticamente mutaciones inciertas. Antes de habilitar reintento, revisar si el `CommandReceipt` existente puede reutilizarse fuera de Learning y acordar su contrato.                                                                                                                                                                                 |
| P1        | Concurrencia de edición.                                        | Hoy no hay versión/ETag; documentar último guardado gana y refrescar tras error. Si se requiere bloqueo optimista, aprobarlo aparte.                                                                                                                                                                                                                                   |
| P1        | Garantía de unicidad de etiqueta de curso.                      | Verificada en PostgreSQL 15 aislado aplicando las 10 migraciones: `courses_manual_label_key` es único sólo para `(tenant_id, academic_year_id, label)` cuando `source = MANUAL`. Por eso la carrera MANUAL/MANUAL del mismo tenant/año entrega `409`; no se promete unicidad global entre MANUAL y EDUPAY ni entre tenants. No se creó ni ejecutó una migración nueva. |
| P2        | Historial consultable de validaciones.                          | Fuera del corte: el status es actual y la auditoría existente registra cambios como logs correlacionados, no una ejecución de onboarding durable.                                                                                                                                                                                                                      |

La respuesta no debe reutilizar `/health/ready`, porque mezclaría una condición del proceso con la preparación del colegio.

## 4. Validaciones, duplicados, reintentos e historia

### Validaciones

Se conservan las del dominio actual: etiquetas no vacías y acotadas, fechas de inicio/fin coherentes, unicidad de año por tenant, año mutable para crear cursos, curso activo sólo bajo año activo y estados archivados de sólo lectura. Un curso o año de otro tenant debe ser indistinguible de no encontrado para el consumidor.

El status consulta sólo filas del tenant confiable. Una etiqueta igual en dos tenants sigue siendo válida. Un año `CLOSED` o `ARCHIVED` no se reactiva; los cursos históricos tampoco se reescriben para satisfacer la preparación actual.

### Duplicados y reintentos

Las carreras concurrentes de creación manual deben continuar devolviendo `409` por la restricción parcial de unicidad existente, con un código de error estable para que la UI ofrezca «recargar y revisar». La diferencia entre cursos `MANUAL` y cursos sincronizados debe quedar explícita; no se debe inferir una unicidad global de etiqueta. Esta semántica fue comprobada en PostgreSQL 15 desechable con todas las migraciones: duplicar MANUAL en el mismo tenant/año falla, mientras que el mismo label en otro tenant y el mismo label EDUPAY en el mismo tenant/año coexisten. El cliente no debe repetir un `POST` o `PATCH` después de un `401` renovado ni después de una respuesta de red incierta: primero debe volver a consultar la lista y el status.

Para una fase posterior de reintentos seguros, se debe evaluar la reutilización de `CommandReceipt`, que ya contiene tenant, actor, comando y clave. No se agrega `OnboardingRun` ni otra tabla sólo para deduplicar comandos. La revisión debe confirmar que el recibo puede cubrir la semántica y retención de estas mutaciones; la implementación actual no demuestra deduplicación completa de años/cursos.

### Historia y auditoría

No hay borrado físico como parte del flujo: los estados `ARCHIVED`/`INACTIVE`, las asociaciones históricas y `updatedAt` se conservan según el modelo existente. Las mutaciones continúan emitiendo auditoría con actor, membresía, tenant, recurso y request ID.

El estado de preparación no tiene historia propia en este corte: cada lectura se recalcula con los datos actuales. Por tanto, no debe presentarse como una aprobación, ni como evidencia durable de que el colegio estuvo listo en una fecha anterior. Si el producto exige revisión formal, rechazo, aprobación por un tercero o trazabilidad de cada corrida, habrá que retomar ADR-0022 y aprobar un diseño específico antes de introducir persistencia.

## 5. Criterios de aceptación y pruebas

### Criterios de aceptación funcionales

- Un `TENANT_ADMIN` con membresía activa ve la tarjeta de preparación del tenant seleccionado en Identity y puede abrir años/cursos.
- Crear un año válido lo deja en `DRAFT`; las fechas inválidas reciben `400` y no crean registro.
- Crear un curso `DRAFT` bajo un año `DRAFT` funciona; intentar activarlo antes devuelve la validación de dominio existente.
- Activar el año y luego un curso hace que el status pase a `READY` y muestre los conteos correctos.
- Un tenant con cero años, sólo años draft, sólo cursos draft o cursos activos en otro año recibe una acción clara; no se muestra `READY`.
- Dos años activos producen `BLOCKED` según la política propuesta y solicitan intervención; el endpoint no elige silenciosamente uno.
- Repetir una creación con la misma etiqueta no genera dos registros y entrega `409` de forma consistente.
- Un `SYSTEM_ADMIN` sin contexto de soporte aprobado, un `TEACHER` y un `STUDENT` no pueden ejecutar la administración de estructura.
- Cambiar el `tenantId` en body, query, path o header no permite leer ni mutar otro tenant.
- Archivar/cerrar conserva los registros y no altera retrospectivamente el status histórico; el status actual vuelve a calcularse con las reglas vigentes.
- Ninguna prueba, endpoint o criterio del corte llama a BL, exige mapping de tenant BL o cambia flags.

### Pruebas de API y web

- Unitarias para la función pura de evaluación: cero/uno/múltiples años activos, cursos draft/active y curso activo en año distinto.
- E2E API para autorización, aislamiento cross-tenant, fechas, transiciones, duplicados y request IDs; extender la cobertura ya existente en `academic-domain.e2e-spec.ts`.
- E2E/web para carga, error, `403`, estado vacío, revalidación y actualización de la tarjeta después de crear/activar.
- Prueba de renovación de sesión que confirme que un `POST/PATCH` no se duplica automáticamente.
- Regresión de las pestañas actuales de asignaturas, personas, roster y asignaciones; no deben cambiar sus permisos ni sus reglas.
- Verificación estática de que la implementación no agrega migraciones, flags, llamadas BL ni una entidad `OnboardingRun`.

## 6. Decisiones futuras fuera de este corte

1. Si se requiere una regla de escritura que impida crear un segundo año `ACTIVE`.
2. Si las mutaciones de años/cursos necesitan idempotencia de servidor para una fase posterior.
3. Si se requiere aprobación de plataforma, historial durable o evidencia de validación; en ese caso se debe retomar ADR-0022 y el contrato de elevación de soporte.

## Límites de entrega

Esta propuesta no modifica ADRs, esquema, migraciones, flags, producción, BL ni Identity. La implementación posterior debe partir de este diseño aprobado, en una rama propia, y mantener separadas las responsabilidades de Identity, Académico y BL definidas en ADR-0021.
