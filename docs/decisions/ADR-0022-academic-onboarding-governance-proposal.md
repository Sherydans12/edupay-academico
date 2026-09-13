# ADR-0022: gobernanza propuesta para onboarding académico auditado

Estado: **Propuesto**

Fecha: 2026-09-13

Relacionado: [ADR-0021](ADR-0021-ecosystem-domain-ownership-transition.md),
[arquitectura del ecosistema](../architecture/edupay-ecosystem-architecture.md)
y [contrato de proyección financiera](../integration/academic-financial-projection.md).

## Contexto

ADR-0021 sitúa la estructura académica, las personas académicas y las
matrículas en Académico. La Fase 1A ya aporta en BL un mapeo explícito entre
tenant local y UUID canónico, creado una sola vez por `SUPER_ADMIN`, auditable
y verificable en `dryRun`. Ese mapeo no es un flujo de onboarding ni debe
duplicarse como una segunda fuente de tenant.

El siguiente corte debe poder preparar y revisar un colegio sin que una carga,
un reintento o una aprobación conviertan a BL en dueño académico ni activen la
proyección financiera.

## Decisión propuesta

Antes de implementar tablas, rutas o estados, el onboarding se modelará como
un `OnboardingRun` de Académico, reanudable e idempotente, ligado al UUID
canónico y con `correlationId`. Los estados candidatos son `DRAFT`,
`PENDING_REVIEW`, `APPROVED`, `REJECTED` y `CANCELLED`; son una propuesta de
revisión, no un contrato ni un enum implementado.

1. El operador de plataforma inicia o recupera un run y sólo puede avanzar
   con preflight válido: tenant canónico confirmado, contexto de Identity
   verificable y, cuando BL sea parte del checklist, mapping 1A existente o
   `dryRun` sin colisiones.
2. El administrador del tenant carga y valida estructura, personas, cuentas y
   matrículas dentro de Académico. No puede aprobar su propio run.
3. Un revisor de plataforma distinto aprueba o rechaza; la elevación de
   privilegio y la relación concreta entre `SYSTEM_ADMIN`, `TENANT_ADMIN` y
   los roles de Identity requieren revisión conjunta con Identity antes de
   codificarse.
4. Cada transición conserva actor, instante, correlación, motivo, versión del
   preflight y resultado por ítem. Los errores parciales se corrigen y
   reintentan con clave idempotente; no se reescribe el historial.
5. Una discrepancia de tenant, una modificación del mapping 1A o una
   aprobación concurrente bloquean el run para revisión manual. No se infiere
   ni se sobrescribe el mapping; el conflicto se traza con su correlación.
6. La aprobación deja listo el tenant académico. La habilitación de la
   proyección Académico → BL sigue siendo un gate separado: migraciones
   verificadas, secreto S2S, flags explícitos, snapshot y reconciliación.

## Consecuencias y gates

- No se crea aquí un contrato nuevo, migración, endpoint, credencial ni tarea
  financiera. La decisión no autoriza despliegue ni activación.
- La implementación futura debe añadir autorización negativa, segregación de
  funciones, concurrencia, reintentos, auditoría y pruebas cross-tenant.
- Se debe aceptar este ADR y revisar el modelo de roles de Identity antes de
  fijar los nombres de estados o una API pública.
- BL conserva exclusivamente 1A como precondición de mapeo; Académico es dueño
  del run y de los datos académicos. Ningún flujo crea obligaciones, pagos o
  conciliaciones.
