# Recuperación del frontend Académico

El usuario confirmó que las pantallas pendientes de Entregas y Calendario del
estudiante, administración, aprovisionamiento de cuentas y ajustes visuales del
worktree `course-builder-evolution` eran las actualizaciones esperadas y autorizó
su inclusión. Se recuperaron sus archivos en una rama y worktree independientes
basados en `ebb879da646d14c48a7fc2f8b1f5d7e6fb4059e2`; el worktree original no se
modificó. Esta publicación conserva el transporte de login corregido y sus
pruebas, el Dockerfile con target `runtime` y la separación de dominios.

## Compatibilidad y alcance

- Solo frontend, componentes UI y lectura opcional de `totalCount` en seis
  esquemas de respuesta. La API actual puede omitirlo; la UI conserva su fallback
  y paginación por cursor. No se modifica el contrato servido por la API ni la
  autorización académica o de Identity.
- La API mantiene el digest pinned aprobado, basado en `b2f489f`. No se publican
  los cambios locales de reconciliación/borrado de almacenamiento ni el productor
  de proyecciones financieras de otra rama.
- No hay migraciones, cambios de esquema, scripts de datos o configuración de
  Identity en este release. La reparación aditiva ya autorizada se documenta por
  separado en el registro operativo privado.
- Se omiten dos bloques de diagnóstico que imprimían errores completos de
  autenticación. Se conservan los mensajes de error visibles para el usuario.
- La redirección por rol también bloquea el montaje de la pantalla incompatible
  mientras navega; la API sigue siendo la autoridad de autorización.

## Gates y rollback

La suite web cubre las pantallas recuperadas, lectura de respuestas de API,
sesiones, transporte nativo de fetch y aprovisionamiento con datos sintéticos.
Se añadieron pruebas de entrada por `/`, sesión caducada y bloqueo de una vista
docente para una sesión de estudiante. Una prueba de guardado ahora espera el
restablecimiento asíncrono del formulario antes de verificar `beforeunload`.

El despliegue afecta exclusivamente al recurso Academic FRONT
`qf65r4ltig6jhb6t8dmv2qyw`, dominio `academico.edupay.baselogic.cl`, puerto 3000,
health HTTP `127.0.0.1:3000/login`. La imagen anterior y la configuración se
conservan para volver únicamente este recurso a `ebb879d` si falla un gate.
La evidencia operativa registra el SHA final, deployment, resultados y backup.
