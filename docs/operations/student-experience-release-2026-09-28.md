# Publicación del frontend de experiencia estudiantil

Fecha: 2026-09-28 12:48 UTC  
PR: [#26](https://github.com/Sherydans12/edupay-academico/pull/26)  
Recurso Coolify: FRONT Académico `cct0rtf5iku6fkd3t9hldnv4`

## Integración y artefacto

- HEAD validado de PR: `97e1721d704d83bb5fdab0ccb885c65cd99e0f7e`.
- CI de PR: `quality` y `postgresql-integration` pasaron sobre ese HEAD.
- Merge commit: `56ea2ae770f48d9b6ad6bdc0f3d184fcbe315fe6`, con padres `2b8d1c1da1d3fb36611dec76e56a7a7bfc3fc288` y `97e1721d704d83bb5fdab0ccb885c65cd99e0f7e`. `origin/main` se verificó en ese commit.
- Construcción limpia desde ese commit, con `deploy/Dockerfile.web` y destinos públicos vigentes de API e Identity. La imagen contiene sólo la aplicación web.
- Imagen publicada: `ghcr.io/sherydans12/edupay-academico-web:56ea2ae770f48d9b6ad6bdc0f3d184fcbe315fe6`.
- Digest OCI de la imagen: `sha256:ce07f61d1f5fa066828b501e333b6c7e7668577f0d8b9d6b3f5cea400d566aa2`. El manifiesto `linux/amd64` es `sha256:e2656630429802997d9823712bbda30a87012d8ddadfb05a6e578ca658bad894`; su etiqueta está fijada en Coolify como `sha256-ce07f61d1f5fa066828b501e333b6c7e7668577f0d8b9d6b3f5cea400d566aa2`.

## Coolify y rollback

- Antes del despliegue se capturó la imagen activa `ghcr.io/sherydans12/edupay-academico-web:sha256-fe66c9ff716040e6d9d33b4696bc657458a23821b4b7d4b42548db51bd947f23`, digest `sha256:fe66c9ff716040e6d9d33b4696bc657458a23821b4b7d4b42548db51bd947f23` (origen documental: `c6916a7ba3676bac6f3cfa6a2299cb85cab77447`).
- Se guardó únicamente la nueva etiqueta en el recurso FRONT. Se mantuvieron dominio, puertos, variables y demás configuración.
- Acción `Redeploy` manual sobre `cct0rtf5iku6fkd3t9hldnv4`; Coolify creó el deployment `lb4qetxxhgjtfttq95hqmomw`, estado `Success`, duración 53 s. Los logs confirman el pull del digest nuevo, el arranque del contenedor nuevo y el retiro del anterior.
- El recurso seleccionado es la aplicación FRONT independiente. No se inició un despliegue de API ni se modificaron API, Identity, BL, workers, migraciones, flags o datos.
- No fue necesario revertir. El digest anterior queda registrado arriba para una reversión exclusiva del FRONT si apareciera una regresión.

## Comprobación posterior

- `GET https://academico.edupay.baselogic.cl/api/health`: `200`, `{"service":"edupay-academico-web","status":"ok"}`.
- `GET https://academico.edupay.baselogic.cl/login`: `200`, título `EduPay Académico`.
- Ocho recursos `_next/static` observados en login (CSS, JavaScript y fuente) respondieron `200`.
- Comprobación visual en Chrome con viewport de página medido `innerWidth=390`, `innerHeight=844`. En inicio se mostró el menú lateral móvil y sus destinos; el foco de teclado avanzó a “Asignaturas”. Se navegó en sólo lectura al calendario: los filtros de búsqueda, asignatura y estado aparecieron y el calendario terminó de cargar. En calendario, `documentElement.scrollWidth=390`, sin desbordamiento horizontal.
- Había una sesión estudiantil autenticada con el banner de contexto real. Sólo se hizo lectura y navegación; no se cargaron archivos ni se enviaron actividades. No se copiaron datos académicos al informe.
- La captura de navegador se inspeccionó durante la comprobación; la integración de Chrome no ofreció exportación de la imagen a un archivo local.
- CI verificado también sobre el merge commit exacto: `quality` y `postgresql-integration` pasaron con `head_sha=56ea2ae770f48d9b6ad6bdc0f3d184fcbe315fe6`. Los gates de release del piloto quedaron omitidos por sus condiciones normales de ejecución y no forman parte de la verificación de este despliegue manual.

## Pendientes

- **Frontend:** etiqueta legible del año académico cuando exista un dato contractual; no inferirlo de nombres, identificadores ni fechas. La prueba integrada no fuerza una respuesta perdida después de un envío confirmado; la reconciliación está cubierta por pruebas de frontend con respuestas simuladas.
- **Backend:** ninguno reproducido durante este corte. El aviso de validación DNS de Coolify corresponde a la configuración de dominio ya existente; no se cambió DNS y el dominio canónico y health del FRONT respondieron correctamente.
