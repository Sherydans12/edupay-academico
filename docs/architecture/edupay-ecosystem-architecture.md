# Arquitectura del ecosistema EduPay

Estado: **decisión arquitectónica aceptada; Fase 1A implementada en worktree
aislado**. No autoriza ejecutar migraciones, backfills ni cambios de
producción.

Fecha de auditoría: 2026-09-03.

## Propósito y alcance

Este documento registra el estado comprobado de EduPay Identity, EduPay
Académico y EduPay Pagos/BL-002, la arquitectura objetivo y una transición sin
big bang. Es el documento transversal del ecosistema: cada servicio conserva
su propia documentación de implementación y sus propias decisiones locales.

La decisión no altera retrospectivamente los hechos ni los contratos de
compatibilidad de ADR-0015 y ADR-0016. Sustituye la **dirección futura de
ownership** de esos ADRs; sus requisitos de seguridad, paginación,
idempotencia, snapshots y reconciliación siguen siendo válidos.

### Evidencia revisada

| Servicio       | Estado revisado                                                                               | Evidencia principal                                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Identity       | checkout `feat/account-lifecycle-email-cors` en `8696588` (limpio)                            | `prisma/schema.prisma`, `docs/architecture/identity-architecture.md`, ADR-0001/0002/0006/0007/0010 y `src/internal-academic/`         |
| Académico      | `origin/main` en `6b5b46c`; el checkout principal estaba limpio, 26 commits detrás de ese ref | `apps/api/prisma/schema.prisma`, `apps/api/src/academic/`, `apps/api/src/sync/`, ADR-0015/0016                                        |
| Pagos / BL-002 | `main` en `502e646` con un bloque local grande sin commit; no hay cambios staged              | `backend/prisma/schema.prisma`, `backend/src/integrations/academico/`, módulos anuales locales y `docs/*ACADEMIC*`, `docs/*ROLLOVER*` |

La auditoría también revisó el worktree histórico de BL-002 en `abc3776`, que
contiene el contrato fuente v1, y los worktrees académicos de dominio y sync.
No se aplicó ninguna migración ni se escribió información de colegios.

## Estado actual comprobado

### Matriz de capacidades y fuentes reales

