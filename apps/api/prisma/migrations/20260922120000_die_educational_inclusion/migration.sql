ALTER TYPE "StorageCategory" ADD VALUE 'DIE_ATTACHMENT';
ALTER TYPE "FileReferenceType" ADD VALUE 'DIE_JOURNAL_ENTRY';

CREATE TYPE "DieMemberRole" AS ENUM ('MEMBER', 'COORDINATOR');
CREATE TYPE "DieJournalCategory" AS ENUM ('BEHAVIOR_SITUATION', 'OBSERVATION', 'INTERVENTION_OR_ATTENTION', 'INTERVIEW_OR_MEETING', 'AGREEMENT', 'PROGRESS_OR_RECOGNITION', 'OTHER');
CREATE TYPE "DieInformationSource" AS ENUM ('WITNESSED', 'REPORTED_BY_THIRD_PARTY');
CREATE TYPE "DieJournalEntryStatus" AS ENUM ('CURRENT', 'VOIDED');
CREATE TYPE "DieActionStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

CREATE TABLE "die_member_assignments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" VARCHAR(128) NOT NULL,
  "teacher_id" UUID NOT NULL,
  "identity_user_id" VARCHAR(128) NOT NULL,
  "identity_membership_id" VARCHAR(128) NOT NULL,
  "role" "DieMemberRole" NOT NULL DEFAULT 'MEMBER',
  "added_by_identity_user_id" VARCHAR(128) NOT NULL,
  "added_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removed_by_identity_user_id" VARCHAR(128),
  "removed_at" TIMESTAMPTZ(3),
  "removal_reason" VARCHAR(500),
  CONSTRAINT "die_member_assignments_pkey" PRIMARY KEY ("tenant_id", "id"),
  CONSTRAINT "die_member_assignments_removal_check" CHECK (("removed_at" IS NULL AND "removed_by_identity_user_id" IS NULL AND "removal_reason" IS NULL) OR ("removed_at" IS NOT NULL AND "removed_by_identity_user_id" IS NOT NULL AND "removal_reason" IS NOT NULL))
);

CREATE UNIQUE INDEX "die_member_assignments_active_identity_key" ON "die_member_assignments"("tenant_id", "identity_user_id") WHERE "removed_at" IS NULL;
CREATE UNIQUE INDEX "die_member_assignments_active_teacher_key" ON "die_member_assignments"("tenant_id", "teacher_id") WHERE "removed_at" IS NULL;
CREATE INDEX "die_member_assignments_tenant_id_identity_user_id_removed_at_idx" ON "die_member_assignments"("tenant_id", "identity_user_id", "removed_at");
CREATE INDEX "die_member_assignments_tenant_id_teacher_id_removed_at_idx" ON "die_member_assignments"("tenant_id", "teacher_id", "removed_at");

CREATE TABLE "die_support_episodes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" VARCHAR(128) NOT NULL,
  "student_id" UUID NOT NULL,
  "start_date" DATE NOT NULL,
  "reason" TEXT NOT NULL,
  "responsible_member_assignment_id" UUID,
  "academic_year_id" UUID,
  "course_id" UUID,
  "academic_year_label" VARCHAR(160),
  "course_label" VARCHAR(160),
  "ended_at" DATE,
  "end_reason" TEXT,
  "created_by_identity_user_id" VARCHAR(128) NOT NULL,
  "ended_by_identity_user_id" VARCHAR(128),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "die_support_episodes_pkey" PRIMARY KEY ("tenant_id", "id"),
  CONSTRAINT "die_support_episodes_end_check" CHECK (("ended_at" IS NULL AND "end_reason" IS NULL AND "ended_by_identity_user_id" IS NULL) OR ("ended_at" IS NOT NULL AND "end_reason" IS NOT NULL AND "ended_by_identity_user_id" IS NOT NULL AND "ended_at" >= "start_date"))
);

