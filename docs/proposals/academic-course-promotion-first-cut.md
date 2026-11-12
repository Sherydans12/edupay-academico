# Primer corte: avance anual de matrícula por curso

**Estado:** implementación candidata en rama aislada; requiere revisión antes
de integrarse. No autoriza aplicar cambios de datos ni publicar.

**Base de dominio:** [ADR-0021](../decisions/ADR-0021-ecosystem-domain-ownership-transition.md)
y contratos REST/idempotencia de [ADR-0011](../decisions/ADR-0011-api-and-shared-contract-strategy.md).

## Alcance

Un administrador académico puede revisar la matrícula activa de un curso y
preparar su avance a un año posterior. Elige el curso de destino principal y
puede asignar por alumno otro destino por repitencia o cambio de curso, o dejar
la decisión pendiente. Los nombres de curso no se usan para inferir grado,
sección ni promoción.

El primer corte se limita a matrículas manuales. Matrículas administradas por
la sincronización legada se identifican en la vista previa, permanecen intactas
y no se pueden mover desde esta operación. El retiro de esa autoridad legada
es una tarea separada, necesaria antes de avanzar ese roster desde Académico.

## Flujo y reglas

1. El administrador selecciona un curso activo de un año activo.
2. Selecciona un año destino mutable cuya fecha de inicio sea posterior al fin
   del año de origen, y elige un curso destino principal.
3. La pantalla carga el roster completo y muestra una decisión por alumno:
   avanzar al destino principal, repetir en un curso del año destino, cambiar
   a otro curso del año destino, o dejar pendiente.
4. Antes de confirmar, el administrador revisa el resumen y confirma la
   operación en bloque.
5. La API verifica que el roster enviado coincida con el roster vigente. Si
   cambió, no aplica el comando y pide recargar la vista previa.
6. En una única transacción, las matrículas de origen que avanzan pasan a
   `INACTIVE` y se crean matrículas `ACTIVE` en sus destinos. Las decisiones
   pendientes y los registros de sincronización quedan sin cambios. No se
   cierra automáticamente el año ni el curso de origen.

La API exige `Idempotency-Key`, valida todos los identificadores dentro del
tenant de confianza y ejecuta el comando con aislamiento serializable. El
recibo existente `CommandReceipt` conserva el resultado por ítem y permite
repetir una confirmación sin crear matrículas duplicadas. La auditoría
correlacionada registra el curso, el año destino y los conteos sin nombres ni
otros datos personales. Si la proyección financiera está habilitada, ambos
cambios de cada matrícula participan en la outbox existente; no se activa esa
proyección por esta operación.

## Límites conocidos

- El origen debe seguir activo; el avance se prepara antes de cerrar el año.
- Se limita a 500 matrículas por operación para mantener acotada la transacción.
- El recibo y los registros de matrícula conservan el resultado técnico, pero
  este corte no agrega una pantalla de historial de promociones ni un proceso
  de aprobación separado.
- No importa archivos ni crea cuentas Identity. La admisión/importación queda
  como fase siguiente: requiere una clave estable acordada, vista previa,
  reporte de conflictos, deduplicación e idempotencia antes de crear alumnos.
- Las matrículas de la sincronización v1 no se pueden avanzar localmente hasta
  retirar esa fuente de autoridad y ensayar el cambio de ownership.
- No se crea una entidad nueva ni una migración de base de datos.

## Revisión antes de integrar

- Revisar el contrato de comando en `packages/contracts` junto con el cliente
  web y el handler de Académico.
- Confirmar el orden operativo para promover los cursos y cerrar el año de
  origen cuando todos los casos pendientes estén resueltos.
- Revisar el tratamiento de roster importado y el retiro del sync v1 con los
  contratos de transición del ecosistema.
- Ejecutar validación de código y QA visual en un tenant de prueba con datos
  sintéticos antes de abrir una integración.
- Cualquier carga de archivo o alta de cuentas se revisa en una fase separada.
