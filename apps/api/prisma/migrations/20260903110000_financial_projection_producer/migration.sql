-- Phase 1C-A. CREATED and schema-validated only; never applied to a real
-- school database by this change. Existing enrollments get a durable v1
-- projection state, while subsequent mutations increment it transactionally.

CREATE TYPE "FinancialProjectionOutboxStatus" AS ENUM ('PENDING', 'PUBLISHING', 'PUBLISHED', 'RETRY', 'FAILED');

ALTER TABLE "course_enrollments"
  ADD COLUMN "financial_projection_version" BIGINT NOT NULL DEFAULT 1,
  ADD COLUMN "financial_projection_effective_from" TIMESTAMPTZ(3),
  ADD COLUMN "financial_projection_effective_to" TIMESTAMPTZ(3);

-- Existing rows preserve their auditable enrollment creation time rather than
-- pretending the Phase 1C migration was the effective date.
UPDATE "course_enrollments"
SET "financial_projection_effective_from" = "created_at"
WHERE "financial_projection_effective_from" IS NULL;
ALTER TABLE "course_enrollments"
  ALTER COLUMN "financial_projection_effective_from" SET NOT NULL,
  ALTER COLUMN "financial_projection_effective_from" SET DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "financial_projection_outbox_events" (
  "id" UUID NOT NULL,
  "sequence" BIGSERIAL NOT NULL,
  "tenant_id" VARCHAR(128) NOT NULL,
  "event_type" VARCHAR(120) NOT NULL,
  "schema_version" VARCHAR(16) NOT NULL,
  "aggregate_id" UUID NOT NULL,
  "entity_version" BIGINT NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "correlation_id" VARCHAR(128),
  "payload" JSONB NOT NULL,
  "status" "FinancialProjectionOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishing_at" TIMESTAMPTZ(3),
  "published_at" TIMESTAMPTZ(3),
  "last_error_code" VARCHAR(80),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "financial_projection_outbox_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "financial_projection_outbox_events_sequence_key" ON "financial_projection_outbox_events"("sequence");
CREATE UNIQUE INDEX "financial_projection_outbox_events_tenant_id_aggregate_id_entity_version_key" ON "financial_projection_outbox_events"("tenant_id", "aggregate_id", "entity_version");
CREATE INDEX "financial_projection_outbox_events_status_next_attempt_at_created_at_idx" ON "financial_projection_outbox_events"("status", "next_attempt_at", "created_at");

CREATE TABLE "financial_projection_snapshots" (
  "id" UUID NOT NULL,
  "tenant_id" VARCHAR(128) NOT NULL,
  "token" UUID NOT NULL,
  "captured_at" TIMESTAMPTZ(3) NOT NULL,
  "watermark" VARCHAR(256) NOT NULL,
  "item_count" INTEGER NOT NULL DEFAULT 0,
  "completed_at" TIMESTAMPTZ(3),
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "financial_projection_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "financial_projection_snapshots_token_key" ON "financial_projection_snapshots"("token");
CREATE INDEX "financial_projection_snapshots_tenant_id_expires_at_idx" ON "financial_projection_snapshots"("tenant_id", "expires_at");

CREATE TABLE "financial_projection_snapshot_items" (
  "snapshot_id" UUID NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "enrollment_id" UUID NOT NULL,
  "entity_version" BIGINT NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "financial_projection_snapshot_items_pkey" PRIMARY KEY ("snapshot_id", "ordinal")
);
CREATE UNIQUE INDEX "financial_projection_snapshot_items_snapshot_id_enrollment_id_key" ON "financial_projection_snapshot_items"("snapshot_id", "enrollment_id");

ALTER TABLE "financial_projection_outbox_events"
  ADD CONSTRAINT "financial_projection_outbox_events_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_projection_snapshots"
  ADD CONSTRAINT "financial_projection_snapshots_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_projection_snapshot_items"
  ADD CONSTRAINT "financial_projection_snapshot_items_snapshot_id_fkey"
  FOREIGN KEY ("snapshot_id") REFERENCES "financial_projection_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
