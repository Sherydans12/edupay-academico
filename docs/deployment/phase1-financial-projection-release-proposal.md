# Propuesta de release — proyección financiera con funcionalidades desactivadas

Estado: PROPUESTA NO AUTORIZADA. No ejecuta cambios productivos, no publica,
no fusiona y no activa funcionalidades.

## Bases, código de build y estado deseado

| Producto  | Baseline funcional                       | SHA exacto de build                      |
| --------- | ---------------------------------------- | ---------------------------------------- |
| Académico | 802a8158455558f43090ddf5b980ec3cb15a1660 | e5bd78a3c0588df540878b130d7d22cd039cf7d1 |
| BL-002    | 16e208af6a50e5703bc8f6edd51d7ff11b9c6381 | 16e208af6a50e5703bc8f6edd51d7ff11b9c6381 |

El baseline funcional Académico 802a815 contiene el runtime y la cadena de
migraciones reconciliada. El SHA final de build es e5bd78a3c0588df540878b130d7d22cd039cf7d1:
es el árbol exacto que se debe congelar si se autoriza el release. La
comparación 802a815..e5bd78a sólo contiene el cleanup del fixture de learning
y documentación; no cambia apps/api/src, apps/api/prisma, apps/web, packages,
deploy ni el runtime funcional. Por tanto, la evidencia de HTTP final, typecheck
y regresión valida inequívocamente el árbol e5bd78a, mientras que 802a815 sigue
siendo la referencia de funcionalidad implementada.

Durante todo el release:

- Académico mantiene ACADEMIC_FINANCIAL_PROJECTION_ENABLED=false y
  ACADEMIC_FINANCIAL_PROJECTION_PUBLISHER_ENABLED=false.
- BL mantiene ACADEMIC_FINANCIAL_PROJECTION_ENABLED=false.
- Producer, publisher, consumer/shadow y snapshots permanecen apagados.
- No se crean mappings productivos, credenciales S2S nuevas ni secretos reales.
- Las tablas se preparan, pero no reciben datos de proyección.

Se reutiliza la evidencia aprobada de HTTP, unitarias, typechecks, migraciones
sintéticas y restauración aislada. Sólo se repitieron los gates afectados por
esta reconciliación.

## 1. Backfill Académico

Archivo: scripts/prisma-reconciliation/reconcile-body-documents.sql

SHA256:
54bf07f324ab2a130eeeb73440463a28c153223395d6f460cb5248a6dd4fb8b8

### Lecturas y escrituras

Lee únicamente:

- learning_items.type, content, instructions, body y body_document.
- learning_item_drafts.tenant_id, learning_item_id, content, instructions,
  body y body_document.
- La relación draft → item por (tenant_id, learning_item_id).

Escribe únicamente body_document en learning_items y learning_item_drafts.
El valor es JSONB con schemaVersion 1 y un único bloque legacy-body de tipo
TEXT. El texto se deriva así:

| type         | Campo fuente |
| ------------ | ------------ |
| MATERIAL     | content      |
| ASSIGNMENT   | instructions |
| ASSESSMENT   | instructions |
| ANNOUNCEMENT | body         |

La selección exacta de items es:

```sql
body_document IS NULL
AND COALESCE(
  CASE type
    WHEN 'MATERIAL' THEN content
    WHEN 'ASSIGNMENT' THEN instructions
    WHEN 'ASSESSMENT' THEN instructions
    WHEN 'ANNOUNCEMENT' THEN body
  END,
  ''
) <> ''
```

Para drafts se añade el join por tenant/item, draft.body_document IS NULL y
la misma expresión sobre los campos del draft usando item.type.

El preflight productivo read-only observó:

- learning_items=21; body_document NULL=21; body_document no nulo=0.
- learning_item_drafts=0; candidatos de draft=0.

No se leyó ni registró texto de negocio. El conteo actual esperado es
21 items + 0 drafts.

### Preservación, concurrencia e idempotencia

- La condición IS NULL nunca sobrescribe un documento existente.
- UPDATE adquiere locks de fila normales. Si una edición concurrente de
  body_document confirma antes de que el backfill actualice la fila,
  PostgreSQL reevalúa la condición después de esperar el lock y la omite.
- Si el backfill obtiene primero el lock, la edición de aplicación espera y se
  aplica después; no se pierde el documento creado.
- No existe resolución de conflicto para dos ediciones separadas de campos
  escalares legacy. Por eso la operación productiva exige pausar escrituras de
  learning o una ventana de mantenimiento.