CREATE UNIQUE INDEX "die_support_episodes_active_student_key" ON "die_support_episodes"("tenant_id", "student_id") WHERE "ended_at" IS NULL;
CREATE INDEX "die_support_episodes_tenant_id_student_id_start_date_idx" ON "die_support_episodes"("tenant_id", "student_id", "start_date");
CREATE INDEX "die_support_episodes_tenant_id_responsible_ended_idx" ON "die_support_episodes"("tenant_id", "responsible_member_assignment_id", "ended_at");

CREATE TABLE "die_journal_entries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" VARCHAR(128) NOT NULL,
  "student_id" UUID NOT NULL,
  "support_episode_id" UUID NOT NULL,
  "original_author_identity_user_id" VARCHAR(128) NOT NULL,
  "current_revision_number" INTEGER NOT NULL DEFAULT 1,
  "status" "DieJournalEntryStatus" NOT NULL DEFAULT 'CURRENT',
  "void_reason" VARCHAR(1000),
  "voided_by_identity_user_id" VARCHAR(128),
  "voided_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "die_journal_entries_pkey" PRIMARY KEY ("tenant_id", "id"),
  CONSTRAINT "die_journal_entries_revision_check" CHECK ("current_revision_number" > 0),
  CONSTRAINT "die_journal_entries_void_check" CHECK (("status" = 'CURRENT' AND "void_reason" IS NULL AND "voided_by_identity_user_id" IS NULL AND "voided_at" IS NULL) OR ("status" = 'VOIDED' AND "void_reason" IS NOT NULL AND "voided_by_identity_user_id" IS NOT NULL AND "voided_at" IS NOT NULL))
);
CREATE INDEX "die_journal_entries_tenant_id_student_id_created_at_idx" ON "die_journal_entries"("tenant_id", "student_id", "created_at");
CREATE INDEX "die_journal_entries_tenant_id_author_created_at_idx" ON "die_journal_entries"("tenant_id", "original_author_identity_user_id", "created_at");

CREATE TABLE "die_journal_revisions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" VARCHAR(128) NOT NULL,
  "journal_entry_id" UUID NOT NULL,
  "revision_number" INTEGER NOT NULL,
  "category" "DieJournalCategory" NOT NULL,
  "event_date" DATE NOT NULL,
  "event_time_minutes" SMALLINT,
  "event_time_approximate" BOOLEAN NOT NULL DEFAULT false,
  "event_time_zone" VARCHAR(80),
  "place" VARCHAR(240),
  "title" VARCHAR(240) NOT NULL,
  "description" TEXT NOT NULL,
  "immediate_action" TEXT,
  "information_source" "DieInformationSource" NOT NULL,
  "third_party_source" VARCHAR(240),
  "academic_year_id" UUID,
  "course_id" UUID,
  "academic_year_label" VARCHAR(160),
  "course_label" VARCHAR(160),
  "corrected_by_identity_user_id" VARCHAR(128) NOT NULL,
  "correction_reason" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "die_journal_revisions_pkey" PRIMARY KEY ("tenant_id", "id"),
  CONSTRAINT "die_journal_revisions_entry_revision_key" UNIQUE ("tenant_id", "journal_entry_id", "revision_number"),
  CONSTRAINT "die_journal_revisions_time_check" CHECK (("event_time_minutes" IS NULL AND "event_time_approximate" = false) OR ("event_time_minutes" BETWEEN 0 AND 1439)),
  CONSTRAINT "die_journal_revisions_source_check" CHECK (("information_source" = 'WITNESSED' AND "third_party_source" IS NULL) OR ("information_source" = 'REPORTED_BY_THIRD_PARTY' AND "third_party_source" IS NOT NULL)),
  CONSTRAINT "die_journal_revisions_revision_check" CHECK ("revision_number" > 0)
);
CREATE INDEX "die_journal_revisions_tenant_id_event_date_category_idx" ON "die_journal_revisions"("tenant_id", "event_date", "category");

