# Cierre de release DIE — 2026-09-24

Estado al 2026-09-24T02:52Z: **módulo DIE desplegado; piloto sin configurar ni validar por el usuario**. La promoción se completó con la autorización ya concedida. No se crearon miembros STAFF, memberships, perfiles institucionales ni registros DIE; BL sigue fuera del alcance.

## Reconciliación de destinos y autorización

La rectificación documental PR #14 quedó integrada en main por el merge commit 998a4598e6fb581e6b60e02018e1314b4f253251. La investigación de sólo lectura demostró que el API Identity y el API Académico activos usan sus PostgreSQL nativos Coolify, ambos en la base postgres y schema public. El informe anterior que encontró /postgres sin ledger y bases nominales 2/6 mezcló contenedores históricos y contenedores Compose de edupay-pilot con los destinos activos; no demostró una modificación de DATABASE_URL. No se intervino edupay-pilot ni sus bases.

Se conservaron las tres migraciones históricas de Identity, incluida 20260831000000_provisioning_idempotency_receipts con checksum c615b7fd9db0ea642ad08fa5981f498dd9a73e97b9db7c0d2d0d2d7cd53eb68b. No se volvió a aplicar ni se resolvió esa migración. Los commits de los candidatos aprobados fueron Académico bd413666ebb3674dc791d8cb735bcea1aadbed62 y Identity 93418b68eaf41976b4bc695039afcbc8eab4fdbc. PR #10 y #12 se integraron conservando historia; sus CI de main terminaron correctamente.

## Recovery point conjunto

Se tomó el recovery point 20260924T010020Z a las 2026-09-24T01:00:20Z, antes de cualquier migración del release.

| Componente | Recurso PostgreSQL | Base/schema | Ledger al capturar |
| --- | --- | --- | ---: |
| Identity | bluypktxta8uisbrfzu6p9pw | postgres/public | 3 migraciones |
| Académico | v5w9hacwtftulf4m46l1rn2g | postgres/public | 10 migraciones |
| Storage privado Académico | almacenamiento privado del producto | contenido privado | Incluido |

Los checksums locales y la copia remota R2 se verificaron desde el manifiesto protegido. La restauración aislada de las bases correspondió con los recursos y ledgers activos previos a migrar. El paquete operativo registra los checksums de cada fila del ledger de ambas bases, la inclusión del storage y los resultados local/remoto/restore. No contiene dumps, secretos ni credenciales. No se restauró sobre producción.

## Migraciones aplicadas

Identity recibió únicamente 20260924000000_add_staff_role, checksum efdf76787689aeb4b765d743cec5501bd5d7c9b33be1d095975a73b484d5c87e. El ledger quedó en 4 filas; las tres filas históricas y sus checksums se conservaron.

Académico recibió, en orden, sólo estas migraciones:

| Migración | SHA-256 |
| --- | --- |
| 20260922120000_die_educational_inclusion | 3d72e87cae2db202fc23080f63988b379b397d35ee3a8b091dc85528d0c72c19 |
| 20260923120000_tenant_operational_profile | 00e65be71dda33538ae6ed728173445aa1a92a8aa2fdb07e0eb0d2cdf6722791 |
| 20260924120000_die_staff_members | c732a79d1dcc1f71f95da865bc838d393c6f6e04be377a9720886e39c349ef71 |

El ledger quedó en 13 filas; las diez migraciones históricas y sus checksums se conservaron. Las tablas DIE están presentes y vacías. Se preservaron los agregados verificados: 7 command receipts, 107 content revisions, 22 learning items, 242 enrollments y 1 tenant; projection outbox, snapshots e items siguen en cero.

## Artefactos y despliegues

Los artefactos se publicaron y verificaron por digest remoto, procedencia y plataforma linux/amd64. Los identificadores locales de Docker no se usan como digests GHCR.

