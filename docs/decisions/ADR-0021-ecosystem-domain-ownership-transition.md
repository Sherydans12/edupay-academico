# ADR-0021: transición de ownership de dominio en el ecosistema EduPay

Estado: **Aceptado**

Fecha: 2026-09-03

Relacionado: [arquitectura transversal](../architecture/edupay-ecosystem-architecture.md),
ADR-0009, ADR-0010, ADR-0015 y ADR-0016.

## Contexto

La auditoría de los tres servicios encontró que BL-002 sigue siendo el origen
operativo del roster usado por el sync v1 de Académico. Además, existe trabajo
local no aplicado en BL que modela año académico, matrícula, promoción,
repitencia y un feed anual v2. Académico ya posee modelos y APIs propios para
estructura académica, cursos, alumnos, docentes y matrícula; Identity ya
posee la autenticación y membership.

Permitir que BL active ese modelo como fuente definitiva duplicaría el bounded
context académico y consolidaría un acoplamiento financiero–académico.

## Decisión

1. Identity es la fuente de verdad de cuenta, autenticación, sesión,
   membership, roles y tenant canónico.
2. Académico es la fuente de verdad de estructura, alumno/docente académico,
   año, `Course` anual, matrícula, asignación docente, promoción, repitencia e
   historial.
3. BL-002 es la fuente de verdad de responsable financiero, obligación, cuota,
   pago, conciliación y reporte financiero.
4. La información académica futura fluye de Académico a BL mediante contratos
   explícitos, eventos desde outbox y reconciliación por snapshot; no mediante
   acceso directo a bases ni reutilización de FKs entre servicios.
5. Los contratos v1 y v2 de BL para Académico se conservan sólo como
   compatibilidad/transición. No se reinterpretan como el contrato final ni se
   activan las migraciones de rollover de BL sobre datos reales.
6. El modelo físico `Course` de Académico ya representa un curso dentro de un
   `AcademicYear`; “oferta anual” es sólo terminología arquitectónica y no
   autoriza crear una segunda entidad.
7. El algoritmo de rollover, idempotencia, compensación y paginación v2 se
   reutiliza por semántica y pruebas, adaptado al modelo de Académico.
8. La autenticación local de BL se conserva por compatibilidad histórica. Una
   fase posterior y separada la llevará de coexistencia a confianza en Identity
   y, finalmente, a retiro controlado de passwords, JWT y roles duplicados.

## Consecuencias

- ADR-0015 y ADR-0016 permanecen como descripción y control de seguridad del
  sync legado. Al aceptar este ADR, su decisión de BL como fuente de roster se
  restringe a coexistencia temporal y queda programada para retiro.
- La Fase 1A queda implementada en un worktree aislado de BL: el mapping
  explícito es uno-a-uno, idempotente, auditable, admite `dryRun` y no permite
  que un cliente seleccione arbitrariamente el tenant. Su migración vacía no
  se ha aplicado ni migra datos reales. Fases 1B/1C diseñan y después producen
  la proyección Académico → Financiero.
- El onboarding de colegio y el rollover pasan a requerir coordinación de
  servicios mediante APIs y correlación, no transacciones distribuidas ni
  tablas compartidas.
- La implementación posterior requiere pruebas de seguridad y un piloto
  reversible; la aceptación de esta decisión no autoriza migraciones reales.