| Entidad/capacidad                     | Identity                                                 | Académico                                                              | BL-002 / Pagos                                                                          | Fuente real actual                                                                                                | Consumidores / observación                                                                                                            |
| ------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Cuenta de identidad                   | `IdentityUser`, identificadores, credenciales y sesiones | referencia opcional `identityUserId`                                   | `User` local con contraseña y JWT propios                                               | Duplicada por límite histórico: Identity para el nuevo ecosistema; BL mantiene login administrativo independiente | Académico valida JWT/JWKS de Identity. BL aún no consume Identity.                                                                    |
| Persona básica                        | no existe agregado `Person` ni perfil humano separado    | nombre/contacto de Student/Teacher                                     | nombre/RUT/contacto de Student y Guardian                                               | No hay fuente única de perfil de persona                                                                          | No crear cuentas Identity obligatorias para alumnos o apoderados sin acceso.                                                          |
| Tenant                                | `TenantRealm.id` UUID lógico canónico                    | `Tenant.id` independiente con el mismo identificador lógico            | `Tenant.id` string local, por ejemplo un slug, más `TenantCanonicalMapping`             | Identity + Académico están alineados por contrato; BL tiene implementación Fase 1A sin filas desplegadas          | La equivalencia UUID de Identity/Académico ↔ tenant string de BL es explícita, 1:1 y no está conectada aún a contratos operacionales. |
| Membership y roles de acceso          | `TenantMembership`, roles tenant/plataforma              | consume claims y decide permisos de recursos académicos                | `User`–`Role`–`Permission` locales                                                      | Identity para Académico; BL para su panel existente                                                               | `SYSTEM_ADMIN` de Identity no hereda acceso tenant; BL usa `SUPER_ADMIN` local.                                                       |
| Alumno                                | ningún modelo académico                                  | `Student`, con vínculo opcional a Identity y procedencia manual/EDUPAY | `Student` financiero/administrativo legado                                              | Híbrida: el sync v1 hace a BL fuente de filas `source=EDUPAY`; Académico también admite filas manuales            | No existe todavía un maestro académico único operativo.                                                                               |
| Profesor                              | identidad/membership opcional                            | `Teacher`, asignaciones a CourseSubject                                | no hay modelo                                                                           | Académico                                                                                                         | El docente puede existir sin cuenta; al vincularse, Identity sólo valida la cuenta exacta.                                            |
| Curso / oferta                        | no                                                       | `Course` dentro de `AcademicYear`                                      | `Course` legado; el bloque local agrega oferta anual                                    | Híbrida: BL es upstream de sync v1; Académico es dueño de cursos manuales                                         | Los `Course.id` enteros de BL no son identidad interoperable.                                                                         |
| Asignatura / docencia                 | no                                                       | `Subject`, `CourseSubject`, `CourseSubjectTeacher`                     | no                                                                                      | Académico                                                                                                         | No está incluida en los feeds BL v1/v2.                                                                                               |
| Año académico                         | no                                                       | `AcademicYear` con ciclo DRAFT/ACTIVE/CLOSED/ARCHIVED                  | bloque local no aplicado crea `AcademicYear` DRAFT/OPEN/CLOSED/ARCHIVED                 | Académico en código desplegable; BL también pretende crearlo localmente                                           | Es el solapamiento arquitectónico más importante del rollover.                                                                        |
| Matrícula                             | no                                                       | `CourseEnrollment` curso–alumno, con estado y procedencia              | bloque local no aplicado crea `Enrollment` anual, movimientos e historial               | Académico tiene la relación operativa actual; BL v2 pretende publicarla como fuente                               | El sync v1 sólo representa la matrícula vigente derivada de `Student.courseId`.                                                       |
| Promoción / repitencia                | no                                                       | no hay agregado ni flujo de rollover implementado                      | bloque local no aplicado crea `PromotionRun`, `PromotionItem`, compensación y auditoría | BL local únicamente                                                                                               | El algoritmo es reutilizable, pero su aggregate debe pasar a Académico.                                                               |
| Apoderado / responsable financiero    | futura membership `GUARDIAN`, sin modelo de dominio      | no hay modelo Guardian                                                 | `Guardian` y relación actual con Student                                                | BL                                                                                                                | No confundir relación de cobro con identidad o matrícula.                                                                             |
| Obligación, cuota, pago, conciliación | no                                                       | no                                                                     | `Charge`, `Payment`, `PaymentAllocation`, conceptos, reportes y Portal                  | BL                                                                                                                | Éste es el bounded context financiero que debe permanecer en BL.                                                                      |

### Hechos de implementación que condicionan la transición

1. Identity ya separa credenciales, sesiones, membresías y roles de los
   registros académicos. Sus únicas rutas internas para Académico son la
   comprobación de sesión y la resolución exacta de un `IdentityUser`; no es un
   directorio general ni una API de mutación académica.
2. Académico posee esquemas tenant-safe para años, cursos, alumnos, docentes,
   asignaturas, relaciones de curso y matrícula; las FKs compuestas permanecen
   dentro de su propia base. Tiene API administrativa CRUD y worker de sync.
3. El consumidor actual de Académico sólo entiende el feed **v1** de BL:
   Course, Student y relación vigente Student–Course. Su configuración escoge
   un `AcademicYear` local para el feed y conserva watermarks, snapshots,
   leases, evidencia de conflictos y reconciliación.
4. BL conserva autenticación, usuarios, roles y tenants propios. No valida
   JWT/JWKS de Identity y su tenant string no está mapeado al UUID canónico.
