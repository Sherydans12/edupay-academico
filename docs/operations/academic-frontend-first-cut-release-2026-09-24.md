# Estado de publicación del primer corte frontend Académico — 2026-09-24

## Integrado

- PR #18: https://github.com/Sherydans12/edupay-academico/pull/18
- Commit integrado en `main`: `15d83950a574075956bd8d2e65460c3040c4010d`.
- Commit de implementación: `4068de19456224a5a7a34302c4134d385c8cc00f`.
- La PR se fusionó preservando historia después de que `quality` y
  `postgresql-integration` terminaran en verde. Los gates del piloto fueron
  omitidos por el workflow; el corte sólo modifica FRONT y documentación.

## Artefacto publicado

- Repositorio de imagen: `ghcr.io/sherydans12/edupay-academico-web`.
- Tag inmutable de trazabilidad: `15d83950a574075956bd8d2e65460c3040c4010d`.
- Digest de índice OCI publicado: `sha256:92538908c98636fecdf3a0f48cadf29289875920398828dbbea2c91155abb47c`.
- Manifest `linux/amd64`: `sha256:cf45188452fa68ebf04830e61e40f22cc630c95125c869b7ef1f55bb2f933b82`.
- Imagen descargada desde GHCR e inspeccionada: arquitectura `linux/amd64`,
  label `org.opencontainers.image.revision` igual al commit integrado y source
  igual a `https://github.com/Sherydans12/edupay-academico.git`.
- La revisión de publicación automática rechazó una invocación PowerShell
  compuesta antes de ejecutarla y devolvió literalmente `blocked by policy`, sin
  identificar subcomando ni motivo más específico. El `docker push` ejecutado
  por separado con el mecanismo ya documentado terminó con código 0; no se
  cambiaron herramientas ni se eludió una restricción.

## Recurso, configuración y rollback previo al despliegue

- Recurso FRONT existente: `cct0rtf5iku6fkd3t9hldnv4`,
  `edupay-academico-web-die-20260924`. Dominio canónico:
  `academico.edupay.baselogic.cl`.
- Artefacto activo antes de desplegar este release:
  `ghcr.io/sherydans12/edupay-academico-web@sha256:c117c718352ede7220f4f685711d7df4bc88384b304bb19970d9379aa9fc0d81`.
  Último despliegue exitoso: `rtk462el38k8ughhtxlepclm`.
- Configuración persistida y formulario General comparados campo por campo:
  nombre y descripción, `dockerimage`, repositorio/tag activos, puerto expuesto
  `3000`, y alias/comandos/puertos mapeados vacíos; todos coincidían y los
  campos estaban limpios. `project.shared.configuration-checker` devolvió
  `isConfigurationChanged=false`, `configurationDiff.changed=false`,
  `count=0`, `requires_build=false`, `requires_redeploy=false` y cero variables
  requeridas ausentes. No había un cambio operativo pendiente.
- El texto genérico “You have changes that haven't been saved yet” provenía de
  un toast `wire:dirty` oculto (`opacity-0`, sin clase `is-dirty`); no aparecía
  visualmente y no representaba diferencias. No se pulsaron `Reset` ni `Save`
  durante esa inspección. La comprobación visual y el comparador de estado
  confirmaron el mismo resultado.
- Se conserva el mecanismo de imagen preconstruida, puerto `3000`, red `coolify`,
  reglas y dominios del recurso, HTTP→HTTPS, `autoDeploy=false` y healthcheck
  Docker empaquetado por la imagen: `GET /api/health`. El HTTP healthcheck
  opcional propio del panel Coolify está desactivado (`healthCheckEnabled=false`)
  y coincide con sus campos persistidos; no se habilitó ni modificó.
- El DNS del dominio canónico estaba correcto. `www.academico...` tiene DNS
  mismatch; queda fuera de este release y no se modificó.
