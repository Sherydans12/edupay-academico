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
- No hay digest nuevo desplegado. La inspección de Coolify confirmó que el
  recurso activo `cct0rtf5iku6fkd3t9hldnv4`, llamado
  `edupay-academico-web-die-20260924`, está `Running` y que su último
  despliegue exitoso (`rtk462el38k8ughhtxlepclm`) inició desde
  `ghcr.io/sherydans12/edupay-academico-web@sha256:c117c718352ede7220f4f685711d7df4bc88384b304bb19970d9379aa9fc0d81`.
  Ese digest existe en GHCR y es el rollback identificado antes de esta
  publicación.
- La vista de Coolify confirma imagen preconstruida (sin build), puerto `3000`,
  red `coolify` y los dominios `academico.edupay.baselogic.cl` y
  `www.academico.edupay.baselogic.cl`. El dominio canónico reporta DNS OK;
  `www` reporta DNS mismatch. HTTP→HTTPS está habilitado. El inventario
  operativo registra además `autoDeploy: false`, sin almacenamiento
  persistente, y el healthcheck Docker `GET /api/health`.
- La pantalla General muestra `You have changes that haven't been saved yet`,
  también al cargar el recurso en una pestaña nueva de sólo lectura. Sus
  valores visibles de nombre, imagen/tag previo, puerto y red coinciden con el
  despliegue e inventario; no se pudo identificar qué campo mantiene activo el
  aviso. El panel Rollback informa `Rollback unavailable` y el botón está
  deshabilitado. No se pulsó `Save changes` ni `Reset`: guardar el nuevo tag en
  ese formulario podría persistir también cambios ajenos al release.
- La publicación del nuevo digest en GHCR fue rechazada por `blocked by policy`
  antes de ejecutar el comando. No se cambió de herramienta ni se intentó
  eludir la restricción. El build local sigue disponible con ID
  `sha256:92538908c98636fecdf3a0f48cadf29289875920398828dbbea2c91155abb47c`;
  no equivale a un digest del registry.

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
  [`docs/design/screenshots`](../design/screenshots). No hay capturas posteriores
  del nuevo frontend: no se desplegó el artefacto integrado.
- Tras consultar el panel Coolify, las lecturas públicas de
  `/api/health` y `/login` devolvieron `200`; corresponden al frontend anterior.

## Bloqueo y siguiente paso

El recurso, digest activo, dominios, puertos y red se leyeron de Coolify y se
contrastaron con el último despliegue y el inventario. Persiste el aviso de
cambios sin guardar incluso en una pestaña nueva. Como el formulario global no
permite distinguir qué campos están pendientes, no se guardó ni reinició; hace
falta reconciliar ese borrador antes de actualizar el tag y guardar la imagen
del release. El panel de rollback integrado no ofrece una imagen anterior en su
caché actual; conservar el digest GHCR `c117…` permite preparar un redeploy
manual por digest después de publicar el nuevo artefacto.

El servidor local de prueba fue rechazado por `blocked by policy` en el corte
anterior. El intento de publicar el nuevo artefacto también fue rechazado por
esa política. No se eludieron esas restricciones. La comparación visual
posterior al despliegue, en escritorio y móvil, sigue pendiente. El siguiente
paso operativo es reconciliar el formulario de Coolify sin guardar cambios
ajenos, publicar la imagen por el mecanismo autorizado y actualizar únicamente
el recurso FRONT ya existente. Después se deben validar health, login, assets y
navegación. En producción no se crearán ni modificarán registros; la revisión
de vistas DIE con datos reales debe evitar capturas que muestren información
personal. Si falta sesión autorizada para flujos autenticados, dejar la
comprobación lista para el usuario.

No se crearon ni modificaron registros productivos. API, Identity, BL, workers,
migraciones y flags permanecen fuera de este cambio.
