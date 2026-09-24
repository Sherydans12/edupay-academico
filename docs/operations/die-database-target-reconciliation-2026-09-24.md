# Reconciliación de destino PostgreSQL para DIE

Fecha de comprobación: **2026-09-24T00:04Z**. Todas las consultas a bases
productivas se hicieron dentro de los contenedores API activos, usando en
memoria el `DATABASE_URL` del PID 1. El URL, el usuario y la contraseña no se
imprimieron. Cada conexión usó `BEGIN TRANSACTION READ ONLY` y terminó con
`ROLLBACK`.

## Resultado

Los APIs usan las bases nativas de Coolify, con nombre `postgres` y schema
`public`. En ambas, `_prisma_migrations` existe en `public` y tiene el ledger
esperado: Identity 3/3 y Académico 10/10. La comprobación desde el proceso real
resolvió en el servidor conectado la dirección y el puerto indicados abajo.
El path `/postgres` no fue añadido por una redacción del verificador: se leyó
el entorno del proceso sin mostrarlo y se conectó con ese mismo valor. La
transacción consultó los ledgers y catálogos en el destino efectivo.

| API / recurso Coolify | Contenedor e imagen activa | PostgreSQL efectivo del proceso | Ledger y catálogo relevante |
| --- | --- | --- | --- |
| Identity API `0vrvqepcukwcubxga0narorf` | `identity-0vrvqepcukwcubxga0narorf`; `ghcr.io/sherydans12/edupay-identity@sha256:6733d04b53c87145429927b2d9a37e2fe7d44d73314d857c6a03bd8e67f64103` | DB resource/container `bluypktxta8uisbrfzu6p9pw`; `postgres:5432`, schema `public`, search path `"$user", public`; `inet_server_addr=fd9d:c140:35e0::c/128`. El DB container está en `coolify` como `10.0.1.12`; volumen `postgres-data-bluypktxta8uisbrfzu6p9pw`. | 3 filas terminadas, 0 revertidas. 17 tablas públicas. Están `identity_users`, `tenant_realms` y `provisioning_idempotency_receipts`; conteos agregados: 13 usuarios, 1 realm y 0 recibos de provisioning. |
| Académico API `iobfkpujjoa2kj5urbpnjvzi` | `academic-api-iobfkpujjoa2kj5urbpnjvzi`; `ghcr.io/sherydans12/edupay-academico@sha256:89bb5a7a54100a0bcd1d1fc239b2c56309a243f7914105fb4e245a7ee2732c18` | DB resource/container `v5w9hacwtftulf4m46l1rn2g`; `postgres:5432`, schema `public`, search path `"$user", public`; `inet_server_addr=fd9d:c140:35e0::1d/128`. El DB container está en `coolify` como `10.0.1.29`; volumen `postgres-data-v5w9hacwtftulf4m46l1rn2g`. | 10 filas terminadas, 0 revertidas. 38 tablas públicas. Están los objetos de las reparaciones descritas abajo; no hay tablas `die_*` ni `tenant_operational_profiles`. |

Los dos API containers comparten la red Docker `coolify` con sus PostgreSQL
administrados; cada uno también tiene su red de proyecto. Los PostgreSQL
administrados fueron creados el 13-ago y permanecían en ejecución desde el
7-sep con sus volúmenes persistentes. Las imágenes API activas se crearon el
23-sep a las 20:25Z (Identity) y 20:40Z (Académico), tras la recuperación
mediante Coolify. Esto acredita que se recrearon APIs; no acredita un cambio
del destino de base.

## Ledgers actuales

Todos los checksums son los guardados en `public._prisma_migrations`; las filas
marcan `finished_at` y no tienen `rolled_back_at`.

| Identity migration | Checksum SHA-256 | `started_at` UTC |
| --- | --- | --- |
| `20260808000000_identity_foundation` | `cf9aab4a7bc6b91c890bb3e5d981c523ffbd7df7fb1586c6d310c6fc463fb230` | 2026-08-12T23:49:58.547Z |
| `20260809000000_account_lifecycle` | `0257f6d7ca0676536ef93c27fe89fbbeff1639c291eb4d488f4719c57f07ff78` | 2026-08-12T23:49:58.735Z |
| `20260831000000_provisioning_idempotency_receipts` | `c615b7fd9db0ea642ad08fa5981f498dd9a73e97b9db7c0d2d0d2d7cd53eb68b` | 2026-09-08T13:37:21.598Z |