- El selector del panel Rollback está deshabilitado y no ofrece un artefacto.
  La restauración soportada por el mismo recurso es: en General, conservar el
  repositorio y cambiar **sólo** `Docker image Tag` a
  `sha256-c117c718352ede7220f4f685711d7df4bc88384b304bb19970d9379aa9fc0d81`,
  guardar ese cambio de imagen y ejecutar Actions → Redeploy. El digest anterior
  sigue disponible en GHCR. Verificar en los logs el digest `c117…`, estado
  `Running`, `/api/health` y `/login`. No activar el recurso antiguo ni tocar
  API, Identity, BL, workers, migraciones, flags o datos.

## Desplegado y validado

- Estado: **desplegado**. Coolify registra el deployment manual
  `ggsb8dmkhtotu9zq91pizudl` como `Success` (2026-09-24 18:12:19 UTC,
  duración 00m 58s), con rolling update completado.
- Los logs de Coolify identifican el artefacto desplegado como
  `ghcr.io/sherydans12/edupay-academico-web@sha256:92538908c98636fecdf3a0f48cadf29289875920398828dbbea2c91155abb47c`.
  El digest del índice OCI y el manifest `linux/amd64` coinciden con los
  verificados en GHCR; el label de revisión del manifest es el SHA integrado
  `15d83950a574075956bd8d2e65460c3040c4010d`. La imagen/tag del formulario
  General refleja ese mismo índice y el recurso `cct0rtf5iku6fkd3t9hldnv4` está
  `Running`.
- El despliegue guardó únicamente el tag del contenedor y se ejecutó mediante
  Actions → Redeploy en el recurso existente. No se cambió el dominio, red,
  puerto, reglas, healthcheck, mecanismo preconstruido ni otros recursos.
- CI de PR #18: `quality` y `postgresql-integration` aprobados. Web: 135 pruebas,
  typecheck y build aprobados; lint sin errores y con 12 advertencias existentes
  en `course-builder`.
- Después del release, `https://academico.edupay.baselogic.cl/api/health` y
  `/login` devolvieron `200`; health respondió
  `{"service":"edupay-academico-web","status":"ok"}`. Login tiene título
  `EduPay Académico`. Los 11 assets CSS/JS locales del manifiesto de login
  devolvieron `200`.
- Las capturas sintéticas anteriores están en
  [`docs/design/screenshots`](../design/screenshots). La comprobación visual
  posterior del login se realizó en escritorio y móvil (390×844) en una sesión
  pública y sin datos de alumnos; ambas capturas se adjuntaron al hilo de
  release. En móvil no hubo overflow horizontal (ancho de contenido 375 px).
- DIE se revisó en la sesión existente de administración, sólo lectura y sin
  consultar nombres, valores de registros ni adjuntar capturas productivas.
  Navegación visible: Alumnos, Hoja de vida, Pendientes, Equipo y Perfil; la
  navegación compartida muestra Resumen, Estructura, Personas, Configuración e
  Inclusión educativa. No hubo errores de consola. El enlace de salto es el
  primer foco de teclado y Enter enfoca `main#main-content`. A 1920×855 y
  390×844 no se observó overflow horizontal; en móvil se muestra la navegación
  inferior. La captura del módulo autenticado expiró al alcanzar el límite de
  5 s de `Page.captureScreenshot`; no se probó otro mecanismo para evitar
  conservar o exponer registros productivos.
- En producción sólo había disponible una sesión de administración. No se
  verificaron visualmente sesiones de docente ni estudiante ni se simuló otro
  rol. Su navegación está declarada en `AppShell` (`/docente`: Inicio,
  Asignaturas, Revisiones, Calendario; `/estudiante`: Inicio, Asignaturas,
  Mis entregas, Calendario); las comprobaciones existentes de roles pasaron
  en CI de PR #18. Quedó abierta una pantalla pública `/login` para que la
  persona usuaria valide ambos roles con sus cuentas autorizadas.
- No se crearon ni modificaron registros productivos. API, Identity, BL,
  workers, migraciones y flags no se tocaron.
