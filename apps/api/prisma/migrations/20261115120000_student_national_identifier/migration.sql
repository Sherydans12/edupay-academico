-- ADR-0024: stable student identifier (RUN, or IPE for students without RUN).
-- Additive only: existing rows keep NULL until a separately approved
-- reconciliation. No data is read, copied or backfilled here.
ALTER TABLE "students"
  ADD COLUMN "national_id_type" VARCHAR(16),
  ADD COLUMN "national_id" VARCHAR(20);

ALTER TABLE "students"
  ADD CONSTRAINT "students_national_id_pair_check"
    CHECK (("national_id_type" IS NULL) = ("national_id" IS NULL)),
  ADD CONSTRAINT "students_national_id_type_check"
    CHECK ("national_id_type" IS NULL OR "national_id_type" IN ('RUN', 'IPE'));

-- NULL identifiers stay distinct in PostgreSQL, so legacy rows do not collide.
CREATE UNIQUE INDEX "students_tenant_id_national_id_type_national_id_key"
  ON "students" ("tenant_id", "national_id_type", "national_id");