| Académico migration | Checksum SHA-256 | `started_at` UTC |
| --- | --- | --- |
| `20260808195654_academic_structure` | `b878b48bbed5cdec5c76dbf7f0de1529fcaa99ca28e08c4221ed676693e7c278` | 2026-08-12T23:50:01.819Z |
| `20260808220000_learning_content` | `6642dea7b20270d7725fbd754a33c8a5ad21e27a12474c60e118097c86b4800c` | 2026-08-12T23:50:02.968Z |
| `20260808230000_storage_submissions` | `dd907d441ad59a4cb650099dd9ad97f88c2feb759d7ee820b1651427d192f23c` | 2026-08-12T23:50:03.208Z |
| `20260809000000_hardened_upload_transport` | `f825c4c5ecdbc5b33324a674b1102270570e0cb3ad339c7bf78dbcb41ceef6d9` | 2026-08-12T23:50:03.590Z |
| `20260809100000_academic_notifications` | `32f02f387150f22a84f875a20c9a837f7a8fb0dc980e3eb557e8bf4ac079ee14` | 2026-08-12T23:50:03.614Z |
| `20260811190000_edupay_sync_consumer` | `d9f90e683ad76750d080352bdc8ecc0ead17c9cf27121915aa7bdd578541bcdb` | 2026-08-12T23:50:03.833Z |
| `20260820160800_add_content_revisions_drafts_and_versioning` | `06cf265fd5c13fdf0d1070eefbaf83c1d73d3949eead0f9836721cfda3b8a670` | 2026-08-20T17:45:09.746Z |
| `20260824140000_command_receipts_and_sparse_ordering` | `0b4dfe453c28e8e48234535e143baa51109f75c576fdc07b4ca56fa521e0eed5` | 2026-09-14T20:16:54.656Z |
| `20260825113000_add_learning_body_document` | `a6ed7fa4d77841d1ff1e75c8f4fa8096b1e351b321ea5e33108c95724899b687` | 2026-09-14T20:16:57.915Z |
| `20260903110000_financial_projection_producer` | `0eba750ca6cd30c01646d37bee407edee9d81e37d913dde9da31864adbe8f55e` | 2026-09-14T20:17:35.637Z |

The Identity receipt migration's checksum is exactly the production value. The
Academic catalog contains `command_receipts` (7 aggregate rows),
`content_revisions` (107), `learning_items.body_document`,
`learning_item_drafts.body_document`, `financial_projection_outbox_events`,
`financial_projection_snapshots`, and `financial_projection_snapshot_items`.
The related current aggregate counts are 22 learning items, 0 drafts, 242
course enrollments, 1 tenant, and 0 rows in each financial-projection table.
These counts do not read or expose personal values. The ledger rows for
`command_receipts` and `body_document` show `applied_steps_count=0`, but their
catalog objects are present; the financial-projection migration shows one
applied step. The repair effects were not inferred from ledger status alone.

## Qué produjo el 2/6 y qué cambió

Hay dos evidencias distintas con un ledger 2/6:

1. El registro de cutover nativo del **18-ago-2026** en
   `EduPayIdentity/docs/deployment/native-coolify-preparation-evidence.md`
   documenta explícitamente los PostgreSQL Coolify UUID
   `bluypktxta8uisbrfzu6p9pw` y `v5w9hacwtftulf4m46l1rn2g` en la base
   `postgres`, entonces con 2/6. Ese conteo fue correcto para esa fecha.
2. En el servidor aún están contenedores distintos llamados `identity-db` y
   `academico-db`, pertenecientes al proyecto Compose `edupay-pilot`, en la red
   `edupay-private`, con volúmenes
   `edupay-pilot_identity-db-data` y
   `edupay-pilot_academico-db-data`. Sus bases nominales también tienen 2/6,
   con los checksums de las primeras migraciones. No son los recursos Coolify
   UUID, no comparten la red `coolify` de los APIs actuales y no son el destino
   efectivo de sus procesos.