5. El bloque local no aplicado de BL agrega `AcademicYear`, `AcademicLevel`,
   `Enrollment`, `EnrollmentMovement`, promoción, importación, auditoría y
   outbox; además implementa el feed anual **v2**. Sus migraciones están
   documentadas como pendientes y no se ejecutaron contra datos reales.

## Revisión del rollover 2026 → 2027 de BL-002

El trabajo no debe descartarse. Su separación correcta es la siguiente:

| Parte revisada                                                                                                                                    | Clasificación                                 | Destino recomendado                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AcademicYear`, `AcademicLevel`, oferta anual Course, `Enrollment`, movimientos, decisión de promoción/repitencia e historial                     | dominio académico                             | Migrar/adaptar a Académico. BL no debe ser su dueño final.                                                                                                                                   |
| `PromotionRun`, ítems con excepciones, control de versión, idempotency key, transacción serializable y compensación sin borrado                   | algoritmo académico reutilizable              | Extraer reglas y pruebas hacia un aggregate de rollover de Académico; conservar el diseño como referencia mientras no haya datos reales.                                                     |
| `Charge.academicYearId` / `enrollmentId`, `PaymentAllocation`, filtros financieros anuales, snapshots de comunicaciones y conciliación interanual | dominio financiero con referencias académicas | Permanecer en BL, pero reemplazar sus FKs a tablas académicas locales por IDs opacos procedentes de Académico cuando se haga el corte.                                                       |
| UUIDs de integración inmutables, secuencias monotónicas, HMAC cursor/watermark, snapshots completos, tombstones, paginación y límites             | infraestructura de integración reutilizable   | Conservar semántica y pruebas; implementar el siguiente contrato con Académico como productor, sin reutilizar BL como maestro.                                                               |
| `AuditEvent` y `OutboxEvent` transaccionales                                                                                                      | infraestructura transversal                   | Mantener la idea por servicio. BL necesita auditoría financiera; Académico necesita auditoría/Outbox académico propios. La auditoría local no reemplaza un publisher ni un contrato público. |
| v1 y v2 read-only de `/integrations/academico`                                                                                                    | compatibilidad temporal                       | v1 debe congelarse para consumidores existentes. v2 no debe activarse ni convertirse en contrato permanente antes de invertir la dirección.                                                  |

### Riesgos de activar las migraciones de BL ahora

- Consolidaría en Pagos la escritura y autoridad de año, matrícula, promoción,
  repitencia y estructura, en competencia directa con Académico.
- Haría que el consumidor académico tuviera que migrar otra vez de v1 a un v2
  cuyo productor seguirá siendo el servicio equivocado.
- Introduciría FKs académicas físicas en la base financiera y elevaría el costo
  de separar ownership posteriormente; los datos nuevos quedarían con doble
  historia potencial.
- La existencia de dos ciclos de estados (`OPEN` de BL frente a `ACTIVE` de
  Académico) y dos modelos de matrícula exige un mapeo explícito que aún no
  existe.
- No hay evidencia de un publisher que entregue los `OutboxEvent` de BL. Una
  fila de outbox por sí sola no produce sincronización confiable.

Por lo anterior se prohíbe, hasta una decisión de corte, ejecutar las
migraciones `20260902120000_add_academic_year_foundation` y
`20260902130000_add_academico_v2_sequences` fuera de una base aislada. Esto no
cuestiona sus pruebas ni invalida los artefactos; evita convertir un puente de
migración en el nuevo sistema de registro.

## Arquitectura objetivo propuesta

### Fuente de verdad por dominio

| Dominio                                                                                                       | Fuente de verdad objetivo             | Réplicas permitidas                                                                  |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------ |
| Cuenta, credencial, sesión, identificador de acceso                                                           | EduPay Identity                       | claims de token de corta vida; nunca contraseñas ni refresh tokens fuera de Identity |
| Tenant canónico, membership y roles de aplicación                                                             | EduPay Identity                       | registros locales de tenant con el mismo ID opaco y mapeos de integración auditados  |
| Perfil de persona asociado a una cuenta                                                                       | EduPay Identity, cuando exista cuenta | snapshots mínimos donde haya necesidad legal u operativa                             |
| Alumno, profesor y su ciclo académico                                                                         | EduPay Académico                      | proyección financiera mínima en BL                                                   |
| Año, nivel, sección, curso anual, asignatura y asignación docente                                             | EduPay Académico                      | proyección read-only en BL para segmentar cobros y reportes                          |
| Matrícula, traslado, promoción, repitencia e historial                                                        | EduPay Académico                      | referencias inmutables/proyecciones de elegibilidad en BL                            |
| Responsable financiero, consentimiento de cobro, obligación, cuota, pago, conciliación y reportes financieros | EduPay Pagos / BL-002                 | identificación mínima de alumno/año/curso procedente de Académico                    |

### Course: concepto arquitectónico y modelo físico

En esta documentación, “oferta anual” describe el concepto de un curso dentro
de un año académico. **No es una nueva entidad física.** El modelo real de
Académico ya es `Course`, con `academicYearId`, y debe seguir siendo el único
aggregate/identificador de curso anual. En los contratos se usará
`academicCourseId`, no `academicCourseOfferingId`.

### Relaciones canónicas

```text
IdentityUser ──< TenantMembership >── TenantRealm
      │                         │
      │ opcional, exacta         └── roles de acceso
      ▼