CREATE TABLE "die_actions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" VARCHAR(128) NOT NULL,
  "student_id" UUID NOT NULL,
  "journal_entry_id" UUID,
  "title" VARCHAR(240) NOT NULL,
  "description" TEXT,
  "assignee_member_assignment_id" UUID NOT NULL,
  "due_date" DATE,
  "status" "DieActionStatus" NOT NULL DEFAULT 'PENDING',
  "result" TEXT,
  "cancellation_reason" TEXT,
  "created_by_identity_user_id" VARCHAR(128) NOT NULL,
  "closed_by_identity_user_id" VARCHAR(128),
  "closed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "die_actions_pkey" PRIMARY KEY ("tenant_id", "id"),
  CONSTRAINT "die_actions_state_check" CHECK (("status" IN ('PENDING', 'IN_PROGRESS') AND "result" IS NULL AND "cancellation_reason" IS NULL AND "closed_at" IS NULL AND "closed_by_identity_user_id" IS NULL) OR ("status" = 'COMPLETED' AND "result" IS NOT NULL AND "cancellation_reason" IS NULL AND "closed_at" IS NOT NULL AND "closed_by_identity_user_id" IS NOT NULL) OR ("status" = 'CANCELLED' AND "result" IS NULL AND "cancellation_reason" IS NOT NULL AND "closed_at" IS NOT NULL AND "closed_by_identity_user_id" IS NOT NULL))
);
CREATE INDEX "die_actions_tenant_id_student_id_status_due_date_idx" ON "die_actions"("tenant_id", "student_id", "status", "due_date");
CREATE INDEX "die_actions_tenant_id_assignee_status_due_date_idx" ON "die_actions"("tenant_id", "assignee_member_assignment_id", "status", "due_date");

CREATE TABLE "die_action_assignments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" VARCHAR(128) NOT NULL,
  "action_id" UUID NOT NULL,
  "member_assignment_id" UUID NOT NULL,
  "assigned_by_identity_user_id" VARCHAR(128) NOT NULL,
  "reason" VARCHAR(1000),
  "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "unassigned_at" TIMESTAMPTZ(3),
  CONSTRAINT "die_action_assignments_pkey" PRIMARY KEY ("tenant_id", "id")
);
CREATE UNIQUE INDEX "die_action_assignments_active_action_key" ON "die_action_assignments"("tenant_id", "action_id") WHERE "unassigned_at" IS NULL;
CREATE INDEX "die_action_assignments_tenant_id_action_id_assigned_at_idx" ON "die_action_assignments"("tenant_id", "action_id", "assigned_at");
CREATE INDEX "die_action_assignments_tenant_id_member_unassigned_idx" ON "die_action_assignments"("tenant_id", "member_assignment_id", "unassigned_at");

CREATE TABLE "die_audit_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" VARCHAR(128) NOT NULL,
  "action" VARCHAR(100) NOT NULL,
  "actor_identity_user_id" VARCHAR(128) NOT NULL,
  "membership_id" VARCHAR(128) NOT NULL,
  "resource_type" VARCHAR(80) NOT NULL,
  "resource_id" VARCHAR(128) NOT NULL,
  "request_id" VARCHAR(128) NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "die_audit_events_pkey" PRIMARY KEY ("tenant_id", "id")
);
CREATE INDEX "die_audit_events_tenant_id_resource_created_at_idx" ON "die_audit_events"("tenant_id", "resource_type", "resource_id", "created_at");
CREATE INDEX "die_audit_events_tenant_id_actor_created_at_idx" ON "die_audit_events"("tenant_id", "actor_identity_user_id", "created_at");