La tercera migración Identity aparece en el ledger nativo con hora del 8-sep.
Académico registra la migración de versionado el 20-ago y las últimas tres
migraciones históricas el 14-sep. Por tanto, el paso de 2/6 a 3/10 está
demostrado por las entradas con checksum y timestamps en los mismos recursos
nativos persistentes. El ledger no identifica al ejecutor ni el deployment que
lanzó cada operación. No hay evidencia de un cambio de `DATABASE_URL` entre
esas fechas.

El informe de 23-sep 23:30 que afirmó que la base efectiva `/postgres` no tenía
ledger y atribuyó 2/6 a bases hermanas es incorrecto. Confundió recursos/datos
con nombres parecidos y una fotografía histórica con el estado actual. El
volcado de ese comando original no se conserva, así que no se puede demostrar
si el error exacto fue escoger el host/container equivocado o interpretar una
URL redactada al construir una segunda conexión. La verificación actual leyó
`/proc/1/environ`, no imprimió ni transformó el URL y conectó usando ese mismo
valor; encontró el ledger en `postgres/public` en la dirección del PostgreSQL
Coolify correspondiente. No existe evidencia de que usuarios de los APIs
actuales estén operando contra los contenedores Compose antiguos.

## Recovery point y cambios de configuración

El manifiesto del paquete registra el recovery point
`20260923194655Z`, con componentes `identity-postgresql`,
`academic-postgresql` y `private-storage`, checksums verificados y presencia
remota verificada. No se restauró. El punto es anterior a la recreación de los
APIs observados y sigue siendo antiguo para una nueva ventana.

No se pudo volver a listar ni restaurar sus dumps de manera aislada desde esta
sesión: el servidor Coolify no tiene el archivo protegido
`/etc/edupay/backup-r2.env` accesible en el contexto inspeccionado, y el
manifiesto sanitizado no registra UUID de recursos ni ledger extraído de cada
dump. La hora del backup es posterior a los `started_at` de las diez
migraciones actuales; eso no sustituye la inspección independiente del dump.
No se usa el recovery point como prueba para escoger el destino.

El registro de la recuperación anterior confirma que Coolify recreó sólo los
API usando los runtimes previos, conservó `connect_to_docker_network` y no
guardó en bloque los cambios pendientes. El DB resource/volumen nativo no se
recreó en esa operación. Sin embargo, aquella comparación de configuración
registró nombres de variables, no un valor/destino histórico de
`DATABASE_URL`; no se puede atribuir a ese evento un cambio de destino.

## Estado operativo y corrección mínima

- Identity y Académico respondieron HTTP 200 en health al comprobarse a las
  00:04Z del 24-sep. Docker mostraba los APIs y PostgreSQL nativos healthy.
- No se activó 503 ni mantenimiento, no se pausaron escritores y no se cambió
  configuración, ledger, esquema o datos productivos.
- La promoción DIE queda suspendida por instrucción del usuario. No se hizo
  contención: los APIs apuntan a los PostgreSQL correctos y no hay evidencia de
  escrituras contra el stack Compose antiguo.
- Corrección mínima para futuros preflights: seleccionar el recurso PostgreSQL
  por UUID Coolify desde el inventario; validar nombre real del contenedor,
  UUID, red y volumen; después, desde cada API, derivar y conectar usando el
  entorno efectivo del PID 1. Registrar sólo host lógico, base, schema,
  dirección/puerto, ledgers y catálogos agregados. No decidir por alias como
  `identity-db`, `academico-db` o por el nombre de base `postgres` aislado.

Esto corrige el registro y deja documentado el selector seguro para futuros
preflights. No requiere cambiar las URLs productivas. El riesgo restante es de
repetición del error de observabilidad mientras convivan contenedores con
nombres de servicio parecidos; detenerlos o borrar sus volúmenes no forma parte
de esta corrección.
