# Academic onboarding cut 1 — production evidence

Fecha: 2026-09-21 (UTC)

Este documento conserva la evidencia histórica del despliegue de Onboarding 1.
La reconciliación posterior a PR #7 y PR #8, incluido el FRONT aún pendiente de
redeploy, está en [PRODUCTION.md](PRODUCTION.md) y
[PHASE-CLOSEOUT.md](PHASE-CLOSEOUT.md).

## Release

- PR #5: `https://github.com/Sherydans12/edupay-academico/pull/5` — merged.
- Commit revisado: `d26abcbbcfe6b37c496c7790731f884fb29f4680`.
- Commit de `main` desplegado: `e844f5b54291af7c7027498c8972fa90cb46783d`.
- Despliegue manual en Coolify; auto deploy permanece desactivado.
- No se ejecutaron migraciones, no se modificaron flags de proyección, mappings,
  secretos, BL, Identity ni workers.
- CI post-merge `https://github.com/Sherydans12/edupay-academico/actions/runs/35611207972`:
  `quality` y `postgresql-integration` en `success`; los gates de release
  ampliados permanecen omitidos por diseño.

## API

Recurso Coolify `edupay-academico-pinned`
(`iobfkpujjoa2kj5urbpnjvzi`), dominio
`academico-api.edupay.baselogic.cl`.

- Imagen desplegada:
  `ghcr.io/sherydans12/edupay-academico@sha256:89bb5a7a54100a0bcd1d1fc239b2c56309a243f7914105fb4e245a7ee2732c18`.
- Imagen de rollback conservada:
  `ghcr.io/sherydans12/edupay-academico@sha256:3eeb72cc73c314b1df72936dcfaaf5d3ce5873c1d81a08c8d23f3dfaafb37767`.
- El Compose efectivo contiene únicamente `academic-api`; no se incluyó runner
  de migración. Se conservó el healthcheck `/api/v1/health/ready` y los
  volúmenes existentes.
- Coolify terminó con `Running (healthy)`.

Evidencia pública posterior al reemplazo:

| Verificación | Resultado |
| --- | --- |
| `GET /api/v1/health/live` | `200` |
| `GET /api/v1/health/ready` | `200`, database/storage/malwareScanner `ok` |
| Preflight `OPTIONS /api/v1/learning-units` desde FRONT, solicitando `Idempotency-Key` | `204` |
| `Access-Control-Allow-Origin` | `https://academico.edupay.baselogic.cl` |
| `Access-Control-Allow-Headers` | incluye `Idempotency-Key` |
| POST sin autorización a `learning-units` | `401`; no se creó una unidad |
| GET sin token a `/api/v1/academic-preparation/status` | `401`; la ruta desplegada existe y no filtra datos |

## FRONT

Recurso Coolify `edupay-academico-web`
(`qf65r4ltig6jhb6t8dmv2qyw`), dominio `academico.edupay.baselogic.cl`.

- Fuente: `main`, commit `e844f5b54291af7c7027498c8972fa90cb46783d`.
- Dockerfile: `/deploy/Dockerfile.web`, target `runtime`.
- Imagen construida por Coolify:
  `qf65r4ltig6jhb6t8dmv2qyw:e844f5b54291af7c7027498c8972fa90cb46783d`,
  manifest digest
  `sha256:ae93b9646016860af02fcc332ff6e0b0fedd9de548e428b427c462a7bcdf1a13`.
- Rollback por recurso: el deployment Coolify anterior registrado es
  `wxgimhdhkeolqstf35psgwvh`, con SHA de código
  `4f5ad2839e08e561e0335f6e4fdedfe448f15415`. El manifiesto conocido de la
  imagen de Cut 1 es
  `sha256:ae93b9646016860af02fcc332ff6e0b0fedd9de548e428b427c462a7bcdf1a13`.
  Confirmar la relación actual en Coolify antes de usarla; no retirar el
  candidato API si sólo falla FRONT.
- Healthcheck interno `GET /login`: `healthy`; deployment Coolify: `Success`.
- Variables públicas verificadas antes del build y encontradas en los bundles:
  - `NEXT_PUBLIC_API_BASE_URL=https://academico-api.edupay.baselogic.cl/api/v1`
  - `NEXT_PUBLIC_IDENTITY_BASE_URL=https://identity.edupay.baselogic.cl`
- `GET https://academico.edupay.baselogic.cl/login`: `200`.
- `GET https://academico.edupay.baselogic.cl/api/health`: `200`.
- El build enumeró `/administracion`, `/administracion/estructura` y la ruta
  de configuración académica.

Coolify mostró una advertencia de contenedor huérfano durante el rolling update.
El despliegue terminó saludable y no se hizo limpieza destructiva ni se tocó
otro recurso.

## Sesión y verificación funcional pendiente

La sesión visible del navegador no tenía autenticación TENANT_ADMIN. Se dejó
abierta la pantalla:

`https://academico.edupay.baselogic.cl/login?returnTo=%2Fadministracion`

La captura visual local muestra el formulario institucional de Colegio
Conquistadores. No se introdujeron credenciales y no se crearon ni activaron
años o cursos reales. Queda pendiente, con una sesión TENANT_ADMIN autorizada,
consultar en lectura el indicador de preparación y comprobar la navegación y
el cambio de contexto sin conservar datos del tenant anterior.

El resultado del indicador debe interpretarse como estado derivado: `READY`
significa sólo estructura base preparada; `ACTION_REQUIRED` o `BLOCKED` pueden
ser correctos según los datos existentes. No se modificaron datos para forzar
ningún resultado.

## Validación funcional posterior

El usuario confirmó que el indicador de Onboarding 1 funciona correctamente.
La confirmación no implicó crear, activar, archivar ni modificar años o cursos
reales; la comprobación TENANT_ADMIN queda registrada como validación de lectura
del indicador.

## Rollback operativo

- Si falla sólo API: restaurar en el Compose del recurso API el digest anterior
  indicado arriba y reiniciar/desplegar sólo `edupay-academico-pinned`, sin
  dependencias y sin migraciones; volver a comprobar live, ready y preflight.
- Si falla sólo FRONT: usar en Coolify el deployment UUID
  `wxgimhdhkeolqstf35psgwvh` (código `4f5ad2839e08e561e0335f6e4fdedfe448f15415`,
  manifest conocido `sha256:ae93b9646016860af02fcc332ff6e0b0fedd9de548e428b427c462a7bcdf1a13`),
  conservando las URLs públicas y sin tocar API, Identity, BL ni workers.
- No ejecutar rollback cruzado por una falla aislada del otro recurso.