- Una segunda ejecución es no-op para documentos no nulos. Campos legacy vacíos
  permanecen en NULL deliberadamente.

El script ejecuta BEGIN, SET LOCAL lock_timeout='5s' y
SET LOCAL statement_timeout='30s', valida el catálogo esperado y hace COMMIT al
final. Un timeout, una validación fallida o cualquier error revierte toda la
transacción; no se acepta un conteo parcial.

El rollback del binario no revierte contenido. El binario anterior es
compatible con columnas aditivas y opcionales. Si el contenido materializado
fuera incorrecto después del commit, se conserva el esquema, se detiene la
promoción y se recupera desde un punto de recuperación verificado en un clon.
No se borra body_document ni se hace downgrade destructivo.

### Pausa y reanudación de escrituras

Los escritores de `learning_items`, `learning_item_drafts`,
`learning_units` y `content_revisions` son los comandos de learning del API
Académico (`edupay-academico-pinned`), invocados por el frontend. El frontend no
escribe PostgreSQL directamente. El notification worker lee learning para
crear notificaciones, y el sync worker escribe sus propias tablas de sync; no
son escritores de estas cuatro relaciones. Identity, BL y el publisher
desactivado tampoco escriben esas relaciones.

La ventana autorizada seguirá este procedimiento reversible:

1. Anunciar mantenimiento y bloquear temporalmente todas las rutas de escritura
   de learning deteniendo/pausando todas las réplicas del API Académico en
   Coolify. El frontend puede permanecer publicado, pero no se deben aceptar
   escrituras mientras el API esté pausado. Se detienen también los dos workers
   Académico por simplicidad operativa; no se modifica Identity ni BL.
2. Confirmar en Coolify el estado pausado de `iobfkpujjoa2kj5urbpnjvzi`,
   `nn8yrhitex2r6squev0auwrs` y `r8mtn1xqtex96j4a8wu5hae6`, y comprobar que no
   hay réplicas reiniciando. Contra la DB, ejecutar una consulta agregada de
   `pg_stat_activity` para confirmar cero transacciones no idle cuyo query
   contenga INSERT/UPDATE/DELETE sobre las relaciones de learning. La consulta
   agregada es:

   ```sql
   SELECT count(*) AS active_learning_writers
   FROM pg_stat_activity
   WHERE datname = current_database()
     AND state <> 'idle'
     AND query ~* '(insert|update|delete).*(learning_items|learning_item_drafts|learning_units|content_revisions)';
   ```

   Debe devolver 0. Repetir la
   observación tras un intervalo de quietud y registrar sólo counts, pid y
   estado, no SQL completo ni secretos.

3. Ejecutar el backfill y su verificación dentro de la transacción. Si falla
   antes de COMMIT, confirmar rollback y que los counts de `body_document` no
   cambiaron.
4. Repetir el preflight y el postflight read-only. Sólo entonces reanudar API,
   notification worker y sync worker en su configuración anterior, comprobar
   live/ready y confirmar que las rutas de learning vuelven a responder. Si la
   operación aborta después de COMMIT, se mantienen las adiciones, se inicia
   el binario compatible anterior y se trata el contenido mediante restore
   verificado; no se reanudan escrituras hasta cerrar ese diagnóstico.

La pausa es una precondición de operación, no una propiedad que el SQL pueda
garantizar por sí solo.

La reparación estructural anterior no se vuelve a ejecutar. Su copia local,
academic-additive-repair.sql, conserva SHA256
299f85545b9803ede933a425715bb67e8817d260327d2289049fcd533b3295d5.

## 2. Historia de migraciones

La migración histórica restaurada es
20260820160800_add_content_revisions_drafts_and_versioning. Coincide byte a
byte con el SQL recuperado de 06a3c20 y su SHA256 es:

06cf265fd5c13fdf0d1070eefbaf83c1d73d3949eead0f9836721cfda3b8a670

Ya figura aplicada en el ledger Académico. No se resuelve ni se ejecuta otra
vez en producción.

El archivo modificado es
apps/api/prisma/migrations/20260825113000_add_learning_body_document/migration.sql.

Su versión anterior, presente en origin/main,
codex/production-stable-baseline, codex/operational-remediation-release y
codex/course-builder-release-integration-final, tenía SHA256:

87dcb4051155659a682e6d198b6620af0469b0796ba466f3cfad068130577d65

