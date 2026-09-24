# Estado de publicación del primer corte frontend Académico — 2026-09-24

## Integración

- PR #18: https://github.com/Sherydans12/edupay-academico/pull/18
- Commit integrado en `main`: `15d83950a574075956bd8d2e65460c3040c4010d`.
- Commit de implementación: `4068de19456224a5a7a34302c4134d385c8cc00f`.
- La PR se fusionó preservando historia después de que `quality` y
  `postgresql-integration` terminaran en verde. Los gates del piloto fueron
  omitidos por el workflow; el corte sólo modifica FRONT y documentación.

## Artefacto y destino

- Recurso objetivo solicitado: `cct0rtf5iku6fkd3t9hldnv4`.
- Dominio objetivo: `academico.edupay.baselogic.cl`.
- El código integrado se construyó localmente con `deploy/Dockerfile.web`,
  plataforma `linux/amd64`, y las bases públicas documentadas para Académico
  API (`https://academico-api.edupay.baselogic.cl/api/v1`) e Identity
  (`https://identity.edupay.baselogic.cl`). El label de revisión es el SHA
  integrado indicado arriba.
- ID local del build: `sha256:92538908c98636fecdf3a0f48cadf29289875920398828dbbea2c91155abb47c`.
  Es una imagen cargada al daemon Docker local, **no** un digest de GHCR ni un
  digest desplegado. No se publicó la imagen.
- No hubo despliegue ni cambio de configuración en Coolify. Por tanto, no hay
  digest nuevo desplegado. El inventario del repositorio registra como último
  artefacto previo `ghcr.io/sherydans12/edupay-academico-web@sha256:c117c718352ede7220f4f685711d7df4bc88384b304bb19970d9379aa9fc0d81`; no se
  reconfirmó que sea el digest activo en Coolify durante esta revisión. El
  manifiesto todavía existe en GHCR (`docker buildx imagetools inspect`, con
  plataforma `linux/amd64` y su manifiesto de attestation), así que es un
  candidato de rollback disponible, pero su relación con el recurso vivo y su
  configuración no se capturó en esta revisión.

## Validación disponible

- CI de la PR: `quality` y `postgresql-integration` aprobados.
- Web: 135 pruebas, typecheck y build aprobados; lint sin errores y con 12
  advertencias existentes en `course-builder`.
- Docker: build del contenedor `runtime` completado; labels de source y revisión,
  arquitectura y healthcheck de imagen inspeccionados localmente.
- Antes de cualquier publicación, el host público devolvió `200` en
  `/api/health` y `/login`. Son lecturas de línea base anteriores a un
  despliegue, no validaciones del nuevo artefacto.
- Las capturas sintéticas anteriores están en
  [`docs/design/screenshots`](../design/screenshots). No se generaron capturas
  posteriores en navegador.

## Bloqueo y siguiente paso

No se pudo leer el estado de la pestaña autenticada de Coolify en el navegador
conectado. El último inventario operativo del repositorio ya advertía un banner
de formulario con cambios sin guardar en la vista General; no se confirmó si el
aviso sigue presente ni se inspeccionó la configuración persistida actual. No
se pulsó `Save changes` ni `Reset`, no se accedió a otro recurso y no se
desplegó, para evitar aplicar configuración no verificada.

El servidor local de prueba había sido bloqueado por `blocked by policy` en el
corte anterior. No se intentó eludir esa restricción. La comparación visual
posterior, en escritorio y móvil, sigue pendiente. El siguiente intento requiere
leer en Coolify el recurso activo y su aviso de guardado, capturar el digest y
la configuración efectiva para rollback y luego desplegar sólo el FRONT. Si no
hay sesión Académico autorizada para inspeccionar DIE, dejar el flujo listo para
que el usuario entre y no escribir datos de producción.

No se crearon ni modificaron registros productivos. API, Identity, BL, workers,
migraciones y flags permanecen fuera de este cambio.
