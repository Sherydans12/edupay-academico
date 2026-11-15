# ADR-0024: admisión académica e identificador estable del alumno

Estado: **Aceptado** (2026-11-15). El usuario aprobó los puntos 1 a 6. La
aceptación fija reglas de diseño; no autoriza por sí misma migraciones
productivas, conciliaciones con datos reales, activar la proyección financiera
ni cambios en BL-002. Cada uno de esos pasos requiere su propia autorización.

Fecha: 2026-11-15

Relacionado: [ADR-0015](ADR-0015-edupay-source-of-truth-proposal.md),
[ADR-0016](ADR-0016-edupay-sync-strategy-proposal.md),
[ADR-0021](ADR-0021-ecosystem-domain-ownership-transition.md),
[ADR-0022](ADR-0022-academic-onboarding-governance-proposal.md),
[arquitectura del ecosistema](../architecture/edupay-ecosystem-architecture.md),
[avance anual](../proposals/academic-course-promotion-first-cut.md) y
[onboarding académico](../proposals/academic-onboarding-first-cut.md).

## Contexto

El colegio necesita incorporar alumnos de 1° básico y alumnos que llegan
directamente a otros niveles para el próximo año académico. Hoy conviven dos
orígenes de fichas:

| Hecho observado en código y documentos (2026-11-15)                                                                                                                                           | Fuente                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `Student` de Académico sólo tiene nombres, apellidos, correo opcional, estado, `source` y `externalReference`. No tiene RUN/RUT ni otro identificador de persona.                             | `packages/contracts/src/academic.ts` (`personFields`), `POST /api/v1/students`                         |
| El alta manual crea `source = MANUAL` sin deduplicar ni usar idempotencia. La inscripción a curso es otro paso (`POST /api/v1/course-enrollments`).                                           | `AcademicService.createStudent`, `enrollStudentInCourse`                                               |
| Las fichas del sync v1 llegan como `source = EDUPAY` con `externalReference = Student.integrationId` de BL. RUT, nombre y correo no son identidad de sincronización; el RUT no se sincroniza. | ADR-0015 (filas `Student.integrationId` y `Student.rut`), ADR-0016                                     |
| El `Student` de BL exige RUT único por tenant, apoderado y curso. Es la ficha que hoy origina cobros.                                                                                         | BL-002 `backend/prisma/schema.prisma` (`@@unique([tenantId, rut])`)                                    |
| El avance anual sólo mueve matrículas `MANUAL`; las del sync quedan como `SOURCE_MANAGED`.                                                                                                    | Propuesta de avance anual; `courseEnrollmentPromotionDecisionSchema`                                   |
| La proyección Académico → Financiero está implementada pero apagada; por diseño excluye RUT y apoderados.                                                                                     | [contrato de proyección](../integration/academic-financial-projection.md), arquitectura del ecosistema |
| El documento del ecosistema prohíbe inferir identidad por nombre, RUT o email y pide para la importación vista previa, errores por fila, resultados parciales y claves de reintento.          | Arquitectura del ecosistema: «Relaciones canónicas», «Onboarding multi-colegio propuesto»              |

No se ha medido cuántas matrículas reales son `MANUAL` y cuántas `EDUPAY`. Esa
lectura requiere autorización explícita sobre producción.

## Decisión

### 1. La admisión ocurre en Académico (decidido el 2026-11-15)

La creación de nuevas fichas académicas y su matrícula inicial se hace en
Académico, conforme a ADR-0021. BL-002 no crea autoridad académica nueva para
alumnos admitidos después de la entrada en vigor de esta decisión. La cuenta
Identity sigue siendo opcional y posterior (ADR-0003/ADR-0009): admitir no crea
cuentas ni almacena credenciales.

### 2. Identificador estable del alumno (opción A, decidida el 2026-11-15)

| Opción                                                                                                                                                                  | Consecuencias                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Identificador nacional declarado** (RUN chileno, o el identificador provisorio que entregue la autoridad educativa a quien no tiene RUN), único por tenant y tipo. | Permite deduplicar altas e importaciones y, más adelante, conciliar con la ficha financiera de BL que ya usa RUT. Es dato personal nuevo en Académico: requiere normalización, validación, visibilidad restringida, redacción en logs y quedar fuera de la proyección financiera y de eventos. Cambia esquema y contrato. |
| **B. Código interno del colegio** (p. ej. número de matrícula) único por tenant.                                                                                        | Evita guardar RUN, pero sólo deduplica si el colegio asigna y mantiene ese código antes de la admisión; no concilia con BL ni detecta la misma persona en dos códigos.                                                                                                                                                    |
| **C. Sólo ID opaco de Académico** y clave por archivo de importación.                                                                                                   | No cambia esquema, pero no detecta duplicados reales: repetir una persona en otro archivo crea otra ficha. Incumple la barra de deduplicación de la propuesta académica.                                                                                                                                                  |

