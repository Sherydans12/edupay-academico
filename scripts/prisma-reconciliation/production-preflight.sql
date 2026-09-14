-- Read-only production preflight for the Prisma reconciliation review.
-- No DDL/DML, migrate deploy, or migrate resolve is present in this file.

SELECT 'ledger' AS check_name,
       migration_name,
       checksum,
       finished_at,
       rolled_back_at,
       applied_steps_count
FROM "_prisma_migrations"
ORDER BY finished_at, migration_name;

SELECT 'column' AS check_name,
       table_name,
       ordinal_position,
       column_name,
       udt_name,
       is_nullable,
       COALESCE(column_default, '') AS column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'learning_items',
    'learning_units',
    'content_revisions',
    'learning_item_drafts',
    'command_receipts'
  )
ORDER BY table_name, ordinal_position;

SELECT 'index' AS check_name,
       tablename,
       indexname,
       indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'content_revisions',
    'learning_item_drafts',
    'command_receipts',
    'learning_items',
    'learning_units',
    'in_app_notifications',
    'notification_deliveries',
    'sync_item_results'
  )
ORDER BY tablename, indexname;

SELECT 'constraint' AS check_name,
       c.conrelid::regclass::text AS table_name,
       c.conname,
       c.contype,
       pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint AS c
JOIN pg_class AS r ON r.oid = c.conrelid
JOIN pg_namespace AS n ON n.oid = r.relnamespace
WHERE n.nspname = 'public'
  AND r.relname IN (
    'content_revisions',
    'learning_item_drafts',
    'command_receipts',
    'learning_items',
    'learning_units'
  )
ORDER BY 2, 3;

SELECT 'enum' AS check_name,
       t.typname,
       array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
FROM pg_type AS t
JOIN pg_enum AS e ON e.enumtypid = t.oid
JOIN pg_namespace AS n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
  AND t.typname IN ('ContentEntityType', 'ContentRevisionOperation')
GROUP BY t.typname
ORDER BY t.typname;

SELECT 'data_counts' AS check_name,
       'learning_items' AS object_name,
       count(*) AS total,
       count(body_document) AS body_document_nonnull,
       count(*) FILTER (WHERE body_document IS NULL) AS body_document_null
FROM learning_items
UNION ALL
SELECT 'data_counts', 'learning_item_drafts', count(*), count(body_document),
       count(*) FILTER (WHERE body_document IS NULL)
FROM learning_item_drafts
UNION ALL
SELECT 'data_counts', 'content_revisions', count(*), NULL, NULL
FROM content_revisions
UNION ALL
SELECT 'data_counts', 'command_receipts', count(*), NULL, NULL
FROM command_receipts;

SELECT 'backfill_candidates' AS check_name,
       'learning_items' AS object_name,
       count(*) AS rows
FROM learning_items
WHERE body_document IS NULL
  AND COALESCE(CASE type
    WHEN 'MATERIAL' THEN content
    WHEN 'ASSIGNMENT' THEN instructions
    WHEN 'ASSESSMENT' THEN instructions
    WHEN 'ANNOUNCEMENT' THEN body
  END, '') <> ''
UNION ALL
SELECT 'backfill_candidates', 'learning_item_drafts', count(*)
FROM learning_item_drafts AS draft
JOIN learning_items AS item
  ON draft.tenant_id = item.tenant_id
 AND draft.learning_item_id = item.id
WHERE draft.body_document IS NULL
  AND COALESCE(CASE item.type
    WHEN 'MATERIAL' THEN draft.content
    WHEN 'ASSIGNMENT' THEN draft.instructions
    WHEN 'ASSESSMENT' THEN draft.instructions
    WHEN 'ANNOUNCEMENT' THEN draft.body
  END, '') <> '';

SELECT 'projection_absence' AS check_name,
       'course_enrollments_financial_projection_columns' AS object_name,
       count(*) AS objects
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'course_enrollments'
  AND column_name IN (
    'financial_projection_version',
    'financial_projection_effective_from',
    'financial_projection_effective_to'
  )
UNION ALL
SELECT 'projection_absence', 'financial_projection_relations', count(*)
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname LIKE 'financial_projection%';
