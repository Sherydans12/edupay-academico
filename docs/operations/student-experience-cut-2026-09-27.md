# Corte de experiencia del estudiante

Fecha: 2026-09-27
Base: `origin/main` en `2b8d1c1da1d3fb36611dec76e56a7a7bfc3fc288`.

## Cambios

- El inicio prioriza la siguiente actividad que requiere acción e incluye curso, asignatura, fecha y estado. Actividades enviadas o revisadas no se presentan como pendientes; si el estado no se puede consultar, se indica como desconocido.
- Asignaturas, entregas y calendario incorporan búsqueda, filtros donde aplican y paginación, limitados al contexto de matrícula y a contenidos visibles.
- El calendario y las fechas del flujo de entrega usan la zona operativa del tenant. La fecha y la condición de atraso siguen siendo las entregadas por el servidor.
- El detalle de actividad expone curso, instrucciones, plazo, historial y comentarios disponibles. El formulario conserva archivos y comentario ante errores y verifica el estado del servidor antes de permitir otro envío cuando la respuesta del envío se pierde.
- Se mantiene la inmutabilidad de revisiones enviadas. No se agregaron funciones de reemplazo, eliminación o edición posterior.

No se infiere el año académico. Su etiqueta legible sigue siendo un pendiente independiente.

## Evidencia

- La auditoría visual breve se hizo en el navegador local con datos ficticios y respuestas simuladas, identificadas por un banner. Se inspeccionaron inicio, asignaturas y página 2, entregas y página 2, calendario con filtros/zona horaria, detalle, formulario de archivos y revisión con comentarios. Estas capturas/observaciones son sólo sintéticas; no prueban integración con Identity/API ni contienen datos personales.
- En la primera pasada visual, el menú lateral cerrado en móvil seguía presente en el árbol de accesibilidad aunque estuviera fuera del viewport. Se corrigió con `visibility` sincronizada con la transición. En la segunda pasada a 654 px, los enlaces desaparecen del árbol al cerrar; al abrir, el menú y los enlaces se muestran y el control de cierre lo oculta. Se comprobó foco visible del enlace “Saltar al contenido” con teclado y no se observó overflow horizontal en esa anchura.
- El navegador/CUA disponible no expone un override de viewport ni exportación de capturas a archivos. La pasada móvil real quedó en 654 px, no 390 px; por tanto 390 px y archivos de captura PNG antes/después siguen pendientes y no se consideran validados. Las imágenes sintéticas sí quedaron inspeccionadas en las observaciones del navegador durante esta sesión.
- Los tests de componentes ya existentes verifican con servicios simulados el reintento de un archivo fallido sin recargar los ya enviados y la reconciliación de una respuesta de envío perdida contra el ID de archivo correcto antes de habilitar otro envío. No son pruebas integradas.
- `pnpm db:generate` se ejecutó según el flujo de CI para preparar el cliente local ignorado por Git.
- `pnpm test`: pasó (26 archivos web, 162 pruebas; 28 archivos API, 208 pruebas; 7 archivos y 64 pruebas omitidos por el entorno). Vitest registró mensajes no implementados de navegación del entorno web; no fallaron pruebas.
- `pnpm lint`: pasó, con 12 advertencias preexistentes y fuera del alcance en `course-builder`.
- `pnpm typecheck`: pasó.
- `pnpm build`: pasó en todo el workspace con endpoints HTTPS `.invalid` de CI.
- Se creó el worktree limpio de Identity en `98da17b013c9fbf74f618a2f54e0eea8779c5136`, versión fijada por el piloto; no se modificaron el checkout Identity principal ni los worktrees ajenos. `pnpm pilot:e2e` preparó servicios reales y dos PostgreSQL desechables, pero se detuvo en el bootstrap sintético antes del login del estudiante: `scripts/pilot-cross-service-smoke.mjs` crea un rol `STAFF` para Identity mientras el enum `RoleCode` de esa revisión sólo contiene `SYSTEM_ADMIN`, `TENANT_ADMIN`, `TEACHER`, `STUDENT` y `GUARDIAN`. PostgreSQL devuelve `invalid input value for enum "RoleCode": "STAFF"` en el INSERT de `bootstrapIdentity()` (líneas 833–835). Es reproducible en ese harness/contrato fijado; no demuestra un defecto de un endpoint de estudiante. No se alteró backend/harness ni se afirma validación integrada de entregas, tenant, cambio de membresía o rechazo de archivos/asignaturas ajenos.

## Pendientes reales

### Frontend

- Mostrar una etiqueta legible de año académico cuando exista un contrato/dato disponible; no calcularla a partir de nombres, IDs o fechas.
- Repetir la verificación visual en viewport de 390 px y guardar capturas sintéticas PNG antes/después; en esta sesión sólo fue posible inspeccionar 654 px mediante el navegador disponible.

### Backend

- Alinear el fixture/bootstrap del smoke con los roles válidos de Identity en `98da17b013c9fbf74f618a2f54e0eea8779c5136` (reproducción y error exactos arriba). Es una corrección independiente de harness/backend; no se cambió dentro del corte frontend. Tras resolverla, repetir el flujo integrado completo con datos sintéticos para comprobar entrega/adjuntos, error y recuperación, resultado incierto, cambio de membresía y denegación de recursos ajenos.
