-- Data-only part of 20260825113000_add_learning_body_document.
-- Run only after the read-only catalog preflight and an approved backup.
-- It is deliberately separate from migrate resolve: resolving a migration
-- never executes this data effect.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
  IF to_regclass('public.learning_items') IS NULL
     OR to_regclass('public.learning_item_drafts') IS NULL THEN
    RAISE EXCEPTION 'Learning tables are unavailable';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'learning_items'
      AND column_name = 'body_document' AND udt_name = 'jsonb'
      AND is_nullable = 'YES'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'learning_item_drafts'
      AND column_name = 'body_document' AND udt_name = 'jsonb'
      AND is_nullable = 'YES'
  ) THEN
    RAISE EXCEPTION 'body_document columns are not in the expected nullable JSONB state';
  END IF;
END $$;

UPDATE public.learning_items
SET body_document = jsonb_build_object(
  'schemaVersion', 1,
  'blocks', jsonb_build_array(jsonb_build_object(
    'id', 'legacy-body',
    'type', 'TEXT',
    'text', CASE type
      WHEN 'MATERIAL' THEN content
      WHEN 'ASSIGNMENT' THEN instructions
      WHEN 'ASSESSMENT' THEN instructions
      WHEN 'ANNOUNCEMENT' THEN body
    END
  ))
)
WHERE body_document IS NULL
  AND COALESCE(
    CASE type
      WHEN 'MATERIAL' THEN content
      WHEN 'ASSIGNMENT' THEN instructions
      WHEN 'ASSESSMENT' THEN instructions
      WHEN 'ANNOUNCEMENT' THEN body
    END,
    ''
  ) <> '';

UPDATE public.learning_item_drafts AS draft
SET body_document = jsonb_build_object(
  'schemaVersion', 1,
  'blocks', jsonb_build_array(jsonb_build_object(
    'id', 'legacy-body',
    'type', 'TEXT',
    'text', CASE item.type
      WHEN 'MATERIAL' THEN draft.content
      WHEN 'ASSIGNMENT' THEN draft.instructions
      WHEN 'ASSESSMENT' THEN draft.instructions
      WHEN 'ANNOUNCEMENT' THEN draft.body
    END
  ))
)
FROM public.learning_items AS item
WHERE draft.tenant_id = item.tenant_id
  AND draft.learning_item_id = item.id
  AND draft.body_document IS NULL
  AND COALESCE(
    CASE item.type
      WHEN 'MATERIAL' THEN draft.content
      WHEN 'ASSIGNMENT' THEN draft.instructions
      WHEN 'ASSESSMENT' THEN draft.instructions
      WHEN 'ANNOUNCEMENT' THEN draft.body
    END,
    ''
  ) <> '';

COMMIT;
