-- Fase 5 / Block body: additive JSONB storage. Existing scalar Markdown fields
-- remain authoritative fallback data and are intentionally not removed.
ALTER TABLE "learning_items"
ADD COLUMN "body_document" JSONB;

ALTER TABLE "learning_item_drafts"
ADD COLUMN "body_document" JSONB;

-- Deterministic compatibility backfill. The original scalar columns are kept
-- unchanged so rollback can disable document reads without losing content.
UPDATE "learning_items"
SET "body_document" = jsonb_build_object(
  'schemaVersion', 1,
  'blocks', jsonb_build_array(jsonb_build_object(
    'id', 'legacy-body',
    'type', 'TEXT',
    'text', CASE "type"
      WHEN 'MATERIAL' THEN "content"
      WHEN 'ASSIGNMENT' THEN "instructions"
      WHEN 'ASSESSMENT' THEN "instructions"
      WHEN 'ANNOUNCEMENT' THEN "body"
    END
  ))
)
WHERE "body_document" IS NULL
  AND COALESCE(
    CASE "type"
      WHEN 'MATERIAL' THEN "content"
      WHEN 'ASSIGNMENT' THEN "instructions"
      WHEN 'ASSESSMENT' THEN "instructions"
      WHEN 'ANNOUNCEMENT' THEN "body"
    END,
    ''
  ) <> '';

UPDATE "learning_item_drafts" AS draft
SET "body_document" = jsonb_build_object(
  'schemaVersion', 1,
  'blocks', jsonb_build_array(jsonb_build_object(
    'id', 'legacy-body',
    'type', 'TEXT',
    'text', CASE item."type"
      WHEN 'MATERIAL' THEN draft."content"
      WHEN 'ASSIGNMENT' THEN draft."instructions"
      WHEN 'ASSESSMENT' THEN draft."instructions"
      WHEN 'ANNOUNCEMENT' THEN draft."body"
    END
  ))
)
FROM "learning_items" AS item
WHERE draft."tenant_id" = item."tenant_id"
  AND draft."learning_item_id" = item."id"
  AND draft."body_document" IS NULL
  AND COALESCE(
    CASE item."type"
      WHEN 'MATERIAL' THEN draft."content"
      WHEN 'ASSIGNMENT' THEN draft."instructions"
      WHEN 'ASSESSMENT' THEN draft."instructions"
      WHEN 'ANNOUNCEMENT' THEN draft."body"
    END,
    ''
  ) <> '';