**Decisión: A.** El identificador estable del alumno en Académico es su RUN.
Las reglas siguientes son candidatas para la implementación y se revisan junto
con el diseño de esquema y contrato:

- Campos candidatos `nationalIdType` y `nationalId`, este último normalizado sin
  puntos ni guion y con dígito verificador validado para RUN. La unicidad es
  `(tenantId, nationalIdType, nationalId)` sólo cuando hay valor.
- Obligatorio para altas nuevas e importación; opcional en fichas existentes
  hasta su conciliación. Sin identificador, una fila de importación se reporta
  como error y no crea ficha.
- Lectura y escritura sólo con `academic-structure:administer`; no aparece en
  vistas docentes ni de alumno, ni en DIE, notificaciones, proyección
  financiera, eventos o logs.
- Nunca se usa nombre, curso o correo para inferir que dos filas son la misma
  persona.

**Alumnos sin RUN: opción i, decidida el 2026-11-15.** Opciones evaluadas:

- **i.** Aceptar además el identificador provisorio escolar (IPE) que asigna el
  Ministerio de Educación, como otro `nationalIdType`, con las mismas reglas de
  unicidad y privacidad. Al obtener el RUN, el cambio de tipo es una edición
  auditada de la misma ficha, no una ficha nueva.
- **ii.** Exigir RUN siempre: quien no lo tenga no se puede admitir digitalmente
  hasta obtenerlo.
- **iii.** Permitir el alta sin identificador, marcada como pendiente y excluida
  de la importación. No se deduplica hasta registrar el identificador.

Se acepta **i**: los tipos admitidos son RUN e IPE. Un alumno sin ninguno de
los dos no se admite hasta contar con uno. El formato y la validación del IPE
se definen con el diseño de esquema a partir de la fuente oficial; no se
inventan reglas en la UI. En ningún caso se usa nombre, curso o correo como
sustituto.

Esta decisión enmienda ADR-0015: el RUT pasa a ser un atributo de la ficha
académica para admisión y conciliación controlada. Sigue sin ser una clave del
sync v1, que continúa identificando fichas `EDUPAY` por `integrationId`.

### 3. Duplicados y conflictos (aceptado)

Válido tanto para el alta manual como para la importación:

- **Mismo identificador ya existente en el tenant:** no se crea otra ficha. Se
  informa la ficha existente y se ofrece matricularla en el curso pedido. Es
  una acción explícita, no automática.
- **Mismo identificador repetido dentro del archivo:** todas esas filas quedan en
  conflicto y ninguna se aplica.
- **Ficha `EDUPAY` sin identificador que podría ser la misma persona:** no se
  vincula por nombre. Queda como conflicto pendiente hasta la conciliación del
  punto 5.
- **Reintento del mismo alta o archivo:** idempotente mediante
  `Idempotency-Key` y `CommandReceipt` (ADR-0011), devolviendo el mismo
  resultado sin duplicar fichas ni matrículas.

### 4. Alcance del primer corte de admisión (aceptado)

Primero un **alta manual mejorada** que, en una sola operación
idempotente, cree la ficha con identificador y su matrícula `MANUAL` en un curso
de un año `DRAFT` o `ACTIVE`. Sirve para 1° básico y para cualquier otro nivel,
porque el curso lo elige el administrador y no se infiere grado por nombre.

La **importación de archivo** es un segundo corte, después de aceptar los puntos
2 y 3. Su formato (CSV/XLSX), columnas, límite de filas y retención del archivo
se definen en un ADR o propuesta propia, con vista previa de filas válidas,
advertencias, errores y duplicados antes de aplicar.

### 5. Convivencia con fichas del sync v1 (aceptado)

Por etapas y sin migración automática:

1. Mientras el sync v1 siga vigente, las fichas `EDUPAY` no se editan ni avanzan
   desde Académico (estado actual).
2. Para deduplicar admisiones contra el padrón existente, las fichas `EDUPAY`
   necesitan su identificador. La opción candidata es una conciliación
   controlada desde BL por `integrationId`, con ensayo (`dryRun`), reporte de
   conflictos y autorización específica. No se hace por nombre.
3. El retiro de la autoridad del sync v1 (pasar fichas `EDUPAY` a autoridad
   académica) es un cambio de ownership aparte, con ensayo y plan de reversa,
   requisito para que el avance anual pueda mover esos rosters.

### 6. Efecto en Pagos (aceptado)

