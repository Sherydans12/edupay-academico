-- Fase 5 / Block body: additive JSONB storage. Existing scalar Markdown fields
-- remain authoritative fallback data and are intentionally not removed.
--
-- The schema already owns these Fase 4/5 persistence models, but the baseline
-- migration chain did not materialize their tables. Create them before adding
-- the body_document columns so a fresh disposable database follows the same
-- schema as an upgraded database.
ALTER TABLE "learning_units"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "learning_items"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE TYPE "ContentEntityType" AS ENUM ('LEARNING_UNIT', 'LEARNING_ITEM');

CREATE TYPE "ContentRevisionOperation" AS ENUM (
  'CREATED',
  'UPDATED',
  'SENSITIVE_CHANGE_CONFIRMED',
  'SCHEDULED',
  'PUBLISHED',
  'UNPUBLISHED',
  'ARCHIVED',
  'REORDERED',
  'MOVED',
  'DUPLICATED',
  'DRAFT_SAVED',
  'DRAFT_DISCARDED',
  'DRAFT_PUBLISHED',
  'RESTORED'
);

CREATE TABLE "content_revisions" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(128) NOT NULL,
    "entity_type" "ContentEntityType" NOT NULL,
    "entity_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "operation" "ContentRevisionOperation" NOT NULL,
    "snapshot" JSONB NOT NULL,
    "actor_identity_user_id" VARCHAR(128) NOT NULL,
    "request_id" VARCHAR(128),
    "restored_from_revision" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_revisions_pkey" PRIMARY KEY ("tenant_id", "id")
);

CREATE UNIQUE INDEX "content_revisions_entity_revision_key"
ON "content_revisions"("tenant_id", "entity_type", "entity_id", "revision_number");

CREATE INDEX "content_revisions_tenant_id_entity_type_entity_id_revision_number_idx"
ON "content_revisions"("tenant_id", "entity_type", "entity_id", "revision_number");

CREATE TABLE "learning_item_drafts" (
    "tenant_id" VARCHAR(128) NOT NULL,
    "learning_item_id" UUID NOT NULL,
    "title" VARCHAR(160),
    "description" TEXT,
    "content" TEXT,
    "instructions" TEXT,
    "body" TEXT,
    "due_at" TIMESTAMPTZ(3),
    "based_on_version" INTEGER NOT NULL,
    "updated_by_identity_user_id" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "learning_item_drafts_pkey" PRIMARY KEY ("tenant_id", "learning_item_id")
);

ALTER TABLE "content_revisions"
ADD CONSTRAINT "content_revisions_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "learning_item_drafts"
ADD CONSTRAINT "learning_item_drafts_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "learning_item_drafts"
ADD CONSTRAINT "learning_item_drafts_tenant_id_learning_item_id_fkey"
FOREIGN KEY ("tenant_id", "learning_item_id")
REFERENCES "learning_items"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
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
