-- Storage and student-submission bounded context.
CREATE TYPE "StorageScopeType" AS ENUM ('GLOBAL', 'TENANT');
CREATE TYPE "StorageQuotaState" AS ENUM ('NORMAL', 'INFO', 'WARNING', 'CRITICAL', 'FULL');
CREATE TYPE "StorageCategory" AS ENUM ('LEARNING_MATERIAL', 'ASSIGNMENT_SOURCE', 'ASSESSMENT_SOURCE', 'STUDENT_SUBMISSION', 'GENERATED_DERIVATIVE', 'OTHER_SYSTEM');
CREATE TYPE "StoredBlobLifecycle" AS ENUM ('PENDING', 'VALIDATING', 'AVAILABLE', 'REJECTED', 'DELETION_PENDING');
CREATE TYPE "StorageValidationStatus" AS ENUM ('NOT_VALIDATED', 'VALID', 'INVALID');
CREATE TYPE "StorageScanStatus" AS ENUM ('NOT_SCANNED', 'PENDING', 'CLEAR', 'INFECTED', 'FAILED');
CREATE TYPE "FileObjectLifecycle" AS ENUM ('PENDING', 'AVAILABLE', 'REJECTED', 'DELETION_PENDING');
CREATE TYPE "FileReferenceType" AS ENUM ('LEARNING_ITEM', 'SUBMISSION_REVISION');
CREATE TYPE "UploadIntentStatus" AS ENUM ('RESERVED', 'STAGED', 'FINALIZED', 'FAILED', 'EXPIRED');
CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING', 'SUBMITTED', 'REVIEWED', 'CHANGES_REQUESTED');
CREATE TYPE "ReviewAction" AS ENUM ('COMMENTED', 'REVIEWED', 'CHANGES_REQUESTED');

CREATE TABLE "storage_quota_policies" (
    "id" UUID NOT NULL,
    "scope_key" VARCHAR(160) NOT NULL,
    "scope_type" "StorageScopeType" NOT NULL,
    "tenant_id" VARCHAR(128),
    "quota_bytes" BIGINT NOT NULL,
    "info_threshold_percent" DOUBLE PRECISION NOT NULL DEFAULT 75,
    "warning_threshold_percent" DOUBLE PRECISION NOT NULL DEFAULT 90,
    "critical_threshold_percent" DOUBLE PRECISION NOT NULL DEFAULT 95,
    "version" INTEGER NOT NULL DEFAULT 1,
    "effective_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by_identity_user_id" VARCHAR(128),
    "audit_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "storage_quota_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "storage_usage_accounts" (
    "id" UUID NOT NULL,
    "scope_key" VARCHAR(160) NOT NULL,
    "scope_type" "StorageScopeType" NOT NULL,
    "tenant_id" VARCHAR(128),
    "used_bytes" BIGINT NOT NULL DEFAULT 0,
    "reserved_bytes" BIGINT NOT NULL DEFAULT 0,
    "file_count" INTEGER NOT NULL DEFAULT 0,
    "blob_count" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "last_reconciled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "storage_usage_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stored_blobs" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(128) NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "stored_size_bytes" BIGINT NOT NULL,
    "detected_mime" VARCHAR(160) NOT NULL,
    "detected_extension" VARCHAR(16) NOT NULL,
    "lifecycle" "StoredBlobLifecycle" NOT NULL DEFAULT 'PENDING',
    "validation_status" "StorageValidationStatus" NOT NULL DEFAULT 'NOT_VALIDATED',
    "scan_status" "StorageScanStatus" NOT NULL DEFAULT 'NOT_SCANNED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validated_at" TIMESTAMPTZ(3),
    "available_at" TIMESTAMPTZ(3),
    CONSTRAINT "stored_blobs_pkey" PRIMARY KEY ("tenant_id", "id")
);

CREATE TABLE "file_objects" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(128) NOT NULL,
    "stored_blob_id" UUID NOT NULL,
    "original_filename" VARCHAR(255) NOT NULL,
    "normalized_filename" VARCHAR(255) NOT NULL,
    "declared_size_bytes" BIGINT NOT NULL,
    "authoritative_size_bytes" BIGINT NOT NULL,
    "declared_mime" VARCHAR(160) NOT NULL,
    "detected_mime" VARCHAR(160) NOT NULL,
    "extension" VARCHAR(16) NOT NULL,
    "category" "StorageCategory" NOT NULL,
    "uploaded_by_identity_user_id" VARCHAR(128) NOT NULL,
    "is_immutable_evidence" BOOLEAN NOT NULL DEFAULT true,
    "lifecycle" "FileObjectLifecycle" NOT NULL DEFAULT 'AVAILABLE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validated_at" TIMESTAMPTZ(3),
    CONSTRAINT "file_objects_pkey" PRIMARY KEY ("tenant_id", "id")
);

CREATE TABLE "submissions" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(128) NOT NULL,
    "student_id" UUID NOT NULL,
    "learning_item_id" UUID NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "submissions_pkey" PRIMARY KEY ("tenant_id", "id")
);

