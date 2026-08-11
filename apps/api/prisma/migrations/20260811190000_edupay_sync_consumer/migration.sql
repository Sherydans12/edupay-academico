-- EduPay roster provenance and synchronization state. Existing academic rows
-- remain MANUAL; no source identity is inferred from mutable names or labels.

CREATE TYPE "SyncEntity" AS ENUM ('COURSE', 'STUDENT');
CREATE TYPE "SyncMode" AS ENUM ('INCREMENTAL', 'FULL');
CREATE TYPE "SyncTrigger" AS ENUM ('SCHEDULED', 'MANUAL');
CREATE TYPE "SyncRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'SOURCE_UNAVAILABLE');
CREATE TYPE "SyncItemOutcome" AS ENUM ('CONFLICT', 'FAILED');

ALTER TABLE "courses"
  ADD COLUMN "source" VARCHAR(80) NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "external_reference" VARCHAR(200),
  ADD COLUMN "source_updated_at" TIMESTAMPTZ(3),
  ADD COLUMN "last_synced_at" TIMESTAMPTZ(3),
  ADD COLUMN "source_status" VARCHAR(32),
  ADD COLUMN "last_seen_full_generation" INTEGER,
  ADD COLUMN "consecutive_absences" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "students"
  ADD COLUMN "source_updated_at" TIMESTAMPTZ(3),
  ADD COLUMN "last_synced_at" TIMESTAMPTZ(3),
  ADD COLUMN "source_status" VARCHAR(32),
  ADD COLUMN "last_seen_full_generation" INTEGER,
  ADD COLUMN "consecutive_absences" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "course_enrollments"
  ADD COLUMN "source" VARCHAR(80) NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "external_reference" VARCHAR(420),
  ADD COLUMN "last_synced_at" TIMESTAMPTZ(3);

DROP INDEX "courses_tenant_id_academic_year_id_label_key";

CREATE UNIQUE INDEX "courses_manual_label_key"
ON "courses"("tenant_id", "academic_year_id", "label")
WHERE "source" = 'MANUAL';

CREATE UNIQUE INDEX "courses_tenant_id_source_external_reference_key"
ON "courses"("tenant_id", "source", "external_reference");

CREATE UNIQUE INDEX "course_enrollments_tenant_id_source_external_reference_key"
ON "course_enrollments"("tenant_id", "source", "external_reference");

ALTER TABLE "courses"
  ADD CONSTRAINT "courses_edupay_external_reference_check"
  CHECK ("source" <> 'EDUPAY' OR "external_reference" IS NOT NULL),
  ADD CONSTRAINT "courses_consecutive_absences_check"
  CHECK ("consecutive_absences" >= 0);

ALTER TABLE "students"
  ADD CONSTRAINT "students_edupay_external_reference_check"
  CHECK ("source" <> 'EDUPAY' OR "external_reference" IS NOT NULL),
  ADD CONSTRAINT "students_consecutive_absences_check"
  CHECK ("consecutive_absences" >= 0);

ALTER TABLE "course_enrollments"
  ADD CONSTRAINT "course_enrollments_edupay_external_reference_check"
  CHECK ("source" <> 'EDUPAY' OR "external_reference" IS NOT NULL);

CREATE FUNCTION prevent_edupay_external_identity_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."source" = 'EDUPAY'
     AND (NEW."source" IS DISTINCT FROM OLD."source"
       OR NEW."external_reference" IS DISTINCT FROM OLD."external_reference") THEN
    RAISE EXCEPTION 'EDUPAY external identity is immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "courses_edupay_identity_immutable"
BEFORE UPDATE OF "source", "external_reference" ON "courses"
FOR EACH ROW EXECUTE FUNCTION prevent_edupay_external_identity_mutation();

CREATE TRIGGER "students_edupay_identity_immutable"
BEFORE UPDATE OF "source", "external_reference" ON "students"
FOR EACH ROW EXECUTE FUNCTION prevent_edupay_external_identity_mutation();

CREATE TRIGGER "course_enrollments_edupay_identity_immutable"
BEFORE UPDATE OF "source", "external_reference" ON "course_enrollments"
FOR EACH ROW EXECUTE FUNCTION prevent_edupay_external_identity_mutation();

CREATE TABLE "sync_configurations" (
  "id" UUID NOT NULL,
  "tenant_id" VARCHAR(128) NOT NULL,
  "source" VARCHAR(80) NOT NULL,
  "source_tenant_id" VARCHAR(200) NOT NULL,
  "academic_year_id" UUID NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "full_generation" INTEGER NOT NULL DEFAULT 0,
  "next_incremental_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "next_full_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "sync_configurations_pkey" PRIMARY KEY ("tenant_id", "id"),
  CONSTRAINT "sync_configurations_full_generation_check" CHECK ("full_generation" >= 0)
);

CREATE UNIQUE INDEX "sync_configurations_tenant_id_source_key"
ON "sync_configurations"("tenant_id", "source");
CREATE UNIQUE INDEX "sync_configurations_source_source_tenant_id_key"
ON "sync_configurations"("source", "source_tenant_id");
CREATE INDEX "sync_configurations_enabled_next_incremental_at_idx"
ON "sync_configurations"("enabled", "next_incremental_at");
CREATE INDEX "sync_configurations_enabled_next_full_at_idx"
ON "sync_configurations"("enabled", "next_full_at");