Esa versión repetía efectos históricos de versionado/drafts. La versión
candidata contiene sólo columnas body_document y el backfill, con SHA256:

a6ed7fa4d77841d1ff1e75c8f4fa8096b1e351b321ea5e33108c95724899b687

La evidencia disponible no demuestra que la versión anterior se haya aplicado
en otra base mantenida distinta de esos refs Git. El ledger productivo
Académico leído tenía siete filas y no contenía 8/24 ni 8/25. Un archivo en un
ref no es evidencia de ledger.

Para cada otro entorno mantenido:

- Si 8/25 no está aplicada, se usa esta versión y se ejecuta el backfill antes
  de resolverla.
- Si 8/25 figura aplicada con el SHA anterior, se conserva checksum e historia.
  No se cambia el archivo para hacer coincidir el ledger ni se declara el
  entorno reconciliado sólo porque sus tablas o columnas existan. Hay que
  comparar ledger, SQL aplicado, columnas, constraints, índices, enums y
  counts del backfill; hasta completar esa evidencia el entorno queda fuera de
  este release.
- Si la evidencia demuestra que la versión anterior ya produjo todos sus
  efectos, se usa para ese entorno un artefacto que conserve byte a byte su
  migración aplicada y sólo se planifica el siguiente cambio. El checksum
  aplicado nunca se altera.
- Si falta cualquier efecto o no se puede probar la equivalencia, el entorno
  queda fuera del release y requiere una reconciliación propia. Nunca se
  resuelve por conveniencia.

### Migraciones Académico

Sólo se resolverán o ejecutarán estos nombres completos:

1. 20260824140000_command_receipts_and_sparse_ordering — resolve --applied
   después de confirmar los objetos de la reparación.
2. 20260825113000_add_learning_body_document — backfill separado y luego
   resolve --applied.
3. 20260903110000_financial_projection_producer — SQL estructural real.

Hashes:

- 8/24: 0b4dfe453c28e8e48234535e143baa51109f75c576fdc07b4ca56fa521e0eed5
- 8/25 reconciliada: a6ed7fa4d77841d1ff1e75c8f4fa8096b1e351b321ea5e33108c95724899b687
- 9/3: 0eba750ca6cd30c01646d37bee407edee9d81e37d913dde9da31864adbe8f55e

No se permite lanzar Prisma desde una rama arbitraria. El operador debe
congelar este árbol y comprobar que el inventario local y el conjunto
pendiente coinciden exactamente con la lista. Si aparece otra migración,
checksum modificado o migración faltante, se aborta. No se resuelve 9/3: su SQL
debe ejecutarse realmente. Un migrate deploy sin esa guarda queda expresamente
prohibido.

### Migraciones BL-002

Se aplicarán, en este orden y sólo si el preflight real confirma que están
pendientes:

1. 20260903090000_add_tenant_canonical_mapping — SHA256
   8650645eb0cd5a9bdd5e15391ceef596a24f51fbef8f83ef305cc28b2c1e384b.
   Crea mapping explícito, constraints e índices; no hace backfill.
2. 20260903113000_add_academic_financial_projection_shadow — SHA256
   6aee6fd2b0dfc058296250c4675b78d3f5840d55a4dc5ac9115d6745f4f942fb.
   Crea enums, tablas, constraints e índices shadow; no hace backfill ni
   escribe datos financieros.

No se resolverán migraciones BL. El runner one-shot sólo se autoriza si el
ledger real demuestra que el conjunto pendiente es exactamente el subconjunto
ordenado de esos dos nombres. Una migración adicional o checksum distinto
detiene la operación.

## 3. Preflight BL-002, restore y RUN_MIGRATIONS

Recurso real: PostgreSQL BL-002 dms5i3e0i5t4kyh7h683mi7v, imagen
postgres:18-alpine. BACK: km0aljzabdiqtaixj9dsequu.

El preflight ejecutable, read-only y con soporte de esquema anterior es
`BL-002/scripts/academic-financial-projection-preflight.sql`.
SHA256 del archivo:
`560c19179c2c0b4290340e13f9f098bbd195f29e2b51e217daa881e1d65f4e2d`.
Se ejecuta
con `ON_ERROR_STOP`; no imprime secretos ni payloads:

```powershell
Get-Content scripts/academic-financial-projection-preflight.sql -Raw |
  psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f -
```

La consulta de índices usa `pg_indexes.tablename`. Los counts son condicionales
mediante `to_regclass` y un bloque dinámico, por lo que no falla si las tablas
candidatas todavía no existen. El mismo script sirve como preflight y
postflight; `ABSENT` es esperado antes de las migraciones y `PRESENT` después.