CREATE TABLE "submission_revisions" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(128) NOT NULL,
    "submission_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "student_comment" TEXT,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL,
    "effective_due_at" TIMESTAMPTZ(3) NOT NULL,
    "is_late" BOOLEAN NOT NULL,
    "created_by_identity_user_id" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "submission_revisions_pkey" PRIMARY KEY ("tenant_id", "id")
);

CREATE TABLE "file_references" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(128) NOT NULL,
    "file_object_id" UUID NOT NULL,
    "reference_type" "FileReferenceType" NOT NULL,
    "category" "StorageCategory" NOT NULL,
    "learning_item_id" UUID,
    "submission_revision_id" UUID,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_identity_user_id" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "file_references_pkey" PRIMARY KEY ("tenant_id", "id")
);

CREATE TABLE "upload_intents" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(128) NOT NULL,
    "created_by_identity_user_id" VARCHAR(128) NOT NULL,
    "parent_type" "FileReferenceType" NOT NULL,
    "parent_id" UUID NOT NULL,
    "category" "StorageCategory" NOT NULL,
    "expected_filename" VARCHAR(255) NOT NULL,
    "expected_size_bytes" BIGINT NOT NULL,
    "expected_mime" VARCHAR(160) NOT NULL,
    "reserved_bytes" BIGINT NOT NULL,
    "staging_key" VARCHAR(500) NOT NULL,
    "status" "UploadIntentStatus" NOT NULL DEFAULT 'RESERVED',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalized_at" TIMESTAMPTZ(3),
    CONSTRAINT "upload_intents_pkey" PRIMARY KEY ("tenant_id", "id")
);

CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(128) NOT NULL,
    "submission_revision_id" UUID NOT NULL,
    "reviewer_teacher_id" UUID,
    "reviewer_identity_user_id" VARCHAR(128) NOT NULL,
    "action" "ReviewAction" NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reviews_pkey" PRIMARY KEY ("tenant_id", "id")
);

CREATE TABLE "blob_derivatives" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(128) NOT NULL,
    "source_blob_id" UUID NOT NULL,
    "derivative_blob_id" UUID NOT NULL,
    "profile" VARCHAR(120) NOT NULL,
    "profile_version" VARCHAR(40) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "blob_derivatives_pkey" PRIMARY KEY ("tenant_id", "id")
);

CREATE UNIQUE INDEX "storage_quota_policies_scope_key_key" ON "storage_quota_policies"("scope_key");
CREATE UNIQUE INDEX "storage_quota_policies_scope_type_tenant_id_key" ON "storage_quota_policies"("scope_type", "tenant_id");
CREATE INDEX "storage_quota_policies_tenant_id_scope_type_idx" ON "storage_quota_policies"("tenant_id", "scope_type");
CREATE UNIQUE INDEX "storage_usage_accounts_scope_key_key" ON "storage_usage_accounts"("scope_key");
CREATE UNIQUE INDEX "storage_usage_accounts_scope_type_tenant_id_key" ON "storage_usage_accounts"("scope_type", "tenant_id");
CREATE INDEX "storage_usage_accounts_tenant_id_scope_type_idx" ON "storage_usage_accounts"("tenant_id", "scope_type");
CREATE UNIQUE INDEX "stored_blobs_storage_key_key" ON "stored_blobs"("storage_key");
CREATE UNIQUE INDEX "stored_blobs_tenant_id_sha256_stored_size_bytes_key" ON "stored_blobs"("tenant_id", "sha256", "stored_size_bytes");
CREATE INDEX "stored_blobs_tenant_id_lifecycle_idx" ON "stored_blobs"("tenant_id", "lifecycle");
CREATE INDEX "file_objects_tenant_id_category_lifecycle_idx" ON "file_objects"("tenant_id", "category", "lifecycle");
CREATE INDEX "file_objects_tenant_id_stored_blob_id_idx" ON "file_objects"("tenant_id", "stored_blob_id");
CREATE UNIQUE INDEX "submissions_tenant_id_student_id_learning_item_id_key" ON "submissions"("tenant_id", "student_id", "learning_item_id");
CREATE INDEX "submissions_tenant_id_learning_item_id_status_updated_at_idx" ON "submissions"("tenant_id", "learning_item_id", "status", "updated_at");
CREATE INDEX "submissions_tenant_id_student_id_updated_at_idx" ON "submissions"("tenant_id", "student_id", "updated_at");
CREATE UNIQUE INDEX "submission_revisions_tenant_id_submission_id_revision_numbe_key" ON "submission_revisions"("tenant_id", "submission_id", "revision_number");
CREATE INDEX "submission_revisions_tenant_id_submission_id_revision_numbe_idx" ON "submission_revisions"("tenant_id", "submission_id", "revision_number");
CREATE INDEX "file_references_tenant_id_file_object_id_idx" ON "file_references"("tenant_id", "file_object_id");
CREATE INDEX "file_references_tenant_id_learning_item_id_idx" ON "file_references"("tenant_id", "learning_item_id");
CREATE INDEX "file_references_tenant_id_submission_revision_id_idx" ON "file_references"("tenant_id", "submission_revision_id");
CREATE UNIQUE INDEX "upload_intents_staging_key_key" ON "upload_intents"("staging_key");
CREATE INDEX "upload_intents_tenant_id_status_expires_at_idx" ON "upload_intents"("tenant_id", "status", "expires_at");
CREATE INDEX "reviews_tenant_id_submission_revision_id_created_at_idx" ON "reviews"("tenant_id", "submission_revision_id", "created_at");
CREATE UNIQUE INDEX "blob_derivatives_tenant_id_source_blob_id_profile_profile_v_key" ON "blob_derivatives"("tenant_id", "source_blob_id", "profile", "profile_version");
CREATE INDEX "blob_derivatives_tenant_id_derivative_blob_id_idx" ON "blob_derivatives"("tenant_id", "derivative_blob_id");

