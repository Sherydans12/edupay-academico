# Hotfix CORS para creación de unidades — 2026-09-17

Estado inicial: **PREPARADO PARA PUBLICACIÓN**.

## Alcance

- Recurso afectado: servicio Coolify `edupay-academico-pinned`, UUID
  `iobfkpujjoa2kj5urbpnjvzi`, subrecurso `Academic Api`.
- No se modifican frontend, Identity, workers, bases, flags ni permisos de
  negocio.
- Base del hotfix: `origin/main` en `a7b0f79d2313ce7883a2e46375b3c4092fd6b448`.

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

Pendiente de publicación. Antes del cambio se capturó en la VPS, con permisos
restringidos y fuera de Git:

```text
/root/edupay-hotfix-cors-20260917-pre
```

Incluye inspect del contenedor/imagen, Compose efectivo y el tag local
`ghcr.io/sherydans12/edupay-academico:rollback-cors-20260917` apuntando al
digest anterior. Se desplegará sólo el subrecurso del API; no se relanzará el
runner de migraciones ni se tocarán workers o volúmenes.

Tras publicar, completar aquí el SHA del hotfix, digest, deployment Coolify,
resultado del preflight posterior, live/ready, acceso normal y si hubo rollback.

## 404 independientes

- `/favicon.ico`: `404` del frontend Next. El layout no declara icono y no hay
  `apps/web/public/favicon.ico`. Es un defecto cosmético separado y no afecta
  la creación de unidades.
- `/docente/asignaturas/<courseSubjectId>/estudiantes?_rsc=...`: el enlace real
  de `apps/web/src/features/course-builder/course-builder.tsx` apunta a esa
  ruta, pero el árbol Next sólo contiene la página de la asignatura y `items`;
  no existe el segmento `estudiantes`. La respuesta observada incluye headers
  `Vary: rsc` y `Next-Router-Prefetch`, consistente con un prefetch RSC, pero la
  navegación directa a la misma ruta también es `404`. Es un defecto frontend
  independiente: crear la ruta de roster o cambiar el enlace a la interacción
  existente, con su propia prueba y release; no se incluye en este hotfix.

Confirmación pendiente: el usuario debe crear una unidad desde su sesión de
profesor después de verificar el hotfix. Health y preflight correctos no se
consideran prueba de creación real.
