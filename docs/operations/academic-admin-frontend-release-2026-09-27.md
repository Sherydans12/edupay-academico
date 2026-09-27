# Release frontend de Administración — 2026-09-27

## Integrado

- PR #20: https://github.com/Sherydans12/edupay-academico/pull/20
- HEAD revisado de la PR: `939e4da0c2e123b075ea13fdf78fd2932be2cea8`.
- Commit integrado en `main`, conservando historia: `d76c6bd3b1e02e753e2509dfed9db09fe38d2840`.
- `quality` y `postgresql-integration` aprobaron para la PR; CI del commit integrado también terminó correctamente.
- El diff contiene la experiencia de Administración, pruebas web, documentación de diseño y sus cuatro capturas sintéticas. No contiene rutas de preview, archivos `.env`, cambios al proveedor de sesión/autenticación ni cambios de API, Identity, BL, workers, migraciones, flags o infraestructura.
- Las capturas de antes y después se muestran en línea en [Administración académica: primer corte](../design/academic-admin-first-cut.md), en pares comparables para escritorio (1440 × 900) y móvil (480 × 844). Se generaron localmente con datos sintéticos; también se comprobó el corte móvil a 390 px.

### Alcance de CI PostgreSQL

El trabajo PostgreSQL de CI ejecutó `pnpm --filter @edupay/api test -- --no-file-parallelism --reporter=verbose` contra un PostgreSQL 15 efímero, después de validar Prisma, generar su cliente y aplicar migraciones existentes. Incluyó E2E de API, incluida la sincronización EduPay: 35 archivos (34 aprobados y 1 omitido), 261 pruebas aprobadas y 8 omitidas. Las 8 omitidas pertenecen a `financial-projection.integrated-http.e2e-spec.ts`, cuyo `describe.runIf` requiere además `TEST_ACADEMIC_DATABASE_URL`, `TEST_BL_DATABASE_URL` y `BL002_BACKEND_ROOT`; ese trabajo sólo provee la base Académico efímera. No es una suite modificada ni requerida por este cambio visual.

Los gates de release/piloto que el workflow reserva para `workflow_dispatch` o la rama `release/pilot-validation` no corrieron en esta PR: gate de release del repositorio, suite PostgreSQL de release separada, contenedor/topología Linux, piloto desechable con ClamAV, bootstrap tenant, sincronización BL y respaldo/restauración. No son cambios de este corte FRONT y no se repitieron suites ajenas al diff.

## Artefacto publicado

- Commit fuente: `d76c6bd3b1e02e753e2509dfed9db09fe38d2840`.
- Construcción: `deploy/Dockerfile.web`, desde un checkout limpio y separado del commit integrado; contexto Docker de 4,41 MB. No había `.env.local`, archivos ignorados locales ni previews en ese checkout. `.dockerignore` excluye `.env`, `.env.local` y variantes.
- Imagen y tag inmutable: `ghcr.io/sherydans12/edupay-academico-web:d76c6bd3b1e02e753e2509dfed9db09fe38d2840`.
- Digest remoto de índice OCI: `sha256:761bbf4d95f881fbf10cde6305f2029097cdcf1573f83c75c029ab4ab401f7a6`.
- Manifest `linux/amd64`: `sha256:a55f340815b4b27cf69ab0b1b8ddccbbd427f62a2e9fbdaad19a51edf37ac9c1`.
- La inspección del artefacto descargado confirmó `org.opencontainers.image.revision=d76c6bd3b1e02e753e2509dfed9db09fe38d2840` y el repositorio de origen esperado. GHCR devolvió el mismo digest remoto.

## Desplegado