ALTER TABLE "storage_quota_policies" ADD CONSTRAINT "storage_quota_policies_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "storage_usage_accounts" ADD CONSTRAINT "storage_usage_accounts_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stored_blobs" ADD CONSTRAINT "stored_blobs_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "file_objects" ADD CONSTRAINT "file_objects_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "file_objects" ADD CONSTRAINT "file_objects_tenant_id_stored_blob_id_fkey"
  FOREIGN KEY ("tenant_id", "stored_blob_id") REFERENCES "stored_blobs"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_tenant_id_student_id_fkey"
  FOREIGN KEY ("tenant_id", "student_id") REFERENCES "students"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_tenant_id_learning_item_id_fkey"
  FOREIGN KEY ("tenant_id", "learning_item_id") REFERENCES "learning_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "submission_revisions" ADD CONSTRAINT "submission_revisions_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "submission_revisions" ADD CONSTRAINT "submission_revisions_tenant_id_submission_id_fkey"
  FOREIGN KEY ("tenant_id", "submission_id") REFERENCES "submissions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "file_references" ADD CONSTRAINT "file_references_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "file_references" ADD CONSTRAINT "file_references_tenant_id_file_object_id_fkey"
  FOREIGN KEY ("tenant_id", "file_object_id") REFERENCES "file_objects"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "file_references" ADD CONSTRAINT "file_references_tenant_id_learning_item_id_fkey"
  FOREIGN KEY ("tenant_id", "learning_item_id") REFERENCES "learning_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "file_references" ADD CONSTRAINT "file_references_tenant_id_submission_revision_id_fkey"
  FOREIGN KEY ("tenant_id", "submission_revision_id") REFERENCES "submission_revisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "upload_intents" ADD CONSTRAINT "upload_intents_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_tenant_id_submission_revision_id_fkey"
  FOREIGN KEY ("tenant_id", "submission_revision_id") REFERENCES "submission_revisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_tenant_id_reviewer_teacher_id_fkey"
  FOREIGN KEY ("tenant_id", "reviewer_teacher_id") REFERENCES "teachers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "blob_derivatives" ADD CONSTRAINT "blob_derivatives_tenant_id_source_blob_id_fkey"
  FOREIGN KEY ("tenant_id", "source_blob_id") REFERENCES "stored_blobs"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "blob_derivatives" ADD CONSTRAINT "blob_derivatives_tenant_id_derivative_blob_id_fkey"
  FOREIGN KEY ("tenant_id", "derivative_blob_id") REFERENCES "stored_blobs"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "storage_quota_policies" ADD CONSTRAINT "storage_quota_policies_values_check"
  CHECK ("quota_bytes" >= 0 AND "info_threshold_percent" >= 0 AND "info_threshold_percent" < "warning_threshold_percent"
    AND "warning_threshold_percent" < "critical_threshold_percent" AND "critical_threshold_percent" < 100);
ALTER TABLE "storage_usage_accounts" ADD CONSTRAINT "storage_usage_accounts_non_negative_check"
  CHECK ("used_bytes" >= 0 AND "reserved_bytes" >= 0 AND "file_count" >= 0 AND "blob_count" >= 0);
ALTER TABLE "file_references" ADD CONSTRAINT "file_references_parent_check"
  CHECK (("reference_type" = 'LEARNING_ITEM' AND "learning_item_id" IS NOT NULL AND "submission_revision_id" IS NULL)
    OR ("reference_type" = 'SUBMISSION_REVISION' AND "learning_item_id" IS NULL AND "submission_revision_id" IS NOT NULL));
ALTER TABLE "submission_revisions" ADD CONSTRAINT "submission_revisions_revision_number_check"
  CHECK ("revision_number" > 0);
ALTER TABLE "file_objects" ADD CONSTRAINT "file_objects_size_check"
  CHECK ("declared_size_bytes" >= 0 AND "authoritative_size_bytes" >= 0 AND "authoritative_size_bytes" <= 25000000);