Resultado reproducible en PostgreSQL 18 aislado, usando los nombres sintéticos
`bl_preflight_old` y `bl_preflight_updated`:

- Esquema anterior: exit 0, 26 migraciones, cero fallidas/incompletas, cinco
  tablas y tres enums `ABSENT`, cero índices/constraints candidatos y notices
  de counts `ABSENT`.
- Esquema actualizado: exit 0, 28 migraciones, cero fallidas/incompletas,
  cinco tablas y tres enums `PRESENT`, 18 índices, 50 constraints y counts 0
  para mappings y todas las tablas shadow.
- Ambos resultados terminaron con
  `BL_FINANCIAL_PROJECTION_PREFLIGHT_COMPLETE`.

No se ejecutó este script contra producción; su ejecución productiva queda como
gate read-only obligatorio antes de autorizar la intervención.

La evidencia disponible incluye restauración verificada del backup real
protegido de BL-002 y el restore aislado de PostgreSQL 18 sin errores. La
restauración comprobada no equivale a certificar consistencia completa de la
base productiva ni cobertura íntegra de uploads. El inventario se reconcilió a
`bl002RecoveryVerified=true`, con fecha 2026-09-14 y ese alcance explícito.
Antes de intervenir se exige además un recovery point vigente de PostgreSQL
BL-002 y del volumen `/edupay-backend-uploads`, con checksum, custodia fuera del
volumen vivo y restauración aislada verificable.

BL BACK conserva RUN_MIGRATIONS=false. Las dos migraciones se ejecutan sólo
desde un runner one-shot controlado contra el artefacto congelado. Un redeploy
no puede ser el mecanismo accidental de migración.

## 4. Artefactos, compatibilidad y operación

### Imágenes y recursos

Pins actuales de rollback:

- Académico API/workers: commit
  b2f489f3bfbb67da8fc8ff71be7ea551e1de27c9 e imagen
  ghcr.io/sherydans12/edupay-academico@sha256:b3e45d7c0afad1729947bdea6fe16d517c3dc9060891b38b313ce14a0548084a.
- BL-002 FRONT/BACK: código publicado
  502e6463464de0a54b440362a64da0c31450818f. Se conserva la imagen y
  configuración actualmente desplegadas como rollback; no se inventa un digest
  no registrado.

Artefactos candidatos a construir, sin publicar todavía:

- Académico API: deploy/Dockerfile.api desde e5bd78a3c0588df540878b130d7d22cd039cf7d1; builder/runtime
  node:22-bookworm@sha256:8a34c4ab3ea2c5cd194f07e317b2a8f09461d3c8b05c4e34c8ccd56d56024c4d.
  El digest OCI final se registra antes de desplegar.
- BL-002 BACK: backend/Dockerfile desde 16e208a...; base node:20-alpine.
  El digest OCI final se registra antes de desplegar. No se usa latest.
- No se construyen ni publican Academic FRONT, BL FRONT, Identity,
  notification worker ni sync worker: no hay cambios necesarios en UI, Identity
  o esos workers. Sus versiones actuales siguen pinned y son compatibles con
  el esquema aditivo.

Recursos Coolify afectados:

| Orden | Recurso              | UUID                     | Acción                            |
| ----- | -------------------- | ------------------------ | --------------------------------- |
| 1     | PostgreSQL Académico | v5w9hacwtftulf4m46l1rn2g | preflight, backfill y migraciones |
| 2     | PostgreSQL BL-002    | dms5i3e0i5t4kyh7h683mi7v | preflight y migraciones BL        |
| 3     | Académico API        | iobfkpujjoa2kj5urbpnjvzi | imagen candidata y health         |
| 4     | BL-002 BACK          | km0aljzabdiqtaixj9dsequu | imagen candidata y health         |

No se modifica Academic FRONT qf65r4ltig6jhb6t8dmv2qyw, BL FRONT
ktgdely86kx0by10p9cb91os, Identity 0vrvqepcukwcubxga0narorf, notification
worker nn8yrhitex2r6squev0auwrs ni sync worker
r8mtn1xqtex96j4a8wu5hae6.

### Orden operativo

1. Congelar SHAs, artefactos de rollback, variables por nombre/presencia,
   imágenes actuales y digests candidatos. No copiar secretos.