Academic Student / Academic Teacher ──< Academic Enrollment >── Academic Course ── AcademicYear
      │
      └──< FinancialResponsibleParty / FinancialObligation (BL)
              │
              └── identityUserId opcional, sólo si ese responsable inicia sesión
```

- `IdentityUser` representa identidad de cuenta. No debe crearse para cada
  alumno, docente o apoderado si no requiere acceso.
- `AcademicStudent` y `AcademicTeacher` son entidades de negocio independientes
  y pueden apuntar opcionalmente a un `identityUserId` opaco. Identity no crea
  ni borra esos registros.
- `TenantMembership` autoriza entrar a una aplicación; no es matrícula ni
  asignación docente. Académico aplica además sus reglas de recurso.
- El responsable financiero pertenece al agregado financiero de BL. Puede
  vincularse a un IdentityUser para un portal futuro, pero la relación de
  responsabilidad y el historial de cobro no se trasladan a Identity ni a la
  matrícula.
- Si se requiere una persona sin cuenta compartida entre dominios, se abre un
  ADR específico para un perfil de persona mínimo en Identity. No se infiere
  identidad por nombre, RUT o email ni se bloquea el primer corte esperando ese
  agregado.

### Reglas de identificadores

1. El ID canónico del tenant es el UUID opaco de Identity y se replica como
   valor de integración en Académico y en `TenantCanonicalMapping` de BL. Esa
   tabla tiene PK `tenantId` local y `canonicalTenantId` único, además de actor,
   correlación, motivo y fecha de alta. Nunca es una FK entre bases ni un valor
   autorizado desde el cliente.
2. Cada servicio usa sus propios IDs internos. Los contratos llevan IDs opacos
   del productor, por ejemplo `academicStudentId`, `academicYearId`,
   `academicCourseId` y `academicEnrollmentId`.
3. BL mantiene sus IDs numéricos legados mientras existan pagos/boletas que los
   referencien. Agregará una tabla de mapeo/proyección, no una reutilización de
   IDs académicos como PKs financieras.
4. Las claves de idempotencia y los event IDs son estables por productor. Un
   consumidor debe deduplicar por `(producer, tenantId, eventId)` y conservar
   versión/origen para rechazar actualizaciones obsoletas.

## Dirección de integraciones

### Identity → Académico

- Validación síncrona de JWT por JWKS para solicitudes ordinarias.
- Comprobación interna y acotada de sesión/membership para acciones de alto
  riesgo, y resolución exacta para vincular una cuenta a un alumno/docente.
- Eventos de Identity pueden avisar activación, revocación o cambio de
  membership, pero no sustituyen la autorización en línea para operaciones
  sensibles.
- Académico nunca lee la base de Identity ni almacena secretos de Identity.

### Académico → Pagos

Académico debe convertirse en el productor de una proyección financiera
deliberadamente escasa: tenant canónico, alumno académico, año, oferta/curso,
matrícula, estado/decisión y cambios de elegibilidad. No incluirá credenciales,
notas, entregas, apoderados, RUT ni información pedagógica innecesaria.

Usar ambos mecanismos. Su diseño inicial, aún no implementado, está en
[Academic → Financial Projection](../integration/academic-financial-projection.md):

- un snapshot/pull paginado y versionado para bootstrap, recuperación y
  reconciliación nocturna;
- eventos desde un outbox académico para baja latencia, con entrega al menos una
  vez, idempotencia, versión de entidad y correlación.

BL debe proyectar localmente sólo lo indispensable para originar obligaciones,
segmentarlas y conservar comprobantes. Un cambio de curso o una baja no borra
pagos ni obligaciones previas. El contrato futuro debe ser nuevo y nombrado
por su dirección, por ejemplo `Académico → Financial Projection`; no se debe
reinterpretar silenciosamente `EduPay → Académico v1` ni `v2`.

### Transiciones y consistencia

- Las bajas, traslados y promociones se emiten desde Académico con estado,
  fecha efectiva, versión y event ID. BL actualiza su proyección de manera
  eventual y mantiene el snapshot que originó cada obligación.
- Una obligación no se elimina por una baja posterior; la política financiera
  decide cancelar, recalcular o mantener deuda mediante una acción financiera
  auditada.
- El rollover se confirma en Académico; sólo después se emiten cambios de
  matrícula que BL consume. Pagos no promueve alumnos.
- Para fallos, los eventos se reintentan y un snapshot completo repara drift.
  Ningún consumidor aplica bajas por ausencia sin un snapshot completo y su
  regla documentada de reconciliación.

## Onboarding multi-colegio propuesto

La coordinación es una saga de APIs/operadores, no una transacción ni acceso
directo entre bases.

| Etapa                  | SYSTEM_ADMIN / BaseLogic                                                 | TENANT_ADMIN / directivo                                              | Sistema dueño                                                 |
| ---------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------- |
| Contratación y tenant  | asigna UUID canónico, crea realm/mapping y registra soporte/auditoría    | —                                                                     | Identity coordina realm; cada servicio crea su registro local |
| Administrador inicial  | ejecuta bootstrap/invitación de Identity y registra correlación          | activa cuenta y elige contraseña                                      | Identity                                                      |
| Tenant académico       | crea tenant académico independiente con UUID canónico                    | verifica contexto y permisos                                          | Académico                                                     |
| Estructura inicial     | acompaña, carga plantilla y revisa errores                               | crea año, niveles/ofertas/cursos y asignaturas                        | Académico                                                     |
| Personas y cuentas     | soporte sólo con elevación auditada                                      | crea/importa alumnos y docentes; decide qué personas requieren cuenta | Académico + Identity para las cuentas                         |
| Matrículas y docencia  | revisión de progreso                                                     | matricula, asigna docente–curso–asignatura y valida                   | Académico                                                     |
| Preparación financiera | configura conceptos/reglas de cobro después de recibir proyección válida | revisa proyección y reglas aplicables                                 | BL                                                            |
| Habilitación           | revisa checklist, integraciones y reconciliación                         | confirma colegio listo                                                | coordinador de onboarding                                     |

El onboarding debe tener un `OnboardingRun` reanudable y auditado por tenant,
pasos idempotentes, validación previa, archivos de importación conservados de
forma segura, errores por fila, resultados parciales y claves de reintento. La
primera versión puede ofrecer importación CSV/XLSX en Académico sin bloquear la
arquitectura por un importador completo. No se debe usar el importador
financiero de BL para crear autoridad académica nueva.

## Rollover anual correcto

Académico conserva por separado persona/cuenta, alumno, oferta de curso,
matrícula anual e historial:

1. Configura el `AcademicYear` de destino y sus ofertas/cursos, niveles,
   secciones, asignaturas y asignaciones docentes en borrador.
2. Genera un `RolloverRun` académico idempotente que produce ítems revisables
   para promoción, repetición, retiro, traslado e ingreso. No modifica la
   matrícula de origen.
3. Al confirmar, cierra o completa la matrícula de origen según su estado y
   crea una matrícula nueva de destino. Repetir significa apuntar a una oferta
   del mismo nivel; promocionar, a la oferta del nivel siguiente.
4. Conserva movimientos, decisión, actor, correlación y justificación. La
   reversión se hace por compensación semántica, nunca por borrado físico.
5. Publica eventos/proyecciones de las matrículas confirmadas a BL. Las cuotas
   y pagos de 2026 continúan ligados a sus snapshots; los de 2027 nacen con
   las referencias de 2027.

La lógica de excepciones, bloqueo de concurrencia, idempotencia, auditoría y
compensación del bloque de BL es la candidata principal para este aggregate.
Antes de copiar código se debe adaptar su vocabulario y sus estados al modelo
de Académico (`ACTIVE`, `CLOSED`, `ARCHIVED`) y comprobar que la migración no
introduzca una segunda relación de matrícula.

## Plan de transición incremental

| Fase                                                | Objetivo y repositorios                                   | Compatibilidad / pruebas                                                                                                          | Rollback                                                                                                                              |
| --------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Congelar la dirección                            | Documentar esta decisión; BL, Académico, Identity         | No ejecutar migraciones de rollover BL ni backfill; conservar v1 y el worktree local                                              | N/A, sólo documentación                                                                                                               |
| 1A. Canonical Tenant Mapping                        | BL, con Identity y Académico como referencias de contrato | **Implementado en worktree aislado**: mapeo explícito, único, idempotente y auditado; `dryRun`, conflicto y pruebas cross-tenant  | La migración aditiva permanece sin aplicar; el mapping queda sin uso por contratos productivos y no modifica PKs ni datos financieros |
| 1B. Académico → Financial Projection Contract       | Académico, BL                                             | **Implementado en worktree aislado**: contrato Zod v1, OpenAPI, fixtures y contract tests; endpoints fallan cerrados sin S2S      | Retirar artefactos de contrato no desplegados sin datos de negocio                                                                    |
| 1C. Financial Projection Producer + Shadow Consumer | Académico, BL                                             | **Implementado en ramas aisladas, no activado:** outbox/snapshot S2S en Académico y projection/ledger/reconciliación shadow en BL | Deshabilitar el consumer y conservar evidencia/proyección de sólo lectura                                                             |
| 2. Completar administración académica               | Académico, Identity                                       | Año/oferta, alumnos, docentes, asignaturas, matrículas y carga reanudable bajo tenancy; pruebas de autorización e idempotencia    | Mantener creación manual; no redirigir aún BL                                                                                         |
| 3. Llevar rollover a Académico                      | Académico                                                 | Portar reglas del `PromotionRun` como nuevo aggregate, pruebas de promoción/repetición/traslado/compensación e historial          | No confirmar run; compensación semántica de un run confirmado                                                                         |
| 4. BL consume proyección                            | Académico, BL                                             | Snapshot inicial, outbox/eventos, consumer idempotente, reconciliación y shadow comparison con el feed BL v1                      | Detener consumer y conservar proyección/mapeo de sólo lectura; no borrar datos legados                                                |
| 5. Cortar autoridad de BL                           | Académico, BL                                             | Académico crea años/ofertas/matrículas; BL bloquea escritura académica nueva y sólo mantiene proyección/read compatibility        | Rehabilitar lectura v1 sólo durante ventana documentada; nunca reescribir historia                                                    |
| 6. Retirar compatibilidad legada                    | BL, Académico                                             | Retención, export, conciliación financiera y aprobación formal antes de remover modelos/endpoints legados                         | Restauración lógica desde backups y proyecciones, no reset destructivo                                                                |

### Convergencia futura de autenticación de BL

La autenticación propia de BL (`User`, contraseña, roles y JWT) es
compatibilidad histórica, no el estado objetivo. No forma parte de 1A–1C ni se
modifica en este corte. Después de estabilizar la proyección financiera, la
transición será:

```text
BL autenticación local
→ coexistencia con Identity
→ BL valida confianza/claims de EduPay Identity
→ retiro controlado de usuarios, passwords, JWT y roles duplicados
```

La fase requerirá un ADR propio, compatibilidad explícita para el Portal
financiero legado, migración de sesiones/roles aprobada y una ventana de
rollback. No autoriza federación improvisada, cookies compartidas ni cambios a
la base de Identity.

El corte de producción exige migraciones aisladas, backup restaurable, dry-run,
reconciliación por tenant y aprobación explícita. No se permite un big bang ni
una migración cruzada de bases.

## Estado de los cortes 1A–1C

La Fase 1A se implementa en un worktree BL propio. Su migración sólo crea una
tabla vacía; no hace backfill y no se aplicó a una base real. El endpoint de
configuración exige `SUPER_ADMIN`, no permite reasignar, normaliza el UUID y
ofrece `dryRun=true` para validar existencia y colisiones sin crear una fila.
Identity continúa siendo la única autoridad del UUID: el cliente no puede
elegirlo como contexto de una operación financiera futura.

Fase 1B quedó implementada como artefactos de contrato y declaración OpenAPI
en un worktree propio. Fase 1C añadió producer y shadow consumer en ramas
separadas. Ninguna migración fue ejecutada, ningún secreto fue configurado y
ningún dato real fue sincronizado. El flujo disponible, pero inactivo, es:

```text
Académico CourseEnrollment + versión durable
  └─ misma transacción → outbox académico → HTTP S2S at-least-once
      └─ BL TenantCanonicalMapping → proyección shadow aislada
          └─ ledger/cuarentena/snapshot/reconciliación (sin Payments/Charges)
