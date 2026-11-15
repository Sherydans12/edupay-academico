# ADR-0025: autoridad de datos y ciclo anual entre Académico y Pagos

Estado: **Aceptado** (2026-11-15) en las decisiones 1 a 5. Los contratos,
esquemas y migraciones que de ella derivan requieren su propio diseño, pruebas
y autorización; aceptar este ADR no autoriza cambios productivos.

Fecha: 2026-11-15

Relacionado: [ADR-0015](ADR-0015-edupay-source-of-truth-proposal.md),
[ADR-0016](ADR-0016-edupay-sync-strategy-proposal.md),
[ADR-0021](ADR-0021-ecosystem-domain-ownership-transition.md),
[ADR-0024](ADR-0024-academic-admission-and-student-identifier-proposal.md),
[contrato de proyección financiera](../integration/academic-financial-projection.md)
y [arquitectura del ecosistema](../architecture/edupay-ecosystem-architecture.md).

## Contexto

El colegio está en matrícula 2027: los alumnos avanzarán de curso y la
cobranza cambia de año. Hoy alumnos, cursos y apoderados se pueden crear en
ambos sistemas y **ninguna sincronización está activa**: el sync v1
BL → Académico tiene sus workers detenidos y la proyección Académico → BL
está implementada pero apagada.

Conteos agregados de producción, solo lectura, 2026-11-15:

| Sistema   | Dato                                       | Valor                                                                         |
| --------- | ------------------------------------------ | ----------------------------------------------------------------------------- |
| Académico | Años                                       | uno: `2026` `ACTIVE` (2026-03-01 → 2026-12-15), 14 cursos; no existe año 2027 |
| Académico | Alumnos                                    | `EDUPAY` 241 activos + 10 inactivos; `MANUAL` 1 activo + 1 inactivo           |
| Académico | Matrículas 2026 activas                    | `EDUPAY` 241; `MANUAL` 1                                                      |
| Académico | Cursos                                     | `EDUPAY` 12 activos + 1 archivado; `MANUAL` 1 archivado                       |
| BL-002    | Alumnos                                    | 246 activos, todos con plan `CONFIGURED`                                      |
| BL-002    | Cursos / apoderados                        | 15 cursos vigentes (16 en total) / 244 apoderados                             |
| BL-002    | Cuotas                                     | 2026: 1.949 pagadas, 492 vencidas, 209 pendientes, 1 parcial; 2025: 1 pagada  |
| BL-002    | `tenant_canonical_mappings` / proyecciones | 0 / 0                                                                         |

Consecuencias observadas:

- Los padrones ya difieren (241 frente a 246 alumnos; 12 frente a 15 cursos)
  porque el sync está detenido.
- El avance anual de Académico solo mueve matrículas `MANUAL`: hoy **241 de
  242** matrículas activas son `EDUPAY` y quedarían sin mover.
- BL-002 no modela años: `Course` no tiene año y su nombre es único por
  tenant; cada alumno tiene un solo `courseId`; `financialSetup` pasa una sola
  vez de `PENDING` a `CONFIGURED`; las cuotas solo tienen `dueDate`.
- Sin mapping de tenant canónico, la proyección no puede operar.

## Decisión

### 1. Dónde se hace cada cosa

| Entidad u operación                                  | Fuente única (crea y edita) | El otro sistema                            |
| ---------------------------------------------------- | --------------------------- | ------------------------------------------ |
| Año académico y su ciclo (borrador, activo, cerrado) | Académico                   | BL lo recibe y lo muestra; no lo edita     |
| Curso de un año                                      | Académico                   | BL lo recibe por año; no crea cursos       |
| Alumno (ficha, nombres, RUN/IPE)                     | Académico                   | BL lo recibe; edita solo datos financieros |
| Matrícula, avance, repitencia, traslado, retiro      | Académico                   | BL recibe la matrícula vigente por año     |
| Apoderado / responsable financiero                   | BL-002                      | Académico no lo modela (ADR-0015)          |
| Conceptos, plan de cobro, cuotas, pagos, boletas     | BL-002                      | —                                          |
| Cuentas, sesiones, memberships                       | Identity                    | —                                          |

