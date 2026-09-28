# Inventario Coolify y limpieza segura — 2026-09-28

## Resultado

- Proyecto Coolify **My first project** (`p5gswqrr8ot1oaoxwytrpsho`), entorno **production** (`oej046b1ozl6a1w329bx8zdd`): 28 recursos antes de la limpieza y 27 después.
- Tras completar el inventario, se retiró por Coolify el servicio obsoleto de migración Identity `service-ez9og1hruw5vohzqgxmv1rvp` (UUID `ajf4d2ebozcpauguebm3alh1`), que contenía `Identity Migrate Die 20260923` y la imagen retirada `ghcr.io/sherydans12/edupay-identity-migrate@sha256:fa88615b0d08abf807ad4667b2812326648fa855aacc6221bb752b35cf2409b7`. Antes del retiro constaba `Exited`, con 0 dominios, sin volúmenes, tareas programadas ni respaldos; la imagen se había reemplazado tras corregir el migrador. Después de la confirmación final del usuario, Coolify dejó de mostrar el recurso y el contador bajó de 28 a 27.
- En la confirmación de Coolify se dejaron desmarcados la eliminación de volúmenes, redes y la limpieza global de Docker. Se eliminó la configuración del servicio asociada a ese recurso. No se borraron bases, datos de aplicación, backups, redes ni imágenes globales.
- El servicio `healthchecks-y933c06bgew5rmqjht4hya21` (UUID `y933c06bgew5rmqjht4hya21`) también está `Exited`, pero pertenece a Healthchecks (`healthchecks/healthchecks:v4.2`) y conserva el volumen `y933c06bgew5rmqjht4hya21_healthchecks-data` en `/data`; queda intacto. No debe confundirse con el recurso de migración retirado.
- Los demás recursos `Exited` no se consideraron obsoletos por su estado: se preservan el FRONT rollback `qf65r4ltig6jhb6t8dmv2qyw`, los workers Académico, Healthchecks, `keydb-database-gdl5ot1fe0wyc3lazq9te8hy` (base), y `Baselogic-EAM QA` (BL, fuera de alcance).

## Snapshot del entorno Coolify

La siguiente lista conserva la fotografía read-only de los 28 recursos antes del retiro. `—` significa que la lista del proyecto no presenta un dominio para ese recurso; los servicios Académico API e Identity se verificaron además en sus páginas de dominios, porque esa lista no los muestra en la columna Domain. El recurso retirado y el recuento posterior se registran en la sección de resultado.