```

La siguiente implementación **no autorizada aún** es:

1. Completar Administración/Onboarding académico con tenancy, alta explícita
   y configuración operable por colegio antes de introducir ciclos masivos.
2. No conectar aún BL como consumidor de producción ni como fuente financiera.
   Puede mantener la proyección shadow solamente tras una activación explícita
   y reconciliación por tenant.
3. Mantener el rollover 2026→2027 de BL intacto; su port a Académico requiere
   un corte/ADR propio y no forma parte de 1C.

Este corte invierte la dirección futura sin tocar el historial financiero ni
ejecutar las migraciones académicas locales de BL. El port de rollover es el
corte siguiente, no el primero.

## Criterios de aceptación de la decisión

- Los tres repositorios referencian este documento o una decisión equivalente
  antes de cambiar ownership, contratos o migraciones.
- Se mantiene independencia de bases, autenticación y secretos.
- Los contratos prueban tenant mapping, duplicados, replay, orden obsoleto,
  tombstones, snapshots parciales, dos tenants y ausencia de PII financiera o
  académica no requerida.
- Se prueba que alumnos/docentes sin cuenta y responsables financieros sin
  membership continúan siendo válidos.
- La migración de un tenant piloto produce conciliación exacta de cantidad de
  alumnos/matrículas, obligaciones, pagos y saldos antes de ampliar el alcance.