- Único recurso actualizado: Coolify `cct0rtf5iku6fkd3t9hldnv4`, `edupay-academico-web-die-20260924`.
- Dominio canónico: `academico.edupay.baselogic.cl`.
- Deployment manual Coolify: `rrgflvmumz5zi1ziol8kxgpf`, iniciado `2026-09-27 17:50:04 UTC`, estado `Success`, duración 1 min 2 s.
- Los logs de despliegue muestran el índice OCI `sha256:761bbf4d95f881fbf10cde6305f2029097cdcf1573f83c75c029ab4ab401f7a6`; el recurso figura `Running`.
- El artefacto activo antes del cambio se capturó desde el deployment entonces activo: `sha256:92538908c98636fecdf3a0f48cadf29289875920398828dbbea2c91155abb47c`, revisión `15d83950a574075956bd8d2e65460c3040c4010d`. Se descargó e inspeccionó desde GHCR para confirmar la revisión.
- Para rollback sólo de FRONT en este recurso: en General mantener el repositorio de imagen y cambiar el tag a `sha256-92538908c98636fecdf3a0f48cadf29289875920398828dbbea2c91155abb47c`; guardar ese tag y ejecutar Actions → Redeploy. Verificar en los logs el digest anterior, `Running`, `/api/health` y `/login`. No usar ni reactivar otro recurso. El historial Coolify conserva ambos despliegues.

El recurso mantiene la imagen preconstruida, dominio canónico, puerto expuesto `3000`, red Docker `coolify`, healthcheck de imagen `GET /api/health` y publicación manual (`autoDeploy=false`). Sólo se guardó el tag de imagen; no se cambiaron URLs, dominio, red, puerto, healthcheck ni campos ajenos al release. `www.academico.edupay.baselogic.cl` continúa con su discrepancia DNS anterior y queda fuera de este cambio.

En la inspección posterior, el tag mostrado en General coincide con el artefacto activo y el screenshot no presenta aviso visible de cambios. El árbol de accesibilidad conserva un mensaje genérico oculto de estado `wire:dirty`; no hay diferencia operativa entre el tag mostrado y el deployment activo. No se usaron Reset ni guardados adicionales.

## Comprobaciones posteriores

- `https://academico.edupay.baselogic.cl/api/health`: HTTP 200 y estado `ok`.
- `/login`: HTTP 200, título `EduPay Académico`; los 11 assets CSS/JS de la página responden HTTP 200. El bundle conserva las bases públicas correctas de API e Identity.
- `/administracion`, `/administracion/configuracion`, `/die`, `/docente` y `/estudiante`: rutas servidas por el frontend. Administración autenticada existente revisada visualmente en escritorio y 390 × 844; contenido de documento y body de 375 px, sin overflow horizontal.
- DIE se abrió en la sesión existente de administración sólo para revisar el shell y sus destinos: Alumnos, Hoja de vida, Pendientes, Equipo y Perfil, además de la navegación compartida. No se abrieron alumnos ni registros.
- El build incluye Administración, DIE, Docencia y Estudiante. La navegación de Docencia y Estudiante no se comprobó dentro de una sesión de esos roles: sólo había una sesión autorizada de Administración. No se ingresaron credenciales, no se crearon ni modificaron datos y no se alteraron servicios ajenos al FRONT.
- Capturas visuales comparables sintéticas de Administración: [antes y después, escritorio y móvil](../design/academic-admin-first-cut.md). Las capturas productivas no se guardaron porque muestran contexto institucional real; la comprobación se hizo en vivo y de sólo lectura.

## Siguientes cortes recomendados

1. **Docencia:** revisión diaria, trabajo pendiente y claridad del contexto de curso/asignatura; conservar navegación y estados compartidos.
2. **Estudiante:** acceso móvil a asignaturas, calendario y entregas, con fechas y estados visibles.
3. **Administración:** observar el uso del nuevo patrón de estructura y personas; extender configuración sólo cuando exista contrato backend para nuevos datos institucionales.

Este cierre distingue el commit **integrado** (`d76c6bd…`) del artefacto **desplegado** (digest OCI `761bbf…`) y del recurso productivo indicado arriba. No representa un rediseño completo de Académico.
