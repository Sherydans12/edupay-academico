# Propuesta de release — proyección financiera con funcionalidades desactivadas

Estado: PROPUESTA NO AUTORIZADA. No ejecuta cambios productivos, no publica,
no fusiona y no activa funcionalidades.

## Bases y estado deseado

| Producto  | SHA candidato                            |
| --------- | ---------------------------------------- |
| Académico | 802a8158455558f43090ddf5b980ec3cb15a1660 |
| BL-002    | 16e208af6a50e5703bc8f6edd51d7ff11b9c6381 |

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
  No se cambia el archivo para hacer coincidir el ledger. Se compara catálogo
  y backfill; si todos los efectos ya están presentes, ese entorno queda
  reconciliado para 8/25 y sólo se planifica el siguiente cambio.
- Si falta cualquier efecto, el entorno queda fuera del release y requiere una
  reconciliación propia. Nunca se resuelve por conveniencia.

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

El preflight es read-only y guarda sólo salida agregada/redactada:

```sql
SELECT current_database(), current_user, version();

SELECT migration_name, checksum, finished_at, rolled_back_at,
       applied_steps_count
FROM "_prisma_migrations"
ORDER BY started_at, migration_name;

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'tenant_canonical_mappings',
    'academic_financial_projections',
    'academic_financial_projection_consumed_events',
    'academic_financial_projection_quarantine',
    'academic_financial_projection_snapshots'
  )
ORDER BY table_name;

SELECT typname
FROM pg_type
WHERE typname IN (
  'AcademicFinancialProjectionOperation',
  'AcademicFinancialProjectionEventOutcome',
  'AcademicFinancialProjectionSnapshotStatus'
)
ORDER BY typname;

SELECT table_name, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND (table_name = 'tenant_canonical_mappings'
       OR table_name LIKE 'academic_financial_projection%')
ORDER BY table_name, indexname;

SELECT 'tenant_canonical_mappings' AS relation, count(*)
FROM tenant_canonical_mappings
UNION ALL
SELECT 'academic_financial_projections', count(*)
FROM academic_financial_projections
UNION ALL
SELECT 'academic_financial_projection_consumed_events', count(*)
FROM academic_financial_projection_consumed_events
UNION ALL
SELECT 'academic_financial_projection_quarantine', count(*)
FROM academic_financial_projection_quarantine
UNION ALL
SELECT 'academic_financial_projection_snapshots', count(*)
FROM academic_financial_projection_snapshots;
```

Debe confirmar el ledger real, ausencia de fallidas/rollback, catálogo y
conteos. No se asumen filas ni checksums antes de la lectura.

Se referencia el restore aprobado de PostgreSQL 18 aislado sin errores como
evidencia del motor y de la cadena sintética. Sus límites siguen vigentes: no
certifica consistencia de la base productiva ni de uploads. El inventario
actual marca bl002RecoveryVerified=false; por tanto, antes de intervenir se
exige un punto vigente de PostgreSQL BL-002 y del volumen
/edupay-backend-uploads, con checksum, custodia fuera del volumen vivo y
restauración aislada verificable.

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

- Académico API: deploy/Dockerfile.api desde 802a815...; builder/runtime
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
construir y registrar digests inmutables desde ambos SHAs; pausar auto
deploy; publicar/fusionar sólo tras aprobación explícita; desplegar sólo
Académico API y BL BACK con sus gates.

D. Acciones expresamente excluidas:
activar producer, publisher, consumer/shadow, mappings o secretos S2S;
desplegar frontends, Identity o workers sanos; ejecutar cambios productivos
ahora; usar migraciones abiertas a pendientes imprevistos; modificar
checksums, borrar historia o hacer rollback destructivo de esquema.