ALTER TABLE "file_references" ADD COLUMN "die_journal_entry_id" UUID;
DROP INDEX IF EXISTS "file_references_tenant_id_die_journal_entry_id_idx";
CREATE INDEX "file_references_tenant_id_die_journal_entry_id_idx" ON "file_references"("tenant_id", "die_journal_entry_id");
ALTER TABLE "file_references" DROP CONSTRAINT "file_references_parent_check";
ALTER TABLE "file_references" ADD CONSTRAINT "file_references_parent_check" CHECK (
  ("reference_type" = 'LEARNING_ITEM' AND "learning_item_id" IS NOT NULL AND "submission_revision_id" IS NULL AND "die_journal_entry_id" IS NULL)
  OR ("reference_type" = 'SUBMISSION_REVISION' AND "learning_item_id" IS NULL AND "submission_revision_id" IS NOT NULL AND "die_journal_entry_id" IS NULL)
  OR ("reference_type" = 'DIE_JOURNAL_ENTRY' AND "learning_item_id" IS NULL AND "submission_revision_id" IS NULL AND "die_journal_entry_id" IS NOT NULL)
);

ALTER TABLE "die_member_assignments" ADD CONSTRAINT "die_member_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "die_member_assignments" ADD CONSTRAINT "die_member_assignments_teacher_fkey" FOREIGN KEY ("tenant_id", "teacher_id") REFERENCES "teachers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "die_support_episodes" ADD CONSTRAINT "die_support_episodes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "die_support_episodes" ADD CONSTRAINT "die_support_episodes_student_fkey" FOREIGN KEY ("tenant_id", "student_id") REFERENCES "students"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "die_support_episodes" ADD CONSTRAINT "die_support_episodes_member_fkey" FOREIGN KEY ("tenant_id", "responsible_member_assignment_id") REFERENCES "die_member_assignments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "die_support_episodes" ADD CONSTRAINT "die_support_episodes_year_fkey" FOREIGN KEY ("tenant_id", "academic_year_id") REFERENCES "academic_years"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "die_support_episodes" ADD CONSTRAINT "die_support_episodes_course_fkey" FOREIGN KEY ("tenant_id", "course_id") REFERENCES "courses"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "die_journal_entries" ADD CONSTRAINT "die_journal_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "die_journal_entries" ADD CONSTRAINT "die_journal_entries_student_fkey" FOREIGN KEY ("tenant_id", "student_id") REFERENCES "students"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "die_journal_entries" ADD CONSTRAINT "die_journal_entries_episode_fkey" FOREIGN KEY ("tenant_id", "support_episode_id") REFERENCES "die_support_episodes"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "die_journal_revisions" ADD CONSTRAINT "die_journal_revisions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "die_journal_revisions" ADD CONSTRAINT "die_journal_revisions_entry_fkey" FOREIGN KEY ("tenant_id", "journal_entry_id") REFERENCES "die_journal_entries"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "die_journal_revisions" ADD CONSTRAINT "die_journal_revisions_year_fkey" FOREIGN KEY ("tenant_id", "academic_year_id") REFERENCES "academic_years"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "die_journal_revisions" ADD CONSTRAINT "die_journal_revisions_course_fkey" FOREIGN KEY ("tenant_id", "course_id") REFERENCES "courses"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "die_actions" ADD CONSTRAINT "die_actions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "die_actions" ADD CONSTRAINT "die_actions_student_fkey" FOREIGN KEY ("tenant_id", "student_id") REFERENCES "students"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "die_actions" ADD CONSTRAINT "die_actions_entry_fkey" FOREIGN KEY ("tenant_id", "journal_entry_id") REFERENCES "die_journal_entries"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "die_actions" ADD CONSTRAINT "die_actions_assignee_fkey" FOREIGN KEY ("tenant_id", "assignee_member_assignment_id") REFERENCES "die_member_assignments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "die_action_assignments" ADD CONSTRAINT "die_action_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "die_action_assignments" ADD CONSTRAINT "die_action_assignments_action_fkey" FOREIGN KEY ("tenant_id", "action_id") REFERENCES "die_actions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "die_action_assignments" ADD CONSTRAINT "die_action_assignments_member_fkey" FOREIGN KEY ("tenant_id", "member_assignment_id") REFERENCES "die_member_assignments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "die_audit_events" ADD CONSTRAINT "die_audit_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "file_references" ADD CONSTRAINT "file_references_die_journal_entry_fkey" FOREIGN KEY ("tenant_id", "die_journal_entry_id") REFERENCES "die_journal_entries"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
