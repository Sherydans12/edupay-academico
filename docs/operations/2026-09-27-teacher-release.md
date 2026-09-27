# Corte docente — cierre de release, 2026-09-27

## Integración y artefactos

| Orden | Cambio | Commit integrado | CI | Digest remoto publicado |
|---|---|---|---|---|
| 1 | [API PR #24](https://github.com/Sherydans12/edupay-academico/pull/24), corrige [issue #23](https://github.com/Sherydans12/edupay-academico/issues/23) | `5e3e6079baf4b8f6732a3d4f270f27c67ffa812b` | quality y PostgreSQL integration aprobados | `ghcr.io/sherydans12/edupay-academico@sha256:50ef3a589234179a27c332adcd8a6b52b6be59532586688354056cc9089fe42d` |
| 2 | [FRONT PR #22](https://github.com/Sherydans12/edupay-academico/pull/22), actualizado con el nuevo main | `c6916a7ba3676bac6f3cfa6a2299cb85cab77447` | quality y PostgreSQL integration aprobados; 155 tests web y typecheck locales tras incorporar main | `ghcr.io/sherydans12/edupay-academico-web@sha256:fe66c9ff716040e6d9d33b4696bc657458a23821b4b7d4b42548db51bd947f23` |

Los builds salieron de checkouts limpios en los commits integrados. Se confirmó el digest remoto y la etiqueta OCI `org.opencontainers.image.revision` de cada imagen. La API se construyó con el target `runtime`, sin etapa de migración. FRONT usó las URLs públicas existentes de API e Identity como argumentos de build. El despliegue conservó auto deploy manual, dominios, redes y flags.

## Estado anterior y rollback independiente

| Recurso Coolify | Imagen anterior observada antes del cambio | Imagen nueva | Deployment |
|---|---|---|---|
| Academic API `iobfkpujjoa2kj5urbpnjvzi` (servicio `eclqhnvayyjzfeicccj518at`) | `ghcr.io/sherydans12/edupay-academico@sha256:902c5e2ed1aa59d4e2ca7e6a558aaa113585b3737fc6ed4346bb6597531ac393` | digest API de la tabla anterior | reinicio/pull del servicio, ~23:27 UTC; inicio Nest 23:28:44 UTC |
| FRONT `cct0rtf5iku6fkd3t9hldnv4` | `ghcr.io/sherydans12/edupay-academico-web@sha256:761bbf4d95f881fbf10cde6305f2029097cdcf1573f83c75c029ab4ab401f7a6` | digest FRONT de la tabla anterior | `edw4gwu37w7yde0nzclzck8k`, éxito 23:33:20 UTC |

Para recuperar un solo componente, restaurar **únicamente** su imagen anterior por digest en el recurso indicado, desplegarlo y comprobar health, readiness y compatibilidad con el otro componente. No revertir el otro recurso de forma preventiva. La API anterior **reintroduce la omisión de la política de años cerrados** del issue #23; si fuera imprescindible recuperarla, restringir operaciones docentes de escritura hasta restablecer la API corregida. La configuración de red `coolify`, puertos, dominios, variables y volúmenes permaneció intacta. API conserva montajes `/var/lib/edupay-academico/files` y `/var/lib/edupay-academico/tmp`; FRONT no tiene almacenamiento persistente. La variante `www` de FRONT tenía DNS mismatch previo; el dominio canónico siguió operativo.

## Comprobaciones productivas de solo lectura

- API `live` y `ready`: HTTP 200; readiness informó database, storage y malwareScanner `ok` después del despliegue.
- Preflight CORS para `POST /api/v1/learning-units` desde el origen FRONT: HTTP 204, origen permitido exacto y `Idempotency-Key` aceptado en headers.
- Logs del proceso API: Nest inició correctamente; sin mensajes `ERROR` o `WARN` nuevos en el arranque revisado. La navegación autenticada de administración cargó datos desde API tras el cambio, evidencia de la cadena funcional con Identity. No hubo prueba directa desde el contenedor hacia la dirección privada de Identity.
- FRONT: Coolify informó `Success` para `edw4gwu37w7yde0nzclzck8k`; el log muestra pull del digest nuevo, nuevo contenedor listo y rolling update completado. Runtime `Ready`; sin mensajes `ERROR` o `WARN` nuevos en los logs revisados.
- `/api/health`, `/login`, `/docente`, `/docente/asignaturas`, `/docente/revisiones`, `/administracion`, `/die` y un asset JavaScript de Next.js respondieron HTTP 200. En navegador, la sesión administrativa autorizada abrió Personas e Estructura después del despliegue con datos reales de lectura. No había membresía docente disponible en esa sesión; no se verificó navegación docente autenticada en producción.

No se hicieron escrituras de prueba en producción, migraciones ni cambios de datos reales. La política de años cerrados tiene pruebas PostgreSQL y validación integrada aislada en las PR. El [issue #23](https://github.com/Sherydans12/edupay-academico/issues/23) se cerró después de comprobar la API desplegada (23:34:54 UTC).

Pendientes: una persona con sesión docente autorizada debe verificar sus vistas mediante lecturas; creación y publicación reales quedan para el usuario. La etiqueta legible del año sigue siendo un pendiente backend independiente y no se infiere de nombres ni fechas.
