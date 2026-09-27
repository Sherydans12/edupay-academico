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

| Tamaño                 | Antes (`origin/main`)                                                                                  | Después                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Escritorio, 1440 × 900 | [![Antes, escritorio](screenshots/teacher-before-desktop.png)](screenshots/teacher-before-desktop.png) | [![Después, escritorio](screenshots/teacher-after-desktop.png)](screenshots/teacher-after-desktop.png) |
| Móvil, 390 × 844       | [![Antes, móvil](screenshots/teacher-before-mobile.png)](screenshots/teacher-before-mobile.png)        | [![Después, móvil](screenshots/teacher-after-mobile.png)](screenshots/teacher-after-mobile.png)        |

## Validación y límites

Las capturas anteriores proceden de un preview con respuestas simuladas. Allí se recorrieron Inicio, Asignaturas, constructor, roster y Revisiones con 18 asignaturas ficticias y 32 alumnos; se comprobaron listas extensas, vacío, búsqueda, paginación y ancho móvil de 390 px sin desborde. Esas capturas no prueban integración.

Para la revisión de PR #22 se ejecutó además el smoke existente `pilot-cross-service-smoke.mjs` con PostgreSQL descartable, Identity y API reales, cuentas y archivos sintéticos. Un harness temporal permitió abrir el frontend Next autenticado contra esos servicios; se retiró antes de cerrar el corte. En el navegador real se verificaron Inicio, lista y búsqueda, roster, creación y activación de unidad, creación, edición y publicación de un material, entregas y sus dos revisiones, historial y presencia de adjuntos. Una fecha inicial posterior a la final produjo un rechazo real de la API; el editor conservó el título y ambas fechas, y el reintento corrigió el dato y guardó. Una ruta de asignatura fuera del contexto mostró “Asignatura no disponible”. El smoke integrado también descargó evidencia y rechazó el acceso a archivos y recursos de otro tenant y a un docente no asignado. Las pruebas de componentes cubren búsqueda después de la primera página, el enlace “Ver todas”, filtros de Revisiones y descarte de respuestas anteriores al cambio de membresía.

Se ejecutaron contra PostgreSQL real los suites E2E de aprendizaje, dominio académico y entregas/almacenamiento: 30 pruebas aprobadas. El smoke completo de Identity + API concluyó con `PASS`. El navegador sólo tuvo una asignatura docente asignada, por lo que el filtro de varias asignaturas y un cambio real entre dos membresías docentes se validaron con pruebas de componentes, no mediante navegador integrado.

### Defecto backend separado: escritura en año cerrado

Una comprobación adicional contra la API real cerró el año de una asignatura activa con `PATCH /api/v1/academic-years/{id}` y luego hizo `POST /api/v1/learning-units` como docente asignado a esa asignatura. La API respondió **201 Created**, aunque la operación debería rechazarse por el año cerrado. Se reprodujo en PostgreSQL descartable al extender temporalmente el caso `allows assigned teachers to collaborate...` de `learning-domain.e2e-spec.ts`; la aserción `expect(409)` falló con `got 201`. La prueba experimental se retiró del diff porque corregir la autorización exige un cambio en API fuera de este corte. Los E2E existentes sí cubren restricciones estructurales de años cerrados, pero no este comando de aprendizaje. El defecto quedó registrado en [issue #23](https://github.com/Sherydans12/edupay-academico/issues/23). **No publicar hasta resolver y probar este defecto backend**; una restricción sólo visual no reemplazaría la autorización del servidor.

El año académico continúa sin etiqueta legible para docentes, como se indicó arriba. El build de release se verificó con bases HTTPS ficticias de proceso; la sesión integrada utilizó HTTP exclusivamente en loopback y el modo de desarrollo, sin cambiar la validación de producción ni crear `.env.local`.