| Orden | Recurso Coolify | Artefacto desplegado | Resultado comprobado |
| ---: | --- | --- | --- |
| 1 | Identity API 0vrvqepcukwcubxga0narorf | ghcr.io/sherydans12/edupay-identity@sha256:960d326a9199881d54c7fc9611d052be77c0fbdceae4badebfe1208febe5aa01 | Running/healthy; health público 200; JWKS público y privado 200, una clave |
| 2 | Académico API iobfkpujjoa2kj5urbpnjvzi | ghcr.io/sherydans12/edupay-academico@sha256:902c5e2ed1aa59d4e2ca7e6a558aaa113585b3737fc6ed4346bb6597531ac393 | Running/healthy; ready 200; database, storage y malwareScanner en ok |
| 3 | Académico FRONT cct0rtf5iku6fkd3t9hldnv4 | ghcr.io/sherydans12/edupay-academico-web@sha256:c117c718352ede7220f4f685711d7df4bc88384b304bb19970d9379aa9fc0d81 | Running/healthy; /login 200; 9 de 9 bundles estáticos 200 |

El recurso FRONT previo qf65r4ltig6jhb6t8dmv2qyw se detuvo desde Coolify después de liberar el dominio canónico para el candidato inmutable. Para una reversión futura, reasignar el dominio por Coolify al recurso previo y verificar el runtime antes de quitar cualquier otro control; no se ha eliminado su configuración de build. El candidato usa academico.edupay.baselogic.cl. Coolify también muestra la variante www sin DNS válido; el host canónico sí resolvió y respondió.

Académico continúa llamando a Identity por la red privada Coolify mediante http://identity-0vrvqepcukwcubxga0narorf:3000. Se conservaron el hook connect_to_docker_network y la coincidencia de credenciales existentes; los valores no se imprimieron ni rotaron. El JWKS privado respondió 200 y la petición S2S con identificador sintético inexistente fue rechazada con 404 controlado. Una lectura DIE no autenticada fue rechazada con 401.

La regla die-release-maintenance-20260924.yaml devolvió 503 para todas las rutas públicas de Identity y Académico API durante la ventana. Tras validar Identity, API y FRONT, se borró únicamente esa configuración desde Coolify → Server → Proxy → Dynamic Configurations. La regla no aparece en la lista activa y no queda 503. No se editaron los routers generales, otras reglas, BL ni Coolify. El paquete conserva una copia de la regla utilizada como referencia histórica inactiva.

## Estado operativo y recuperación

- El scheduler/outbox de Identity volvió junto con su runtime; no hubo replay manual de eventos históricos.
- Los workers Académico permanecieron detenidos como estaban antes de la ventana. No se modificaron workers ni ClamAV.
- Storage privado respondió correctamente y el scanner real de ClamAV está ok. La comprobación observó 35 archivos privados y 7.320.215 bytes.
- No se cambiaron DATABASE_URL, credenciales, flags ni conexiones a bases. No se usó migrate resolve ni se ejecutaron migraciones adicionales.
- El migrador Identity anterior sha256:fa88615b0d08abf807ad4667b2812326648fa855aacc6221bb752b35cf2409b7 queda retirado porque su imagen carecía de schema-engine. El migrador corregido por digest remoto es ghcr.io/sherydans12/edupay-identity-migrate@sha256:ad9edaa31bf01d4916846527041eadd65310ce21454bfb4d419d4ca2bfba9363. El migrador Académico usado es ghcr.io/sherydans12/edupay-academico-migrate@sha256:15247fe66c8345181a6bfe7e6ab9b40c889372bcab7dfa75de481cc074e34a13.
- El módulo está desplegado. No se ha configurado ni validado un piloto por el usuario.

Ante un gate fallido futuro, detener la promoción, conservar datos y recovery point y recuperar el recurso afectado mediante Coolify y los artefactos verificados. No borrar volúmenes ni revertir destructivamente el esquema. El procedimiento reproducible y sanitizado está en [DIE-MAINTENANCE.md](DIE-MAINTENANCE.md); el cierre con ledger y verificaciones está en el manifiesto del paquete DIE.