Mientras la proyección Académico → Financiero siga apagada, un alumno admitido
en Académico **no existe para BL**. Para cobrarle, hoy habría que registrarlo
también en BL, con su RUT y apoderado, lo que es una doble digitación con
riesgo de divergencia. Opciones:

- **a.** Aceptar transitoriamente la doble digitación, documentada y con un
  reporte de diferencias.
- **b.** Activar primero la proyección (alumno, año, curso, matrícula) y que BL
  complete en su dominio el responsable financiero y su RUT.

**Decisión: b** como objetivo, y **a** sólo como transición acotada si el
calendario de matrícula no permite esperar. Ambas requieren revisar el contrato
de proyección y autorización de BL-002; esta ADR no activa nada.

## Consecuencias

- La admisión, la deduplicación y el avance anual quedan en un mismo dominio.
- La opción 2-A agrega un dato personal sensible a Académico. Antes de
  implementarla hay que actualizar seguridad, auditoría, pruebas de aislamiento
  entre tenants y la documentación de ADR-0015.
- Hasta ejecutar los pasos de los puntos 5 y 6, conviven fichas `MANUAL` y `EDUPAY`, y Pagos no
  ve a los admitidos en Académico.
- Este ADR no modifica esquema, contratos, flags, sincronización,
  producción ni BL-002.

## Siguientes pasos

1. Corte de alta manual (punto 4): integrado en `main` (PR #32, merge
   `bac7b3b`; `main` `3a06df4` incluye además PR #31). Imágenes publicadas;
   migración y redeploy productivos pendientes. Ver «Implementación del primer
   corte» más abajo.
2. Diseño de importación de archivo (formato, columnas, límites y retención).
3. Diseño de la conciliación de identificadores de fichas `EDUPAY` (punto 5).
4. Revisión del contrato de proyección financiera con BL-002 (punto 6).

## Autorizaciones operativas pendientes

- Lectura en producción de la distribución `MANUAL`/`EDUPAY` de matrículas, sin
  extraer datos personales.
- Toda migración, conciliación o activación sobre datos reales.

## Implementación del primer corte (alta manual)

Estado al 2026-11-15: integrado en `main` (`3a06df4`). Imágenes publicadas
desde ese SHA: API `sha256:c988b07a…`, runner de migración `sha256:1712e056…` y
FRONT `sha256:bea5d1bb…`. La migración no se ha aplicado en producción y el API
y FRONT con este corte no están redeployados; el procedimiento, el gate de
destino observado y el ensayo están en
[ACADEMICO-MIGRATION-RUNNER.md](../operations/ACADEMICO-MIGRATION-RUNNER.md).
Estar en `main` no autoriza la migración productiva.

- **Esquema:** migración aditiva `20261115120000_student_national_identifier`
  con `national_id_type` y `national_id` en `students`, ambos nulos o ambos
  presentes, tipo `RUN` o `IPE`, y unicidad por tenant y tipo. No lee, copia ni
  rellena datos existentes.
- **Contrato:** `packages/contracts/src/student-admission.ts`. Normaliza el
  identificador y valida el dígito verificador del RUN. Para el IPE sólo exige
  letras y números, hasta 20 caracteres, mientras no se confirme su formato
  oficial.
- **API:** `POST /api/v1/student-admissions` crea ficha `MANUAL` y matrícula
  `MANUAL` en una transacción, exige `Idempotency-Key`, la capacidad
  `academic-structure:administer` y el estado vigente de la sesión en Identity.
  Responde `409 STUDENT_NATIONAL_ID_EXISTS` si el identificador ya existe en el
  tenant. `POST /api/v1/student-admissions/lookup` devuelve la ficha dueña del
  identificador; el valor viaja en el cuerpo, nunca en la URL.
- **Privacidad:** el identificador no se devuelve en la respuesta de admisión,
  ni en listados de alumnos, recibos de idempotencia, auditoría, rosters
  docentes ni contexto del alumno.
- **Web:** «Incorporar alumno» en Personas usa el formulario de admisión: tipo e
  identificador, nombres, apellidos, correo opcional, año abierto y curso. Ante
  un duplicado muestra la ficha existente y ofrece matricularla de forma
  explícita.

Límites conocidos de este corte:

- `POST /api/v1/students` sigue disponible sin identificador por
  compatibilidad; la interfaz ya no lo usa para alumnos. Retirarlo o exigir el
  identificador ahí es un cambio de contrato aparte.
- Aún no se puede editar el identificador (por ejemplo, pasar de IPE a RUN) ni
  verlo en el listado de administración.
- Las fichas `EDUPAY` y las `MANUAL` anteriores no tienen identificador y no se
  detectan como duplicadas hasta la conciliación del punto 5.