2. Pausar o bloquear auto deploy antes de publicar o fusionar. El inventario
   marca auto deploy activo en BL FRONT y BACK; Academic FRONT está desactivado.
   Verificar Coolify, webhooks y rama antes de cualquier merge.
3. Confirmar recovery points vigentes de ambas bases y, para BL, uploads.
4. Ejecutar preflights read-only; abortar ante ledger, checksum, objeto o
   conteo no clasificado.
5. Con autorización separada de datos, pausar escrituras de learning y ejecutar
   el backfill Académico. Repetir preflight y verificar counts.
6. Resolver 8/24 y 8/25 en Académico; después ejecutar sólo 9/3 desde el
   artefacto congelado, verificando ledger y status.
7. Aplicar mapping y luego shadow en BL desde one-shot, manteniendo
   RUN_MIGRATIONS=false; comprobar ledger y catálogo después de cada nombre.
8. Desplegar Académico API y BL BACK sólo después de sus esquemas. Ejecutar
   live/ready/health y smoke con flags apagados.
9. Mantener frontends, Identity y workers sanos sin redeploy. Cualquier worker
   requiere un cambio separado.

### Gates y rollback por recurso

- DB Académico: ledger completo, checksum histórico intacto, backfill con
  conteos esperados, constraints/índices presentes y sólo 9/3 como ejecución
  estructural nueva.
- DB BL: nombres/checksums esperados, tablas/enums/índices/constraints
  correctos, cero mappings y cero filas shadow.
- Académico API: live/ready 200, CORS y DB propia; flags false y sin S2S.
- BL BACK: health 200, DB propia, uploads montados y RUN_MIGRATIONS=false.
- Rutas: dominios, redes, puertos, Identity y ClamAV intactos.

Si falla un recurso, se restaura sólo su imagen/configuración anterior y se
repiten sus gates. El rollback de aplicación no elimina columnas, tablas,
índices, mappings ni documentos. No usar migrate reset, DROP, TRUNCATE,
downgrade automático ni borrar filas para simular rollback de esquema.

## 5. Validación final

Ejecutado sólo en PostgreSQL aislado de loopback:

```text
HTTP: financial-projection.integrated-http.e2e-spec.ts — 8/8 PASS
Learning: learning-domain.e2e-spec.ts — 11/11 PASS
Académico API typecheck — PASS
BL mapping/shadow unitarias — 2 suites, 15/15 PASS
```

El primer intento de learning falló porque el fixture no conocía las nuevas FKs
de projection y no borraba snapshots/outbox antes de tenant.deleteMany. Se
añadió únicamente ese cleanup; una base nueva recibió las diez migraciones
candidatas y luego el resultado fue 11/11.

La evidencia aprobada que no fue afectada sigue vigente: HTTP integrado
anterior, BL unitarias previas, typechecks de ambos repositorios, rehearsal
Prisma, restore PG18 aislado y migraciones sintéticas. No se reabren auditorías
no relacionadas.

La propuesta y el ajuste mínimo del fixture quedan en commits locales limpios;
no se publican ni fusionan como parte de esta preparación. El worktree BL-002
conserva el SHA solicitado y queda sin cambios.

## Autorización propuesta — no ejecutar todavía

A. Cambios de datos y ledger:
backfill Académico de 21 items + 0 drafts, pausa de escrituras, resolve de
8/24 y 8/25 sólo después de probar sus efectos; cero mappings y cero filas
shadow/projection en BL.

B. Migraciones:
Académico 20260824140000_command_receipts_and_sparse_ordering,
20260825113000_add_learning_body_document y
20260903110000_financial_projection_producer, en ese tratamiento exacto;
BL 20260903090000_add_tenant_canonical_mapping seguido de
20260903113000_add_academic_financial_projection_shadow sólo si el
preflight real confirma que están pendientes.

C. Publicación/merge y despliegues:
construir y registrar digests inmutables desde Académico
e5bd78a3c0588df540878b130d7d22cd039cf7d1 y BL-002
16e208af6a50e5703bc8f6edd51d7ff11b9c6381; pausar auto deploy;
publicar/fusionar sólo tras aprobación explícita; desplegar sólo Académico
API y BL BACK con sus gates.

D. Acciones expresamente excluidas:
activar producer, publisher, consumer/shadow, mappings o secretos S2S;
desplegar frontends, Identity o workers sanos; ejecutar cambios productivos
ahora; usar migraciones abiertas a pendientes imprevistos; modificar
checksums, borrar historia o hacer rollback destructivo de esquema.
