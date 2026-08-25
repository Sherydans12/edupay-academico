# Fase 5: resolución de conflicto de alcance

Estado: **RESUELTA — el Owner confirmó el RFC incremental de Course Builder**

## Diferencia documental

La documentación vigente utiliza “Fase 5” con dos significados incompatibles:

1. **Roadmap global y baseline de implementación**
   - `docs/product/roadmap.md:48-54` define Fase 5 como notificaciones y
     sincronización EduPay, con salida basada en outbox/email, reintentos,
     idempotencia, visibilidad de fallos y el contrato de sincronización de
     estudiantes/cursos.
   - `docs/governance/implementation-phases.md:34-41` repite ese alcance y
     declara la notificación como baseline implementado, manteniendo la
     sincronización como trabajo separado.

2. **RFC de Course Builder**
   - `docs/rfcs/RFC-COURSE-BUILDER-EVOLUTION.md:761-775` define una secuencia
     incremental propia: Fase 4 = Teacher workspace, Fase 5 = Block body y
     Fase 6 = Student/evidence.
   - `PHASE4_MANIFEST.md` identifica explícitamente el trabajo previo como
     “Phase 4: Teacher Workspace Evolution”.
   - La petición actual menciona la validación visual de Fase 4 y pide trasladar
     patrones UX del docente a alumnos; por contexto, esto apunta a la
     secuencia incremental del RFC, pero el nombre “Fase 5” también coincide
     literalmente con el roadmap global.

## Resolución

La instrucción de entrega confirmó que gobierna el RFC incremental y que esta
entrega implementa **B — Block body**. El alcance A queda explícitamente fuera
de esta rama.

## Secuencia propuesta

1. Mantener el alcance A fuera de esta entrega; no mezclar fases.
2. Ejecutar la fase B en la rama dedicada, con pruebas positivas,
   negativas, stale/revoked, cross-tenant, seguridad y regresión.
3. Aplicar después la paridad UX compatible para alumnos. Solo se trasladan
   responsive, menús/modales, foco/teclado, `aria-live`, estados
   loading/empty/error y scroll; edición, publicación, reorder y acciones
   administrativas permanecen teacher-only.
4. Ejecutar hardening y preparar el release candidate sin merge, push, deploy ni
   migraciones productivas.

## Nota de trazabilidad

La referencia a la validación visual de Fase 4 y a la paridad Teacher → Student
es consistente con esta resolución. La superficie completa de alumnos de la
Fase 6 y las notificaciones/sincronización del roadmap global siguen fuera de
alcance.