Consecuencia de UI: cada pantalla que muestra un dato de otro dueño lo indica
y enlaza al sistema que lo gestiona. BL-002 retirará el alta y edición de
alumnos y cursos **solo cuando** la sincronización de la decisión 2 esté
activa y verificada.

### 2. Sincronización Académico → BL-002

La proyección existente se activa y amplía para que BL pueda crear y
actualizar sus alumnos y cursos sin digitación:

- Lleva, además de los identificadores actuales (tenant, alumno, año, curso,
  matrícula, estado, vigencia y versión), el **nombre y apellidos** del
  alumno, la **etiqueta del curso** y el **RUN/IPE** del alumno. Esto enmienda
  la minimización del contrato de proyección; el RUN/IPE sigue siendo dato
  sensible en ambos servicios: no se registra en logs, eventos de auditoría
  ni respuestas que no lo requieran.
- BL vincula los alumnos que ya tiene por `integrationId` (hoy
  `externalReference` de las fichas `EDUPAY` en Académico) y crea los nuevos.
  Nunca vincula por nombre, curso o correo.
- El mapping de tenant canónico se crea primero, con `dryRun` y autorización.
- La ejecución usa eventos de outbox para baja latencia y snapshot paginado
  para bootstrap y reconciliación, como define el contrato.

### 3. Alumnos nuevos durante la transición

No hay doble registro. Un alumno admitido en Académico se cobra en BL-002
recién cuando la sincronización esté activa. Por eso la sincronización es el
primer trabajo de implementación y debe estar lista antes de cobrar
matrículas 2027 de alumnos nuevos.

### 4. Cobranza ligada al año académico

En BL-002, el plan de cobro y sus cuotas pertenecen a una **matrícula de un
año académico** recibida desde Académico. El plan financiero se configura por
alumno **y año**; un alumno puede tener el plan 2026 cerrado o con deuda y el
plan 2027 en configuración al mismo tiempo. Los cursos en BL se distinguen por
año. Las cuotas 2026 existentes se conservan y se asocian a 2026.

### 5. Avance anual y fichas `EDUPAY`

Antes de avanzar a 2027, la autoridad sobre las fichas y matrículas `EDUPAY`
pasa a Académico (retiro del sync v1, ADR-0024 punto 5), conservando su
vínculo con BL por `integrationId`. Así el avance anual puede mover el padrón
completo y BL recibe las matrículas 2027 por la proyección.

## Plan de implementación

1. **Diseño y contratos** (sin producción): contrato de proyección v2 con
   nombre, curso y RUN/IPE; modelo de años en BL; prototipos de interfaz.
2. **Académico**: año en contexto y panorama del año en la administración;
   crear y preparar el año 2027 desde ahí.
3. **Mapping y proyección**: mapping de tenant con `dryRun`; productor y
   consumidor activados primero en sombra; conciliación de los 241/246 alumnos
   y 12/15 cursos con reporte de diferencias; luego escritura en BL.
4. **BL por año**: esquema de cursos, matrículas y planes por año; plan 2027;
   indicador de año; retiro del alta de alumnos y cursos en BL.
5. **Traspaso de autoridad `EDUPAY` y avance 2026 → 2027** en Académico.

Cada paso con migración requiere el gate, recovery point y autorización de
los runbooks de cada repositorio.

## Consecuencias

- Una sola pantalla y un solo sistema para cada operación; el otro muestra el
  dato con su origen.
- BL-002 cambia de modelo (años) y depende de Académico para alumnos y
  cursos. Mientras la sincronización no esté activa, los alumnos nuevos no se
  pueden cobrar.
- El RUN/IPE pasa a existir en la proyección y debe protegerse igual en BL.
- El trabajo local de rollover aparcado en BL (stash del 2026-11-12) no se
  retoma: el ciclo anual vive en Académico.
