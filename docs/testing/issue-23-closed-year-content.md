# Issue #23: contenido docente en años cerrados

## Alcance confirmado

`origin/main` (`79ebcd04476577e38013f76f57e4b7808833a817`) contiene el defecto: la guarda común de mutaciones de `LearningService` comprueba que `CourseSubject` esté activo, pero no el estado de su `AcademicYear`. La reproducción de [#23](https://github.com/Sherydans12/edupay-academico/issues/23) obtuvo `201 Created` al crear una unidad después de cerrar el año. Afecta a unidades, ítems, borradores, publicación, ordenación, duplicación, restauración y adjuntos docentes. No requiere cambio de esquema ni contrato.

## Corrección

La API reutiliza la misma regla de año mutable que la estructura académica: `CLOSED` y `ARCHIVED` rechazan escrituras con `409`. La comprobación ocurre después del aislamiento por tenant y la autorización de asignatura, y antes de las escrituras de contenido. También se mantiene el bloqueo de `CourseSubject` y curso archivados. Reservar o completar un adjunto docente aplica la regla; consultar contenido, borradores, revisiones y adjuntos históricos sigue disponible según los permisos existentes. Las entregas de estudiantes conservan su política propia.

## Validación

- E2E PostgreSQL de aprendizaje: año abierto permite crear, editar y publicar; año cerrado rechaza rutas de escritura de unidad e ítem sin alterar registros, revisiones ni recibos de idempotencia. Cubre otra asignatura/tenant, docente sin asignación, vínculo docente inactivo y lectura de contenido e historial.
- E2E PostgreSQL de almacenamiento: un adjunto previo sigue consultable; después del cierre no se crea una reserva nueva ni se finaliza una reserva previa como adjunto docente; no aparecen nuevos archivos ni referencias.
- La base local descartable se creó con `prisma db push` sin migraciones. Ese método no instala los índices SQL parciales históricos; por ello los tests de unicidad de `academic-domain.e2e-spec.ts` requieren el entorno PostgreSQL de CI con el esquema migrado. No se modificó ningún dato productivo.

Orden de publicación propuesto, sin ejecutar aquí: **API → FRONT (PR #22)**. La etiqueta legible del año sigue pendiente backend independiente.
