# Reconciliación Prisma Académico — ensayo y procedimiento de revisión

Estado: **PRISMA_RECONCILIATION_REHEARSAL_PASS**. El ensayo fue aislado; no
declara producción migrada, no autoriza release y no ejecutó `migrate resolve`,
DDL ni DML contra producción.

## Alcance y estado inicial

Se conservaron los worktrees posteriores indicados en la solicitud:

| Repositorio | Worktree                                   | SHA inicial                                | Estado inicial |
| ----------- | ------------------------------------------ | ------------------------------------------ | -------------- |
| Académico   | `projection-phase1-production-integration` | `d862086b2618bf82e3cb89639d3c7cb416c02251` | limpio         |
| BL-002      | `projection-phase1-production-integration` | `16e208af6a50e5703bc8f6edd51d7ff11b9c6381` | limpio         |

La identidad productiva se confirmó en `docs/operations/coolify-inventory.json`:
Academic PostgreSQL, UUID `v5w9hacwtftulf4m46l1rn2g`, `postgres:15-alpine`,
proyecto `p5gswqrr8ot1oaoxwytrpsho`, entorno `oej046b1ozl6a1w329bx8zdd` y
servidor `h10grmpaqnhiissqexi1k4mu`. La lectura se hizo en PostgreSQL 15.18
mediante el terminal del recurso; no se imprimieron credenciales, URLs con
secretos, filas de negocio ni dumps.

## Evidencia productiva read-only

El ledger observado tiene siete filas, todas terminadas, sin rollback y con un
paso aplicado. Los seis primeros checksums coinciden con los archivos actuales.
La séptima migración también coincide byte a byte con el SQL histórico:

| Migración                                                    | SHA256 observado                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------ |
| `20260808195654_academic_structure`                          | `b878b48bbed5cdec5c76dbf7f0de1529fcaa99ca28e08c4221ed676693e7c278` |
| `20260808220000_learning_content`                            | `6642dea7b20270d7725fbd754a33c8a5ad21e27a12474c60e118097c86b4800c` |
| `20260808230000_storage_submissions`                         | `dd907d441ad59a4cb650099dd9ad97f88c2feb759d7ee820b1651427d192f23c` |
| `20260809000000_hardened_upload_transport`                   | `f825c4c5ecdbc5b33324a674b1102270570e0cb3ad339c7bf78dbcb41ceef6d9` |
| `20260809100000_academic_notifications`                      | `32f02f387150f22a84f875a20c9a837f7a8fb0dc980e3eb557e8bf4ac079ee14` |
| `20260811190000_edupay_sync_consumer`                        | `d9f90e683ad76750d080352bdc8ecc0ead17c9cf27121915aa7bdd578541bcdb` |
| `20260820160800_add_content_revisions_drafts_and_versioning` | `06cf265fd5c13fdf0d1070eefbaf83c1d73d3949eead0f9836721cfda3b8a670` |

La comparación del catálogo completo de efectos relevantes encontró:

- `content_revisions`, `learning_item_drafts`, `learning_items.version`,
  `learning_units.version`, ambos enums, PK/FK e índices históricos: presentes
  y equivalentes. Los nombres acortados de PostgreSQL son los nombres efectivos
  de los identificadores de 63 bytes; no se trató una diferencia de nombre como
  una prueba suficiente de equivalencia.
- `command_receipts`: presente con sus 9 columnas, PK `(tenant_id, id)`, FK a
  `tenants`, índice temporal e índice único por tenant/actor/comando/idempotency.
- `body_document`: `jsonb`, nullable, en `learning_items` y
  `learning_item_drafts`.
- Conteos read-only: `learning_items=21`, `body_document_nonnull=0`,
  `body_document_null=21`; `learning_item_drafts=0`; `content_revisions=100`;
  `command_receipts=0`. Las 21 filas de `learning_items` son candidatas al
  backfill determinista de 8/25. No se leyó el texto de ninguna fila.
- No existen las tres columnas de `course_enrollments` ni relaciones
  `financial_projection%` de la candidata 9/3.

La diferencia real pendiente no era estructural: era el efecto de datos del
backfill de `20260825113000_add_learning_body_document`. Marcar esa migración
como aplicada antes de ejecutar ese efecto habría dejado una divergencia real.

## Cambio del candidato

Se restauró en el árbol la migración histórica exacta recuperada de
`06a3c20`, con SHA `06cf265fd5c13fdf0d1070eefbaf83c1d73d3949eead0f9836721cfda3b8a670`.
La migración candidata 8/25 se redujo a sus efectos aún faltantes: las dos
columnas `body_document` y el backfill determinista. El SHA anterior de esa
migración pendiente era `87dcb4051155659a682e6d198b6620af0469b0796ba466f3cfad068130577d65`;
el SHA del archivo reconciliado es `a6ed7fa4d77841d1ff1e75c8f4fa8096b1e351b321ea5e33108c95724899b687`.

Esto no cambia ningún checksum ya aplicado en producción: 8/24 y 8/25 no
figuran en su ledger. Cambiar una migración aún no aplicada evita que una base
nueva ejecute dos veces las tablas que la historia productiva ya contiene; la
historia histórica se conserva literalmente, no se oculta.

## Ensayo reproducible

Precondiciones: Docker activo, Node 22+, pnpm 10.19.0 y dependencias del
worktree instaladas. El script crea únicamente un contenedor `postgres:15-alpine`
efímero en loopback, dos bases sintéticas y credenciales `rehearsal`; elimina
el contenedor al terminar.

```powershell
corepack pnpm@10.19.0 run prisma:reconciliation:rehearsal
```

El script ejecuta, en orden:

1. aplica las seis migraciones base y la migración histórica exacta en una base
   vacía;
