-- CreateEnum
CREATE TYPE "LearningUnitStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LearningItemType" AS ENUM ('MATERIAL', 'ASSIGNMENT', 'ASSESSMENT', 'ANNOUNCEMENT');

-- CreateEnum
CREATE TYPE "LearningItemPublicationStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "learning_units" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(128) NOT NULL,
    "course_subject_id" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "start_at" TIMESTAMPTZ(3),
    "end_at" TIMESTAMPTZ(3),
    "status" "LearningUnitStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "learning_units_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "learning_items" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(128) NOT NULL,
    "course_subject_id" UUID NOT NULL,
    "learning_unit_id" UUID NOT NULL,
    "type" "LearningItemType" NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "content" TEXT,
    "instructions" TEXT,
    "body" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "publication_status" "LearningItemPublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "publish_at" TIMESTAMPTZ(3),
    "published_at" TIMESTAMPTZ(3),
    "published_by_identity_user_id" VARCHAR(128),
    "due_at" TIMESTAMPTZ(3),
    "created_by_identity_user_id" VARCHAR(128) NOT NULL,
    "updated_by_identity_user_id" VARCHAR(128),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "learning_items_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateIndex
CREATE UNIQUE INDEX "learning_units_tenant_id_id_course_subject_id_key"
ON "learning_units"("tenant_id", "id", "course_subject_id");

CREATE INDEX "learning_units_tenant_id_course_subject_id_status_sort_order_id_idx"
ON "learning_units"("tenant_id", "course_subject_id", "status", "sort_order", "id");

CREATE INDEX "learning_items_tenant_id_course_subject_id_publication_status_sort_order_id_idx"
ON "learning_items"("tenant_id", "course_subject_id", "publication_status", "sort_order", "id");

CREATE INDEX "learning_items_tenant_id_learning_unit_id_sort_order_id_idx"
ON "learning_items"("tenant_id", "learning_unit_id", "sort_order", "id");

-- Domain checks that Prisma cannot currently express in the schema.
ALTER TABLE "learning_units"
ADD CONSTRAINT "learning_units_sort_order_check"
CHECK ("sort_order" >= 0);

ALTER TABLE "learning_units"
ADD CONSTRAINT "learning_units_date_range_check"
CHECK ("start_at" IS NULL OR "end_at" IS NULL OR "start_at" <= "end_at");

ALTER TABLE "learning_items"
ADD CONSTRAINT "learning_items_sort_order_check"
CHECK ("sort_order" >= 0);

ALTER TABLE "learning_items"
ADD CONSTRAINT "learning_items_scheduled_publish_at_check"
CHECK ("publication_status" <> 'SCHEDULED' OR "publish_at" IS NOT NULL);

ALTER TABLE "learning_items"
ADD CONSTRAINT "learning_items_due_at_type_check"
CHECK (("type" IN ('ASSIGNMENT', 'ASSESSMENT') AND "due_at" IS NOT NULL)
    OR ("type" IN ('MATERIAL', 'ANNOUNCEMENT') AND "due_at" IS NULL));

ALTER TABLE "learning_items"
ADD CONSTRAINT "learning_items_instructions_type_check"
CHECK ("type" IN ('MATERIAL', 'ANNOUNCEMENT')
    OR NULLIF(BTRIM("instructions"), '') IS NOT NULL);

ALTER TABLE "learning_items"
ADD CONSTRAINT "learning_items_announcement_body_check"
CHECK ("type" <> 'ANNOUNCEMENT'
    OR NULLIF(BTRIM("body"), '') IS NOT NULL);

-- AddForeignKey
ALTER TABLE "learning_units"
ADD CONSTRAINT "learning_units_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "learning_units"
ADD CONSTRAINT "learning_units_tenant_id_course_subject_id_fkey"
FOREIGN KEY ("tenant_id", "course_subject_id") REFERENCES "course_subjects"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "learning_items"
ADD CONSTRAINT "learning_items_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "learning_items"
ADD CONSTRAINT "learning_items_tenant_id_course_subject_id_fkey"
FOREIGN KEY ("tenant_id", "course_subject_id") REFERENCES "course_subjects"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "learning_items"
ADD CONSTRAINT "learning_items_tenant_id_learning_unit_id_course_subject_id_fkey"
FOREIGN KEY ("tenant_id", "learning_unit_id", "course_subject_id")
REFERENCES "learning_units"("tenant_id", "id", "course_subject_id") ON DELETE RESTRICT ON UPDATE CASCADE;
