# Primer corte: avance anual de matrícula por curso

**Estado:** integrado en `main` mediante el commit
`6d15463376d75d9803325427ec388255a9458a70` (desarrollado en
`codex/academic-year-2027-workflow`). Estar en `main` no prueba un despliegue y
no autoriza aplicar cambios de datos ni publicar.

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
3. La pantalla carga el roster en páginas de 50 alumnos. La vista previa muestra
   conteos del curso completo; cada excepción individual se conserva al cambiar
   de página. El destino predeterminado aplica a quienes no tienen excepción.
4. Antes de confirmar, el administrador revisa el resumen y confirma la
   operación en bloque.
5. La API compara una huella SHA-256 del roster con la vista previa. El comando
   envía solamente las excepciones, no todos los identificadores. Si cambió la
   matrícula, no aplica el comando y pide recargar la vista previa.
6. En una única transacción, las matrículas de origen que avanzan pasan a
   `INACTIVE` y se crean matrículas `ACTIVE` en sus destinos. Las decisiones
   pendientes y los registros de sincronización quedan sin cambios. No se
   cierra automáticamente el año ni el curso de origen.

La API exige `Idempotency-Key`, valida todos los identificadores dentro del
tenant de confianza y ejecuta el comando con aislamiento serializable. El
recibo existente `CommandReceipt` conserva el resumen y permite repetir una
confirmación sin crear matrículas duplicadas. La auditoría
correlacionada registra el curso, el año destino y los conteos sin nombres ni
otros datos personales. Si la proyección financiera está habilitada, ambos
cambios de cada matrícula participan en la outbox existente; no se activa esa
proyección por esta operación.

## Límites conocidos

- El origen debe seguir activo; el avance se prepara antes de cerrar el año.
- Se limita a 10.000 matrículas activas por operación; el resumen informa el
  límite antes de habilitar la confirmación. Cada página muestra hasta 50.
- Se permiten hasta 400 excepciones por comando; los demás alumnos siguen el
  destino principal. La operación usa inserción y outbox en lotes dentro de la
  misma transacción.
- El recibo y los registros de matrícula conservan el resultado técnico, pero
  este corte no agrega una pantalla de historial de promociones ni un proceso
  de aprobación separado.
- No importa archivos ni crea cuentas Identity. La admisión/importación queda
  como fase siguiente: requiere una clave estable acordada, vista previa,
  reporte de conflictos, deduplicación e idempotencia antes de crear alumnos.
- Las matrículas de la sincronización v1 no se pueden avanzar localmente hasta
  retirar esa fuente de autoridad y ensayar el cambio de ownership.
- No se crea una entidad nueva ni una migración de base de datos.

## Escala de interfaz

- La administración de alumnos, los rosters y la vista previa de avance
  reemplazan filas al cambiar página; el navegador no acumula todo el padrón en
  el DOM. Cada página de alumnos contiene hasta 50 registros.
- Los listados visibles de cursos muestran hasta 25 filas por página. El flujo
  de inscripción busca alumnos en el API y permite cambiar páginas de
  coincidencias, de modo que las fichas fuera de la primera página siguen
  disponibles.
- El avance representa al curso completo con conteos y huella; solo las
  excepciones viajan en el comando.

### Padrón de alumnos y profesores

- `GET /api/v1/students` y `GET /api/v1/teachers` informan `totalCount` con los
  mismos filtros de búsqueda y estado, calculado sólo dentro del tenant de
  confianza. El campo ya era opcional en `studentPageSchema` y
  `teacherPageSchema`; el contrato no cambia de forma.
- La pantalla de alumnos busca en el servidor después de 300 ms sin escribir,
  filtra por estado (`ACTIVE`/`INACTIVE`) y pagina por cursor de 50. Muestra
  «N alumnos · Página X de Y» sólo con un total informado por el API; si no lo
  recibe, muestra la página y una cuenta mínima («50+») en vez de presentar el
  tamaño de página como total.
- Crear, editar o vincular una ficha recarga la página visible y conserva la
  pestaña, la búsqueda, el filtro y la página; los conteos del resumen se
  actualizan sin desmontar la vista.
- Un error al cargar una página se informa con «Reintentar» y aclara que la
  lista visible corresponde a la última consulta completada.
- No se agregó orden alfabético: el cursor sigue el orden de creación, y
  cambiarlo requiere revisar el contrato de paginación.

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
