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
  durante esa inspección. Las capturas visuales y el comparador de estado
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

## Despliegue y validación

- Estado: **pendiente**. La publicación en GHCR está completa y verificada; el
  digest `925389…` aún no se declara desplegado. El artefacto activo sigue siendo
  `c117…` hasta confirmar la actualización del recurso y el smoke test.
- Resource UUID objetivo: `cct0rtf5iku6fkd3t9hldnv4`. El despliegue se hará por
  Coolify sobre ese recurso y actualizando únicamente el tag de la imagen.
- CI de PR #18: `quality` y `postgresql-integration` aprobados. Web: 135 pruebas,
  typecheck y build aprobados; lint sin errores y con 12 advertencias existentes
  en `course-builder`.
- Antes del release, el host público devolvió `200` en `/api/health` y `/login`;
  son línea base anterior al nuevo despliegue.
- Las capturas sintéticas anteriores están en
  [`docs/design/screenshots`](../design/screenshots). La comprobación visual
  posterior, health/login/assets, navegación de roles y DIE en escritorio y
  móvil se registrarán aquí tras el despliegue. Producción sólo se inspeccionará
  en modo lectura; no se crearán ni modificarán registros. Si falta sesión
  autorizada para DIE o un rol, se dejará la pantalla lista para que la persona
  usuaria inicie sesión.

No se modificaron registros productivos ni servicios fuera de FRONT.
