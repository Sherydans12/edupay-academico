# Administración académica por tarea

Fecha: 2026-11-16. Reemplaza la organización por área descrita en
[Administración académica: primer corte](academic-admin-first-cut.md), que se
conserva como registro histórico.

## Problema

La administración reunía en pocas pantallas tareas de naturaleza distinta.
«Estructura» mezclaba años, cursos, roster, catálogo, asociaciones, preparación
y matrículas por revisar; «Personas» incluía la incorporación de alumnos y una
pestaña de inscripciones con tres formularios. La pantalla de resumen repetía
cifras y enlaces sin indicar qué hacer. Toda la interfaz estaba en un solo
archivo de unas 5.000 líneas. Con dos años abiertos (2026 activo y 2027 en
preparación), además, no quedaba claro qué estaba activo ni con qué año se
trabajaba.

## Organización

Todas las pantallas muestran arriba el **año en contexto** (nombre, fechas,
estado y selector). Las listas y formularios trabajan sobre ese año.

| Menú          | Ruta                            | Contenido                                                                                                                                                                                                                          |
| ------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inicio        | `/administracion`               | «Qué hacer ahora»: pendientes del año con enlace a la pantalla que los resuelve; tareas frecuentes; «Preparar {año siguiente}»; panorama del año; «Estado del sistema» plegado (preparación base, sincronización, almacenamiento). |
| Cursos        | `/administracion/estructura`    | Cursos del año en contexto con detalle por curso (Alumnos; Asignaturas y profesores). Pestañas secundarias: Años académicos y Catálogo de asignaturas.                                                                             |
| Matrículas    | `/administracion/matriculas`    | Incorporar alumno nuevo · Matricular alumno existente · Avance anual · Por revisar. `?seccion=incorporar\|matricular\|avance\|revisar` abre la sección.                                                                            |
| Personas      | `/administracion/personas`      | Directorio de alumnos y profesores, con el curso del año en contexto y el acceso a la plataforma.                                                                                                                                  |
| Configuración | `/administracion/configuracion` | Sin cambios.                                                                                                                                                                                                                       |

En móvil, la barra inferior muestra Inicio, Matrículas y Personas.

## Decisiones

- **Siguiente paso primero.** Inicio solo muestra pendientes calculados con los
  datos ya cargados: cursos del año sin asignaturas activas, cursos en borrador
  en un año activo, año sin cursos y matrículas por revisar (conteo del API).
  La preparación base aparece arriba solo si requiere atención; si está lista,
  pasa a «Estado del sistema». Se eliminaron las cifras duplicadas.
- **Cursos como lista y detalle.** La lista indica estado y «Sin asignaturas»
  con texto e ícono, no solo color. «Nuevo curso» y «Nuevo año» se abren en un
  diálogo; el curso se crea en el año en contexto. En móvil la lista se
  reemplaza por un selector.
- **Matrícula acotada al año.** «Matricular alumno existente» solo ofrece cursos
  del año en contexto. La asignación directa de una asignatura
  (`StudentSubjectEnrollment`) queda como excepción plegada. La asignación de
  profesores vive en el detalle del curso.
- **Personas como directorio.** La columna «Curso {año}» usa
  `GET /students?academicYearId=` (ver
  [modelo académico](../architecture/academic-model.md)); mientras llega
  muestra «Cargando…», no «Sin matrícula».
- **Guardar sin perder el lugar.** Los guardados refrescan los datos en segundo
  plano: la pantalla conserva pestaña, curso y filtros.
- **Años cerrados o archivados.** Se consultan en solo lectura: sin «Nuevo
  curso», sin activar cursos y sin formularios de matrícula.

Se mantienen permisos, contratos y reglas de negocio. El único cambio de API es
el parámetro opcional `academicYearId` del listado de alumnos. La web nueva usa
ese parámetro y su contrato estricto, así que el API debe desplegarse antes que
la web.

## Código

`apps/web/src/features/academic-admin/` reemplaza el archivo único:

| Módulo                 | Responsabilidad                                        |
| ---------------------- | ------------------------------------------------------ |
| `index.tsx`            | Pantalla, encabezados y vista por ruta                 |
| `shared.tsx`           | Carga de datos, estados y pestañas accesibles          |
| `year-context.tsx`     | Año en contexto y formulario de año                    |
| `overview.tsx`         | Inicio                                                 |
| `courses.tsx`          | Cursos: lista, detalle, años y catálogo                |
| `structure.tsx`        | Formularios de curso, catálogo y asignaturas por curso |
| `enrollments-view.tsx` | Matrículas por sección                                 |
| `enrollments.tsx`      | Roster, baja de matrícula y matrículas por revisar     |
| `course-promotion.tsx` | Avance anual de un curso                               |
| `enroll-existing.tsx`  | Matrícula de alumnos existentes y asignatura directa   |
| `people.tsx`           | Personas                                               |
| `preparation.tsx`      | Preparación académica base                             |

## Verificación

La revisión visual se hizo en un preview local con un cliente sintético en
memoria (sin API ni datos reales) a 1366 px y 375 px, sin desplazamiento
horizontal. Ese arnés no forma parte del cambio.
