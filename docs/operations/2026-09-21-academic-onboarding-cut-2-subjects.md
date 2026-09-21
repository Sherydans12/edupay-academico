# Academic onboarding cut 2 — asignaturas y asociaciones por curso

Estado: implementación propuesta en PR; sin despliegue ni migraciones
productivas.

## Validación heredada

El usuario confirmó que el indicador de Onboarding 1 funciona correctamente.
`READY` conserva su significado acotado: año académico y cursos preparados.
Este corte muestra el avance de asignaturas por separado y no cambia ese
indicador ni declara completo el colegio.

## Alcance implementado

El recorrido de TENANT_ADMIN en `/administracion/estructura` queda organizado
por un contexto explícito:

1. Seleccionar año académico.
2. Seleccionar curso dentro de ese año.
3. Revisar el catálogo de asignaturas activas.
4. Asociar una asignatura al curso, definir orden y alcance general.
5. Consultar asociaciones activas y archivadas, con acciones de configuración,
   archivo y gestión de profesores cuando el año/curso sea mutable.
6. Revisar una cobertura derivada acotada al año: cursos sin asociación activa
   aparecen como acciones pendientes, sin convertir esa observación en una
   obligatoriedad de dominio.

La interfaz refresca los datos después de las mutaciones existentes y no
mantiene un curso seleccionado fuera del año visible. En años cerrados o
archivados presenta la historia en solo lectura y no ofrece mutaciones.

## Capacidades y contratos reutilizados

No se agregó una entidad, persistencia ni endpoint. Se reutilizan:

- `GET/POST/PATCH /api/v1/subjects` para el catálogo tenant-scoped.
- `GET/POST/PATCH /api/v1/course-subjects` para listar, asociar y configurar
  relaciones por curso.
- El contexto actual de Identity, `TENANT_ADMIN` y la capacidad
  `AdministerAcademicStructure` ya aplicados por el API.
- Auditoría existente de `Subject` y `CourseSubject`.

La regla PostgreSQL existente es un índice único parcial sobre
`(tenant_id, course_id, subject_id) WHERE status = 'ACTIVE'`. Por eso una
segunda asociación activa devuelve conflicto, una asociación archivada
conserva historia y luego puede existir una nueva activa; no se promete
unicidad global entre tenants ni entre estados históricos.

No se agregó una regla de asignaturas obligatorias, una dependencia de BL,
mappings, sincronización, SYSTEM_ADMIN implícito ni borrado de historia.

## Validaciones y pruebas del corte

La prueba HTTP PostgreSQL del dominio cubre con datos sintéticos:

- alta y lectura de una asignatura asociada al curso;
- lectura vacía y escritura rechazada al cruzar tenant;
- rechazo de duplicado activo;
- archivo y recreación activa conservando dos filas históricas;
- rechazo de nuevas asociaciones y cambios cuando el año está cerrado;
- rechazo para `TEACHER`, `SYSTEM_ADMIN` sin contexto elevado y el indicador
  de preparación cuando la membresía tenant queda revocada; las rutas de
  administración conservan las comprobaciones de capacidad existentes.

La suite web cubre el contexto año/curso, el avance separado de asignaturas y
la presentación en solo lectura de un año cerrado. Los checks completos quedan
en la PR junto con lint, typecheck, tests y build.

## Límites operativos

Este cambio no toca producción, Identity, BL, Registry, workers, flags de
proyección, secretos ni migraciones. La proyección continúa apagada. Las
pruebas usan fixtures sintéticos y no crean ni activan datos reales.
