-- CreateEnum
CREATE TYPE "ContentEntityType" AS ENUM ('LEARNING_UNIT', 'LEARNING_ITEM');

-- CreateEnum
CREATE TYPE "ContentRevisionOperation" AS ENUM ('CREATED', 'UPDATED', 'SENSITIVE_CHANGE_CONFIRMED', 'SCHEDULED', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED', 'REORDERED', 'MOVED', 'DUPLICATED', 'DRAFT_SAVED', 'DRAFT_DISCARDED', 'DRAFT_PUBLISHED', 'RESTORED');

-- AlterTable
ALTER TABLE "learning_items" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "learning_units" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
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

    CONSTRAINT "content_revisions_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
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

    CONSTRAINT "learning_item_drafts_pkey" PRIMARY KEY ("tenant_id","learning_item_id")
);

-- CreateIndex
CREATE INDEX "content_revisions_tenant_id_entity_type_entity_id_revision__idx" ON "content_revisions"("tenant_id", "entity_type", "entity_id", "revision_number");

-- CreateIndex
CREATE UNIQUE INDEX "content_revisions_entity_revision_key" ON "content_revisions"("tenant_id", "entity_type", "entity_id", "revision_number");

-- RenameForeignKey
ALTER TABLE "learning_items" RENAME CONSTRAINT "learning_items_tenant_id_learning_unit_id_course_subject_id_fke" TO "learning_items_tenant_id_learning_unit_id_course_subject_i_fkey";

-- AddForeignKey
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_item_drafts" ADD CONSTRAINT "learning_item_drafts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_item_drafts" ADD CONSTRAINT "learning_item_drafts_tenant_id_learning_item_id_fkey" FOREIGN KEY ("tenant_id", "learning_item_id") REFERENCES "learning_items"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "in_app_notifications_tenant_id_recipient_identity_user_id_creat" RENAME TO "in_app_notifications_tenant_id_recipient_identity_user_id_c_idx";

-- RenameIndex
ALTER INDEX "in_app_notifications_tenant_id_recipient_identity_user_id_read_" RENAME TO "in_app_notifications_tenant_id_recipient_identity_user_id_r_idx";

-- RenameIndex
ALTER INDEX "learning_items_tenant_id_course_subject_id_publication_status_s" RENAME TO "learning_items_tenant_id_course_subject_id_publication_stat_idx";

-- RenameIndex
ALTER INDEX "learning_units_tenant_id_course_subject_id_status_sort_order_id" RENAME TO "learning_units_tenant_id_course_subject_id_status_sort_orde_idx";

-- RenameIndex
ALTER INDEX "notification_deliveries_event_recipient_channel_template_key" RENAME TO "notification_deliveries_tenant_id_event_id_recipient_key_ch_key";

-- RenameIndex
ALTER INDEX "notification_deliveries_tenant_id_recipient_identity_user_id_ch" RENAME TO "notification_deliveries_tenant_id_recipient_identity_user_i_idx";

-- RenameIndex
ALTER INDEX "sync_item_results_tenant_id_entity_external_reference_res_idx" RENAME TO "sync_item_results_tenant_id_entity_external_reference_resol_idx";
