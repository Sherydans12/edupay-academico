# ADR-0027 Preparación del padrón y de la cobranza del año siguiente

Alcance aprobado el 27 de noviembre de 2026. Administración debe revisar y guardar el padrón del año siguiente mientras el año vigente sigue operativo. Pagos debe poder cobrar la matrícula anticipada de alumnos confirmados.

## Mantener separados los estados

1. El año y los cursos de destino pueden permanecer en borrador. Académico conserva sus reglas vigentes de acceso al aprendizaje.
2. Un borrador de avance por tenant, curso de origen y año de destino guarda el curso principal, las excepciones, la huella del padrón y su revisión. Guardarlo conserva las matrículas y el outbox financiero. «No continúa» y «Pendiente» quedan como decisiones distintas.
3. **Preparar matrículas del año de destino** es un comando explícito. Lee la revisión guardada, verifica el padrón y crea solo matrículas futuras de los alumnos asignados. Encola sus proyecciones v2 en la misma transacción. Las matrículas del año de origen siguen vigentes. Las altas y correcciones en el año de destino siguen los flujos académicos existentes.
4. El avance operativo posterior puede reutilizar una matrícula ya preparada en el mismo curso. Un alumno inscrito en otro curso del año o excluido con una matrícula futura existente requiere revisión. La decisión de borrador no cancela cuotas, devuelve pagos ni elimina matrículas.
5. BL-002 conserva el control de la emisión de cuotas. La matrícula proyectada de un año en borrador permite preparar su cobranza. La publicación al portal requiere un cargo asociado a esa matrícula y un apoderado en Pagos. Las familias mantienen su estado de cuenta histórico.

## API de Administración

`GET/PUT /api/v1/courses/{sourceCourseId}/rollover-drafts/{targetAcademicYearId}` consulta y guarda con revisión optimista. `POST /api/v1/course-enrollment-promotions/prepare` aplica la revisión guardada al padrón de destino con `Idempotency-Key`. Se conservan la autorización de Admin y el aislamiento por tenant. El contrato financiero v2 conserva sus campos actuales. La operación legacy de avance sigue disponible.

El listado Excel de 1.º básico queda para un corte posterior. La fecha de apertura, el concepto y el monto del cobro corresponden a Pagos.
