CREATE TABLE "course_rollover_drafts" (
    "tenant_id" VARCHAR(128) NOT NULL,
    "source_course_id" UUID NOT NULL,
    "target_academic_year_id" UUID NOT NULL,
    "plan" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "prepared_revision" INTEGER,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "course_rollover_drafts_pkey" PRIMARY KEY ("tenant_id", "source_course_id", "target_academic_year_id"),
    CONSTRAINT "course_rollover_drafts_source_course_fkey" FOREIGN KEY ("tenant_id", "source_course_id")
        REFERENCES "courses"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "course_rollover_drafts_target_year_fkey" FOREIGN KEY ("tenant_id", "target_academic_year_id")
        REFERENCES "academic_years"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "course_rollover_drafts_tenant_id_target_academic_year_id_idx"
    ON "course_rollover_drafts"("tenant_id", "target_academic_year_id");
