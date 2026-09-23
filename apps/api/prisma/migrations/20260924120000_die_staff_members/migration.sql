ALTER TABLE "die_member_assignments"
  ADD COLUMN "display_label_snapshot" VARCHAR(241);

UPDATE "die_member_assignments" AS member
SET "display_label_snapshot" = CONCAT(teacher."first_name", ' ', teacher."last_name")
FROM "teachers" AS teacher
WHERE teacher."tenant_id" = member."tenant_id"
  AND teacher."id" = member."teacher_id";

UPDATE "die_member_assignments"
SET "display_label_snapshot" = "identity_user_id"
WHERE "display_label_snapshot" IS NULL;

ALTER TABLE "die_member_assignments"
  ALTER COLUMN "display_label_snapshot" SET NOT NULL,
  ALTER COLUMN "teacher_id" DROP NOT NULL;

ALTER TABLE "die_journal_entries"
  ADD COLUMN "original_author_display_label" VARCHAR(241);

UPDATE "die_journal_entries"
SET "original_author_display_label" = "original_author_identity_user_id";

ALTER TABLE "die_journal_entries"
  ALTER COLUMN "original_author_display_label" SET NOT NULL;

ALTER TABLE "die_journal_revisions"
  ADD COLUMN "corrected_by_display_label" VARCHAR(241);

UPDATE "die_journal_revisions"
SET "corrected_by_display_label" = "corrected_by_identity_user_id";

ALTER TABLE "die_journal_revisions"
  ALTER COLUMN "corrected_by_display_label" SET NOT NULL;