2. inserta tenant, estructura académica, matrícula, tres learning items,
   un draft y una revisión, todo sintético;
3. aplica `scripts/prisma-reconciliation/academic-additive-repair.sql`, cuyo
   SHA es `299f85545b9803ede933a425715bb67e8817d260327d2289049fcd533b3295d5`;
4. comprueba columnas, enums, PK/FK, índices, counts y ausencia financiera;
5. ejecuta el backfill controlado de
   `scripts/prisma-reconciliation/reconcile-body-documents.sql` y verifica
   `3` documentos de item y `1` de draft;
6. ejecuta únicamente `prisma migrate resolve --applied` para 8/24 y 8/25,
   después `prisma migrate deploy` para 9/3;
7. comprueba ledger final de 10 filas, `migrate status` 0, tres tablas
   financieras, conservación de counts/contenido y la proyección de matrícula;
8. repite `migrate deploy` y `migrate status` desde una base nueva, para
   cubrir también el camino desde cero después de restaurar la historia.

Resultado observado:

```text
PRISMA_RECONCILIATION_REHEARSAL_PASS
final_candidate_status_exit=0
fresh_candidate_status_exit=0
historical_migration_sha256=06cf265fd5c13fdf0d1070eefbaf83c1d73d3949eead0f9836721cfda3b8a670
repair_sql_sha256=299f85545b9803ede933a425715bb67e8817d260327d2289049fcd533b3295d5
```

## Procedimiento productivo que requeriría autorización

No se ejecutó. Antes de autorizarlo, Operaciones debe volver a crear y verificar
un backup restaurable de PostgreSQL Académico y confirmar ventana sin runner de
migraciones concurrente. La evidencia de 2026-09-11 no se extiende
automáticamente a una ventana posterior.

1. Congelar el SHA candidato y comparar `git status`, imagen/digest API,
   `RUN_MIGRATIONS` y el recurso Coolify por UUID. Mantener flags de producer y
   publisher apagados.
2. Ejecutar el archivo read-only
   `scripts/prisma-reconciliation/production-preflight.sql` contra el recurso
   `v5w9hacwtftulf4m46l1rn2g`. Guardar sólo salida redactada con ledger,
   checksums, catálogo y counts agregados. Abortar si cambia cualquiera de los
   preflight observado, si hay migración fallida/rollback o si aparece un
   objeto financiero inesperado.
3. Con autorización específica para la mutación de datos, ejecutar en una sola
   transacción el contenido exacto de
   `scripts/prisma-reconciliation/reconcile-body-documents.sql`. Verificar
   `UPDATE` counts antes de commit y repetir el preflight; no ejecutar la
   reparación aditiva histórica porque ya está aplicada.
4. En el mismo control de cambio, y sólo después de comprobar el catálogo y el
   backfill, ejecutar desde el artefacto candidato:

   ```text
   pnpm --filter @edupay/api exec prisma migrate resolve --applied 20260824140000_command_receipts_and_sparse_ordering
   pnpm --filter @edupay/api exec prisma migrate resolve --applied 20260825113000_add_learning_body_document
   pnpm --filter @edupay/api exec prisma migrate deploy
   pnpm --filter @edupay/api exec prisma migrate status
   ```

   El `DATABASE_URL` debe venir del secreto administrado del recurso; no se
   imprime, no se pega en Git y no se documenta con su valor. `migrate status`
   debe terminar 0 y mostrar las diez migraciones, con el checksum histórico
   intacto.

5. Verificar con consultas read-only el ledger, columnas, índices, constraints,
   counts de backfill, las tres tablas/columnas financieras, liveness/ready y
   un smoke de Académico con flags apagados. Sólo una autorización separada por
   tenant puede activar posteriormente el producer/publisher.

## Rollback y riesgos

- El rollback de aplicación es compatible: el binario publicado basado en
  `b2f489f3bfbb67da8fc8ff71be7ea551e1de27c9` pasó `learning-domain.e2e-spec.ts`
  **11/11** contra el esquema final aislado. Las columnas/tablas nuevas se
  conservan; el binario anterior no las necesita.
- No existe rollback de esquema destructivo. Nunca usar `migrate reset`,
  `DROP`, `TRUNCATE`, downgrade automático ni borrar filas para volver atrás.
- El backfill es aditivo sobre `body_document` y deja intactos los campos
  escalares. Si falla después del commit, detener la promoción, volver al
  binario compatible y preservar las adiciones; la recuperación de datos usa
  sólo un backup verificado y un restore aislado.
- Si `migrate resolve` o `migrate status` no terminan como arriba, detenerse:
  no registrar una migración por conveniencia ni cambiar checksums para hacer
  coincidir el ledger.

## Archivos de esta intervención

- `apps/api/prisma/migrations/20260820160800_add_content_revisions_drafts_and_versioning/migration.sql`
  — historia restaurada, SHA histórico exacto.
- `apps/api/prisma/migrations/20260825113000_add_learning_body_document/migration.sql`
  — migración pendiente reconciliada, SHA `a6ed7fa4…`.
- `scripts/prisma-reconciliation/academic-additive-repair.sql` — copia exacta
  del SQL autorizado, SHA `299f8554…`.
- `scripts/prisma-reconciliation/reconcile-body-documents.sql` — backfill
  separado para demostrar antes de resolver, SHA
  `54bf07f324ab2a130eeeb73440463a28c153223395d6f460cb5248a6dd4fb8b8`.
- `scripts/prisma-reconciliation/production-preflight.sql` — sólo lectura,
  SHA `cf14235b4a5d7d1b3c5e08c1871adf4632f1b2823ce99b787e0c62cb359c5372`.
- `scripts/prisma-reconciliation-rehearsal.mjs` — reconstrucción, ensayo y
  limpieza disposable.
