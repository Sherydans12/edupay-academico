# Docencia: corte de trabajo cotidiano

Base: `origin/main` `79ebcd04476577e38013f76f57e4b7808833a817`.

## Recorrido y capacidades existentes

El profesor abre sus asignaturas autorizadas desde Inicio o Asignaturas. Cada espacio tiene unidades, contenidos, estados de borrador, programación y publicación, adjuntos, entregas, roster, revisión e historial. El constructor vigente permite crear, editar, duplicar, reordenar, archivar y restaurar según las protecciones del API. No se añadieron operaciones académicas nuevas.

## Cambios

- Inicio muestra seis asignaturas con acceso a la lista completa. Asignaturas permite buscar por curso o nombre y pasar páginas de 12; cada ficha lleva directamente al contenido o al roster.
- El roster conserva exclusivamente los estudiantes devueltos por el endpoint docente y añade búsqueda y páginas de 25. Los estados sin asignación, sin alumnos y sin coincidencias se distinguen.
- Revisiones permite acotar la cola por asignatura y curso cuando hay más de un contexto con actividades o evaluaciones.
- El constructor mantiene abiertos los formularios de unidad y contenido cuando falla el guardado, para corregir o reintentar con los datos escritos. Una confirmación sensible exitosa los cierra; se conservan la protección de salida con cambios, la detección de conflictos, el historial y la semántica de publicación.
- Al cambiar la membresía activa de Identity, el árbol docente se remonta y descarta estado local del tenant anterior. Las pantallas de DIE y Administración mantienen su ciclo de vida actual.
- Se añadieron estilos de controles para escritorio y móvil dentro del sistema visual existente.

El año académico no está disponible como etiqueta para el rol docente: `CourseSubject` contiene `course.academicYearId`, pero la consulta de años requiere `adminScope`. No se muestra un año inferido de fechas o IDs. Este dato requiere una decisión de contrato backend en un corte separado.

## Capturas sintéticas

Se capturó la misma lista con 18 asignaturas ficticias en un preview Vite local, aislado de Identity y del API. El preview y sus datos se retiraron antes del build final. El shell conserva la etiqueta productiva “Datos reales” por estar renderizado como componente real; el encabezado del preview y estos archivos identifican la sesión de captura como sintética.

| Tamaño | Antes (`origin/main`) | Después |
| --- | --- | --- |
| Escritorio, 1440 × 900 | [![Antes, escritorio](screenshots/teacher-before-desktop.png)](screenshots/teacher-before-desktop.png) | [![Después, escritorio](screenshots/teacher-after-desktop.png)](screenshots/teacher-after-desktop.png) |
| Móvil, 390 × 844 | [![Antes, móvil](screenshots/teacher-before-mobile.png)](screenshots/teacher-before-mobile.png) | [![Después, móvil](screenshots/teacher-after-mobile.png)](screenshots/teacher-after-mobile.png) |

## Validación y límites

En navegador se recorrieron Inicio, Asignaturas, el constructor, el roster y Revisiones con datos sintéticos. Se verificaron 18 asignaturas, búsqueda y paginación del roster de 32 alumnos, estado sin entregas, creación de unidad, fallo de guardado con texto conservado y reintento exitoso. A 390 px, la vista del curso midió 375 px de contenido y no presentó desborde horizontal. La ruta local de preview no modificó la autenticación del producto y no forma parte del release.

La sesión no incluyó un backend Académico e Identity sintéticos completos: no se validaron en navegador las mutaciones reales de publicación, revisión de entregas, historial o adjuntos, ni las respuestas negativas de otro tenant o año cerrado. Esas protecciones permanecen en los contratos y el servidor, y las pruebas web existentes cubren los componentes; una comprobación integrada con servicios aislados sigue pendiente antes de despliegue.

Validación del árbol final: 148 pruebas web aprobadas; lint sin errores y con 12 advertencias preexistentes del constructor; typecheck web y build web aprobados. El build usó bases HTTPS ficticias mediante variables de proceso, sin escribir `.env.local`.
