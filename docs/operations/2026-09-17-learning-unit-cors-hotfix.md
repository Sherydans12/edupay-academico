# Hotfix CORS para creación de unidades — 2026-09-17

Estado: **HOTFIX ACTIVO; CONFIRMACIÓN DE USUARIO PENDIENTE**.

## Alcance

- Recurso afectado: servicio Coolify `edupay-academico-pinned`, UUID
  `iobfkpujjoa2kj5urbpnjvzi`, subrecurso `Academic Api`.
- No se modifican frontend, Identity, workers, bases, flags ni permisos de
  negocio.
- Base del hotfix: `origin/main` en `a7b0f79d2313ce7883a2e46375b3c4092fd6b448`.
- Commit del hotfix: `ade7e6a6d831be94fd16ce2f0f4d95dce7d710c7` (rama
  `codex/hotfix-cors-learning-unit`, publicada en `origin`).

## Causa demostrada

El frontend envía `Authorization`, `Content-Type`, `X-Request-Id` e
`Idempotency-Key` al crear o mutar contenido de Learning. El API configura CORS
en `apps/api/src/bootstrap/configure-application.ts` mediante
`application.enableCors`; la allowlist contenía los tres primeros headers, pero
omitía `Idempotency-Key`. La variable efectiva
`ACADEMIC_TRUSTED_WEB_ORIGINS` sí contiene exactamente
`https://academico.edupay.baselogic.cl`.

El `OPTIONS` público respondió con `X-Powered-By: Express` y los headers
producidos por Nest, por lo que la respuesta causal proviene del bootstrap HTTP
del API. Traefik/Coolify sólo enruta la respuesta y no generó el allowlist.

El hotfix agrega únicamente `Idempotency-Key` a la allowlist existente. Se
conservan el callback de origen exacto, `credentials: false`, los métodos
existentes, autorización Bearer, guards, contexto tenant y el servicio de
idempotencia.

## Preflight público antes del hotfix

Solicitud reproducida sin token, cookie ni payload privado:

```text
OPTIONS https://academico-api.edupay.baselogic.cl/api/v1/learning-units
Origin: https://academico.edupay.baselogic.cl
Access-Control-Request-Method: POST
Access-Control-Request-Headers: authorization,content-type,idempotency-key,x-request-id
```

Resultado observado: `204` y origen correcto, pero
`Access-Control-Allow-Headers: Content-Type,Authorization,X-Request-Id`.
Faltaba `Idempotency-Key`, que explica el rechazo del navegador antes del
`POST`. Para `https://evil.example`, el mismo preflight no recibió permiso CORS
(respuesta `404`, sin `Access-Control-Allow-Origin` ni
`Access-Control-Allow-Headers`).

Antes de editar, el contenedor real era `academic-api-iobfkpujjoa2kj5urbpnjvzi`,
healthy, con imagen:

```text
ghcr.io/sherydans12/edupay-academico@sha256:87daba03ee6ab34f00998270e4959a0e5073fdb3548c3a11d60b140bd0280cff
```

## Pruebas

- `pnpm --filter @edupay/api typecheck`: aprobado.
- `pnpm --filter @edupay/api build`: aprobado.
- `pnpm --filter @edupay/api test`: 203 aprobadas, 46 omitidas por no tener
  `TEST_DATABASE_URL` en la ejecución general.
- `test/health.e2e-spec.ts`: 4/4 aprobadas; incluye preflight HTTP real con
  `POST` y los cuatro headers, y origen no autorizado sin permisos.
- `test/learning-domain.e2e-spec.ts`: 12/12 aprobadas en PostgreSQL temporal
  local; usa datos sintéticos, verifica profesor, `401` sin autenticación,
  creación, replay idempotente y `IDEMPOTENCY_KEY_REUSED`. El contenedor fue
  eliminado al terminar. No se ejecutaron migraciones productivas.

## Despliegue y rollback

El build `runtime` terminó en la VPS. El primer intento de push fue rechazado
por scopes del token del registry; tras reautenticar de forma controlada, la
imagen quedó publicada en GHCR con el digest:

```text
ghcr.io/sherydans12/edupay-academico@sha256:3eeb72cc73c314b1df72936dcfaaf5d3ce5873c1d81a08c8d23f3dfaafb37767
```

El image ID local coincide con ese digest (`sha256:3eeb72cc73c314b1df72936dcfaaf5d3ce5873c1d81a08c8d23f3dfaafb37767`).
La primera activación operativa fue el `2026-09-17 19:42 UTC`, mediante
`docker compose` sobre el Compose administrado por Coolify, con override
efímero y `up -d --no-deps --pull never academic-api`; la aplicación final de
la configuración persistida en Coolify terminó a las `19:50 UTC`.

Resultado del recurso:

- contenedor anterior: `f439ba8252dd5aa5d57550670a85af8b1daee4ef80d8dc18f1c2b1e755e9c4b2`;
- contenedor hotfix final: `63a210328f996fb0169243e4a913ddf2a0180856970f4a829a368e7f027d9b06`;
- estado hotfix: `running`, `healthy`;
- no se ejecutó runner de migraciones, no se tocaron workers ni volúmenes.

La primera recreación efímera (`231468b3b45e4254fe89ddec7c4313260b3285ae1fca56f8ae4887853b95b85`)
quedó operativa. Al intentar reconciliar directamente antes de que Coolify
regenerara su Compose, éste todavía apuntaba al digest anterior y creó
brevemente el contenedor viejo `11fcd5f161c0b5dcbc1fce4e2e922998cfa060d97cdcf80c24f9a99b809ec44`.
No fue un rollback por fallo de gate ni hubo cambio de datos; la acción de
arranque de Coolify aplicó inmediatamente el digest nuevo y dejó el contenedor
final healthy. Queda documentado como incidente operativo de aplicación, no
como estado final.

Antes del cambio se capturó en la VPS, con permisos restringidos y fuera de Git:

```text
/root/edupay-hotfix-cors-20260917-pre
```

Incluye inspect del contenedor/imagen, Compose efectivo y el tag local
`ghcr.io/sherydans12/edupay-academico:rollback-cors-20260917` apuntando al
digest anterior. La configuración final de Coolify quedó fijada al digest
nuevo y su arranque mostró `Pulling images`, `Pulled`, `Recreate` y `Started`
para `academic-api` únicamente.

Rollback por recurso: restaurar la imagen anterior en el Compose efectivo y
recrear sólo `academic-api` con `--no-deps`; el tag anterior está preservado en
el snapshot indicado. No hubo rollback.

Preflight posterior público: `204`; `Access-Control-Allow-Origin` coincide
exactamente con `https://academico.edupay.baselogic.cl` y
`Access-Control-Allow-Headers` ahora incluye `Idempotency-Key` junto con
`Content-Type`, `Authorization` y `X-Request-Id`. El origen no autorizado
continuó sin permiso CORS (`404`, sin headers de allow). Live y ready
respondieron `200`. Un `POST` sin autenticación respondió `401`; no se creó
ninguna unidad real.

## 404 independientes

- `/favicon.ico`: `404` del frontend Next. El layout no declara icono y no hay
  `apps/web/public/favicon.ico`. Es un defecto cosmético separado y no afecta
  la creación de unidades.
- `/docente/asignaturas/<courseSubjectId>/estudiantes?_rsc=...`: el enlace real
  de `apps/web/src/features/course-builder/course-builder.tsx` apunta a esa
  ruta, pero el árbol Next sólo contiene la página de la asignatura y `items`;
  no existe el segmento `estudiantes`. La respuesta observada incluye headers
  `Vary: rsc, next-router-state-tree, next-router-prefetch,
next-router-segment-prefetch, Accept-Encoding`, consistente con un prefetch
  RSC, pero la navegación directa a la misma ruta también es `404`. Es un
  defecto frontend independiente: crear la ruta de roster o cambiar el enlace
  a la interacción existente, con su propia prueba y release; no se incluye en
  este hotfix.

Confirmación pendiente: el usuario debe crear una unidad desde su sesión de
profesor después de verificar el hotfix. Health y preflight correctos no se
consideran prueba de creación real.