| Recurso | UUID | Tipo | Estado | Dominio visible / comprobado |
|---|---|---|---|---|
| academico-db | `v5w9hacwtftulf4m46l1rn2g` | Database | Running | — |
| Altavista DEMO | `tmf67dtsdj6mkludcxm9wo4t` | Application | Running | `altavista-demo.baselogic.cl` |
| b-l-005:main-eyraz9qkfsn2tcw60l7kq2u7 | `mw1ynw4y6930vqvwde16dskw` | Application | Running | `demo.baselogic.cl` |
| BaseLogic Web | `s5v2aydyxxq91ktl2gd23pan` | Application | Running | `baselogic.cl` |
| BASELOGIC-EAM | `r1i35c8ehfqwj5e8v9pj7slx` | Application | Running | — |
| Baselogic-EAM QA | `dzl5ymbjz4yyf7zy46faxah5` | Application | Exited | — |
| clamav | `ttrrmrkod9hmqo68er6q2ghs` | Application | Running | — |
| Conquistadores CMS | `nx27k71mughxra1iuc7ssxrt` | Application | Running | — |
| conquistadores:main-yp0gmnfgu5bj97zh3s539bd3 | `ovwcxc91lezhp57r5b9u8xzg` | Application | Running | `www.colegioconquistadores.com` |
| EDUPAY BACK | `km0aljzabdiqtaixj9dsequu` | Application | Running | `api-edupay.baselogic.cl` |
| EDUPAY FRONT | `ktgdely86kx0by10p9cb91os` | Application | Running | `edupay.baselogic.cl` |
| edupay-academico-notification-worker-pinned | `nn8yrhitex2r6squev0auwrs` | Service | Exited | — |
| edupay-academico-pinned | `iobfkpujjoa2kj5urbpnjvzi` | Service | Running | `academico-api.edupay.baselogic.cl` |
| edupay-academico-sync-worker-pinned | `r8mtn1xqtex96j4a8wu5hae6` | Service | Exited | — |
| edupay-academico-web — rollback | `qf65r4ltig6jhb6t8dmv2qyw` | Application | Exited | 0 domains; retained rollback |
| edupay-academico-web-die-20260924 — activo | `cct0rtf5iku6fkd3t9hldnv4` | Application | Running | `academico.edupay.baselogic.cl`; `www` alias has DNS mismatch |
| edupay-identity-pinned | `0vrvqepcukwcubxga0narorf` | Service | Running | `identity.edupay.baselogic.cl` |
| healthchecks-y933c06bgew5rmqjht4hya21 | `y933c06bgew5rmqjht4hya21` | Service | Exited | — |
| identity-db | `bluypktxta8uisbrfzu6p9pw` | Database | Running | — |
| InmoDesk DEMO | `qw2kffm2vbokse6k43dypc29` | Application | Running | `inmodesk-demo.baselogic.cl` |
| keydb-database-gdl5ot1fe0wyc3lazq9te8hy | `gdl5ot1fe0wyc3lazq9te8hy` | Database | Exited | — |
| Las Violetas Web | `lvg0r0e0i14tz9p6b7jz0jhr` | Application | Running | `colegiolasvioletas.cl` |
| lavaserv.cl | `e2ouokiok81whkvtn6hjo4cp` | Application | Running | `lavaserv.baselogic.cl` |
| Portal De Pagos Conquistadores (PROD) | `ehuaxp1lx6zjqhmeu4tk3uke` | Application | Running | — |
| Portal de Pruebas DEMO | `odag1cfrxq5i76l1jkjky449` | Application | Running | — |
| postgresql-database-EDUPAY | `dms5i3e0i5t4kyh7h683mi7v` | Database | Running | — |
| postgresql-database-wpmuwloq8y88vj1bt7022y97 | `wpmuwloq8y88vj1bt7022y97` | Database | Running | — |
| service-ez9og1hruw5vohzqgxmv1rvp — Identity Migrate Die 20260923 | `ajf4d2ebozcpauguebm3alh1` | Service | Exited before deletion; removed afterward | 0 domains |

The two PostgreSQL resources `dms5i3e0i5t4kyh7h683mi7v` and `wpmuwloq8y88vj1bt7022y97` were left untouched. Existing documentation maps the first to BL-002; the owner/dependencies of the second were not established here. Neither is a cleanup candidate.

## Rutas, proxy y salud

- Traefik on Coolify server `localhost` (`h10grmpaqnhiissqexi1k4mu`) is `Running` and reports saved/running configuration synchronized.
- The active FRONT is the sole active EduPay Académico application shown for the canonical host. Its configured canonical domain is `academico.edupay.baselogic.cl`; `www.academico.edupay.baselogic.cl` remains a separate DNS-mismatch alias. The old FRONT rollback has 0 domains and is `Exited`, so it does not claim that host.
- The API domain page contains one `academico-api.edupay.baselogic.cl` entry with DNS OK. Running container labels show one HTTP router and its HTTPS router for that host, both targeting the `iobfkpujjoa2kj5urbpnjvzi` API service.
- The Identity domain page contains one `identity.edupay.baselogic.cl` entry. Running container labels show one HTTP router and its HTTPS router for that host, both targeting the `0vrvqepcukwcubxga0narorf` Identity service.
- The read-only Traefik-enabled container listing showed one running container for the active Académico FRONT, one for Académico API, and one for Identity; no active container for the old FRONT rollback. No duplicate canonical upstream/router was observed.
- Health checks on 2026-09-28: FRONT `/api/health` and `/login` = HTTP 200; Académico API `/api/v1/health/live` and `/api/v1/health/ready` = HTTP 200; Identity `/api/v1/identity/health` and `/.well-known/jwks.json` = HTTP 200.
- Active images remain the documented immutable FRONT digest `sha256:ce07f61d1f5fa066828b501e333b6c7e7668577f0d8b9d6b3f5cea400d566aa2`, Académico API digest `sha256:50ef3a589234179a27c332adcd8a6b52b6be59532586688354056cc9089fe42d`, and Identity digest `sha256:960d326a9199881d54c7fc9611d052be77c0fbdceae4badebfe1208febe5aa01`.