CREATE TABLE "sync_states" (
  "tenant_id" VARCHAR(128) NOT NULL,
  "source" VARCHAR(80) NOT NULL,
  "entity" "SyncEntity" NOT NULL,
  "watermark" TEXT,
  "last_success_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "sync_states_pkey" PRIMARY KEY ("tenant_id", "source", "entity")
);

CREATE TABLE "sync_runs" (
  "id" UUID NOT NULL,
  "tenant_id" VARCHAR(128) NOT NULL,
  "source" VARCHAR(80) NOT NULL,
  "mode" "SyncMode" NOT NULL,
  "trigger" "SyncTrigger" NOT NULL,
  "status" "SyncRunStatus" NOT NULL DEFAULT 'RUNNING',
  "correlation_id" VARCHAR(128) NOT NULL,
  "source_schema_version" VARCHAR(16) NOT NULL,
  "source_tenant_id" VARCHAR(200) NOT NULL,
  "seen_count" INTEGER NOT NULL DEFAULT 0,
  "created_count" INTEGER NOT NULL DEFAULT 0,
  "updated_count" INTEGER NOT NULL DEFAULT 0,
  "unchanged_count" INTEGER NOT NULL DEFAULT 0,
  "deactivated_count" INTEGER NOT NULL DEFAULT 0,
  "conflicted_count" INTEGER NOT NULL DEFAULT 0,
  "failed_count" INTEGER NOT NULL DEFAULT 0,
  "page_count" INTEGER NOT NULL DEFAULT 0,
  "watermark_advanced" BOOLEAN NOT NULL DEFAULT false,
  "snapshot_complete" BOOLEAN NOT NULL DEFAULT false,
  "evidence_truncated" BOOLEAN NOT NULL DEFAULT false,
  "error_code" VARCHAR(80),
  "retryable" BOOLEAN NOT NULL DEFAULT false,
  "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMPTZ(3),
  CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("tenant_id", "id")
);

CREATE UNIQUE INDEX "sync_runs_correlation_id_key" ON "sync_runs"("correlation_id");
CREATE INDEX "sync_runs_tenant_id_source_mode_status_started_at_idx"
ON "sync_runs"("tenant_id", "source", "mode", "status", "started_at");

CREATE TABLE "sync_item_results" (
  "id" UUID NOT NULL,
  "tenant_id" VARCHAR(128) NOT NULL,
  "run_id" UUID NOT NULL,
  "entity" "SyncEntity" NOT NULL,
  "external_reference" VARCHAR(200),
  "target_id" UUID,
  "outcome" "SyncItemOutcome" NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "retryable" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMPTZ(3),
  CONSTRAINT "sync_item_results_pkey" PRIMARY KEY ("tenant_id", "id")
);

CREATE INDEX "sync_item_results_tenant_id_resolved_at_entity_code_idx"
ON "sync_item_results"("tenant_id", "resolved_at", "entity", "code");
CREATE INDEX "sync_item_results_tenant_id_entity_external_reference_res_idx"
ON "sync_item_results"("tenant_id", "entity", "external_reference", "resolved_at");

CREATE TABLE "sync_full_presences" (
  "tenant_id" VARCHAR(128) NOT NULL,
  "run_id" UUID NOT NULL,
  "entity" "SyncEntity" NOT NULL,
  "external_reference" VARCHAR(200) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sync_full_presences_pkey" PRIMARY KEY ("tenant_id", "run_id", "entity", "external_reference")
);

CREATE INDEX "sync_full_presences_tenant_id_entity_external_reference_idx"
ON "sync_full_presences"("tenant_id", "entity", "external_reference");

CREATE TABLE "sync_leases" (
  "tenant_id" VARCHAR(128) NOT NULL,
  "source" VARCHAR(80) NOT NULL,
  "owner_run_id" UUID NOT NULL,
  "locked_until" TIMESTAMPTZ(3) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "sync_leases_pkey" PRIMARY KEY ("tenant_id", "source")
);

CREATE INDEX "sync_leases_locked_until_idx" ON "sync_leases"("locked_until");

ALTER TABLE "sync_configurations"
  ADD CONSTRAINT "sync_configurations_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "sync_configurations_tenant_id_academic_year_id_fkey"
  FOREIGN KEY ("tenant_id", "academic_year_id") REFERENCES "academic_years"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sync_states"
  ADD CONSTRAINT "sync_states_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sync_runs"
  ADD CONSTRAINT "sync_runs_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sync_item_results"
  ADD CONSTRAINT "sync_item_results_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "sync_item_results_tenant_id_run_id_fkey"
  FOREIGN KEY ("tenant_id", "run_id") REFERENCES "sync_runs"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sync_full_presences"
  ADD CONSTRAINT "sync_full_presences_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "sync_full_presences_tenant_id_run_id_fkey"
  FOREIGN KEY ("tenant_id", "run_id") REFERENCES "sync_runs"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sync_leases"
  ADD CONSTRAINT "sync_leases_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
