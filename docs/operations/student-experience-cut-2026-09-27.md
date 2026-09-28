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

- La auditoría visual inicial se hizo en navegador local con datos ficticios y respuestas simuladas, identificadas por un banner. Se inspeccionaron inicio, asignaturas y página 2, entregas y página 2, calendario con filtros/zona horaria, detalle, formulario de archivos y revisión con comentarios. Esas observaciones son sintéticas y no prueban integración con Identity/API.
- El 2026-09-28 se cerró la comprobación visual integrada en un navegador con emulación móvil: el viewport medido desde la página fue `innerWidth=390`, `innerHeight=844`. La sesión era un estudiante sintético autenticado por el flujo normal contra Identity `93418b68eaf41976b4bc695039afcbc8eab4fdbc`; Académico y PostgreSQL también eran servicios locales desechables. No se hizo envío ni carga de archivo durante esta inspección. El `pilot:e2e` completo ya había pasado antes; para esta vista se usó su bootstrap compatible en modo de pausa y se cerró al terminar.
- Se pararon la web y ambos contenedores PostgreSQL; se quitaron los dos volúmenes efímeros y los puertos locales dejaron de escuchar. La ejecución interrumpida dejó su carpeta temporal de fixture en `C:\Users\nicol\AppData\Local\Temp\edupay-pilot-cross-service-FLgTB1`; la herramienta de terminal rechazó eliminarla por política local, por lo que el borrado manual de esa carpeta es la única limpieza pendiente.
- En esa pasada final se observaron el menú móvil, calendario con una entrega y filtros de búsqueda/asignatura, y el formulario de entrega en su estado pendiente. El buscador y filtro conservaron el resultado de prueba. El menú mueve el foco a “Inicio”, Escape lo cierra y devuelve el foco al botón. La fecha/estado visibles fueron los entregados por el servicio. `documentElement.scrollWidth` coincidió con el ancho de contenido disponible; no hubo overflow horizontal. El envío siguió deshabilitado sin archivo. Las capturas se mostraron directamente en la inspección del navegador; la herramienta no ofrece exportarlas a un archivo local.
- La pasada encontró texto interno `CourseSubject`, una discordancia singular/plural y un defecto de teclado en el menú. Se corrigieron los textos de estudiante y el conteo, y el menú ahora tiene destino ARIA, enfoca el primer enlace al abrir y cierra con Escape restaurando el foco. El test compartido de `AppShell` cubre este flujo; DIE, Administración y Docencia conservan el mismo shell.
- Los tests de componentes ya existentes verifican con servicios simulados el reintento de un archivo fallido sin recargar los ya enviados y la reconciliación de una respuesta de envío perdida contra el ID de archivo correcto antes de habilitar otro envío. No son pruebas integradas.
- `pnpm db:generate` se ejecutó según el flujo de CI para preparar el cliente local ignorado por Git.
- `pnpm test`: pasó (26 archivos web, 162 pruebas; 28 archivos API, 208 pruebas; 7 archivos y 64 pruebas omitidos por el entorno). Vitest registró mensajes no implementados de navegación del entorno web; no fallaron pruebas.
- `pnpm lint`: pasó, con 12 advertencias preexistentes y fuera del alcance en `course-builder`.
- `pnpm typecheck`: pasó.
- `pnpm build`: pasó en todo el workspace con endpoints HTTPS `.invalid` de CI.
- El cierre DIE `docs/operations/die-release-closeout-2026-09-24.md` fija la revisión Identity aprobada `93418b68eaf41976b4bc695039afcbc8eab4fdbc`. Se verificó en el repositorio que contiene `20260924000000_add_staff_role` y la migración histórica `20260831000000_provisioning_idempotency_receipts` (checksum `c615b7fd9db0ea642ad08fa5981f498dd9a73e97b9db7c0d2d0d2d7cd53eb68b`). El workflow de release del piloto tenía seis referencias a la revisión anterior; se corrigieron sólo esos pins en un commit separado, sin cambiar fixtures ni reglas.
- Se preparó el worktree limpio `C:\\Users\\nicol\\Documents\\EduPayIdentity-worktrees\\student-smoke-staff-20260928` en la rama de validación y SHA exacto anterior. `pnpm pilot:e2e` pasó dos veces con Identity, Académico API, trabajador de correo falso y dos PostgreSQL 15 desechables; las migraciones se aplicaron sólo a esas bases efímeras. Una pasada adicional activó el ClamAV desechable y su gate de fallo: archivos limpios aceptados, EICAR sintético rechazado sin publicar blob y caída del scanner rechazada en modo fail-closed. Se validaron login real de estudiante, membership activa, asignatura efectiva, contenido publicado, dos archivos, cuota y comentario; payload inválido `400` y envío válido posterior `201`; revisión solicitando cambios y segunda revisión inmutable; estado final `REVIEWED`, feedback/notificaciones sin eventos duplicados, denegación de profesor/alumno/tenant ajeno, archivos ajenos, credencial de servicio incorrecta y sesión revocada. El script cerró staging y contenedores.
- La prueba integrada no corta una respuesta HTTP ya confirmada por el servidor. La respuesta incierta se cubre en la prueba de componente simulada `reconciles a lost submit response with the server before allowing another send`: primero `404`, luego recupera la entrega que incluye el ID del archivo intentado, muestra confirmación, hace un solo POST y no vuelve a mostrar controles de envío. Otra prueba simulada impide reenvío libre tras `REVIEWED`; el smoke real finaliza con exactamente dos revisiones, una solicitada por el docente y una final. La prueba de componentes de Identity compartida cubre ocultar datos del tenant anterior mientras cambia la membership. La prueba real autenticó usuarios en tenants A/B y rechazó recursos/archivos cruzados, aunque no cambió el tenant activo de un mismo estudiante. No se presenta ninguna prueba simulada como integración.

## Pendientes reales

### Frontend

- Mostrar una etiqueta legible de año académico cuando exista un contrato/dato disponible; no calcularla a partir de nombres, IDs o fechas.
- El smoke real no simula pérdida de respuesta de un envío ya comprometido; esa reconciliación se verifica con respuestas simuladas en la prueba del frontend.

### Backend

- No queda un defecto backend reproducido. El pin del runner de validación se corrigió para usar la Identity compatible; no hubo cambios funcionales de Identity/API ni cambios de base de producción.