## Almacenamiento y redes preservados

- FRONT activo: Coolify indica `No persistent storage`.
- Académico API: preservar los directorios `/var/lib/edupay-academico/files` y `/var/lib/edupay-academico/tmp`.
- Identity: preservar `/opt/edupay-pilot/keys` montado en `/keys`.
- PostgreSQL Académico: preservar el volumen nombrado `postgres-data-v5w9hacwtftulf4m46l1rn2g` en `/var/lib/postgresql/data`.
- PostgreSQL Identity: preservar el volumen nombrado `postgres-data-bluypktxta8uisbrfzu6p9pw` en `/var/lib/postgresql/data`.
- Healthchecks: preservar `y933c06bgew5rmqjht4hya21_healthchecks-data` en `/data`, aunque el servicio esté detenido.
- El destino S3 de Coolify `BaseLogic R2 Storage` (`ubc9br006n2rjev7cabpmzir`) figura `Connected`; se preserva junto al timer `edupay-backup.timer`, los backups existentes y las redes `coolify` y de cada stack.
- ClamAV `ttrrmrkod9hmqo68er6q2ghs` sigue `Running`; los workers siguen detenidos en su estado previo. Ninguno se detuvo ni redeplegó.

## PR #28 y deployments

- PR #28 contenía sólo tres archivos de documentación (`student-experience-cut-2026-09-27.md`, `student-experience-release-2026-09-28.md` y `roadmap.md`). `quality` y `postgresql-integration` aprobaron sobre HEAD `eeb2508894efccc49ce01e867bc75cca6b8fde75`.
- Merge conservando historia: `9f30455966f39f96530c5b4cf7a9b35d73c419d4`, el 2026-09-28 a las 13:28:39 UTC. CI de `main` terminó correctamente sobre ese SHA.
- El workflow de CI no publica imágenes ni contiene despliegue automático; el FRONT mantiene `autoDeploy=false`. Tras el merge, Coolify seguía mostrando como último deployment el redeploy manual del FRONT `lb4qetxxhgjtfttq95hqmomw` (sin un deployment nuevo del merge). No se construyó imagen ni se redeplegó ningún recurso.

## Resultado posterior al retiro

- Coolify volvió a la lista del entorno `production`: el proyecto mostró 27 recursos y la búsqueda del UUID `ajf4d2ebozcpauguebm3alh1` no encontró coincidencias.
- Los recursos `edupay-academico-pinned`, `edupay-identity-pinned` y el FRONT Académico activo figuraban `Running` en Coolify después de la operación.
- No pude repetir la comprobación HTTP pública desde el navegador: la navegación a la URL de health de Académico fue bloqueada localmente como `ERR_BLOCKED_BY_CLIENT`. Por ello este cierre confirma el estado visible en Coolify, no un health HTTP posterior al retiro. La comprobación HTTP 200 documentada arriba corresponde al inventario anterior a la limpieza.

## Alcance y pendientes

BL y los sitios del mismo proyecto se inventariaron para no confundir su ownership y se preservaron. Se retiró únicamente el servicio de migración Identity indicado arriba; no se modificó configuración de aplicaciones activas, código ni datos de aplicación. La identidad/responsable del PostgreSQL `wpmuwloq8y88vj1bt7022y97` no se pudo establecer y queda fuera de cualquier limpieza. Los demás recursos detenidos —incluidos workers, Healthchecks y el FRONT de rollback— se preservaron porque su estado por sí solo no demuestra que estén obsoletos.
