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

- Las capturas visuales de inicio antes/después, entregas, calendario y detalle se revisaron en navegador local con datos ficticios y respuestas simuladas. El banner de la captura identifica esos datos. No son pruebas integradas ni contienen datos personales. Se revisó el breakpoint móvil de 680 px en CSS, pero no se pudo capturar un viewport móvil real en esta sesión.
- `pnpm db:generate` se ejecutó según el flujo de CI para preparar el cliente local ignorado por Git.
- `pnpm test`: pasó (26 archivos web, 162 pruebas; 28 archivos API, 208 pruebas; 7 archivos y 64 pruebas omitidos por el entorno).
- `pnpm lint`: pasó, con 12 advertencias preexistentes en `course-builder`.
- `pnpm typecheck`: pasó.
- `pnpm build`: pasó con endpoints HTTPS `.invalid` de CI. La primera ejecución local falló porque no tenía las variables públicas de URL configuradas.
- El smoke con Identity/API reales no se ejecutó: el checkout principal de EduPay Identity tiene cambios de usuario y el worktree limpio disponible está desactualizado. Se dejó intacto para proteger trabajo ajeno. Por ello no se afirma verificación integrada de sesión real, cambio de tenant ni autorización de archivos ajenos en este corte.

## Pendientes reales

### Frontend

- Mostrar una etiqueta legible de año académico cuando exista un contrato/dato disponible; no calcularla a partir de nombres, IDs o fechas.
- Completar una captura y verificación visual en viewport móvil real; en este corte sólo se inspeccionaron las reglas responsive del breakpoint de 680 px.

### Backend

- No se reprodujo un defecto backend y no se modificó backend. Para completar la prueba integrada, hace falta un checkout limpio de Identity en la versión fijada por el piloto.
