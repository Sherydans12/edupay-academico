-- CreateEnum
CREATE TYPE "AcademicYearStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PersonStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "SubjectStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CourseSubjectStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RelationshipStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "tenants" (
    "id" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_years" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(128) NOT NULL,
    "pagination_token" UUID NOT NULL,
    "label" VARCHAR(160) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "AcademicYearStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(128) NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "pagination_token" UUID NOT NULL,
    "label" VARCHAR(160) NOT NULL,
    "status" "CourseStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(128) NOT NULL,
    "pagination_token" UUID NOT NULL,
    "identity_user_id" VARCHAR(128),
    "source" VARCHAR(80) NOT NULL DEFAULT 'MANUAL',
    "external_reference" VARCHAR(200),
    "first_name" VARCHAR(120) NOT NULL,
    "last_name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(320),
    "status" "PersonStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "teachers" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(128) NOT NULL,
    "pagination_token" UUID NOT NULL,
    "identity_user_id" VARCHAR(128),
    "source" VARCHAR(80) NOT NULL DEFAULT 'MANUAL',
    "external_reference" VARCHAR(200),
    "first_name" VARCHAR(120) NOT NULL,
    "last_name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(320),
    "status" "PersonStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(128) NOT NULL,
    "pagination_token" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "status" "SubjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "course_subjects" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(128) NOT NULL,
    "course_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "pagination_token" UUID NOT NULL,
    "default_for_course" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "CourseSubjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "course_subjects_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "course_enrollments" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(128) NOT NULL,
    "student_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "status" "RelationshipStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "course_enrollments_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "student_subject_enrollments" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(128) NOT NULL,
    "student_id" UUID NOT NULL,
    "course_subject_id" UUID NOT NULL,
    "status" "RelationshipStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "student_subject_enrollments_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "course_subject_teachers" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(128) NOT NULL,
    "teacher_id" UUID NOT NULL,
    "course_subject_id" UUID NOT NULL,
    "status" "RelationshipStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "course_subject_teachers_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_pagination_token_key" ON "academic_years"("pagination_token");

-- CreateIndex
CREATE INDEX "academic_years_tenant_id_status_start_date_idx" ON "academic_years"("tenant_id", "status", "start_date");

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_tenant_id_label_key" ON "academic_years"("tenant_id", "label");

-- CreateIndex
CREATE UNIQUE INDEX "courses_pagination_token_key" ON "courses"("pagination_token");

-- CreateIndex
CREATE INDEX "courses_tenant_id_academic_year_id_status_label_idx" ON "courses"("tenant_id", "academic_year_id", "status", "label");

-- CreateIndex
CREATE UNIQUE INDEX "courses_tenant_id_academic_year_id_label_key" ON "courses"("tenant_id", "academic_year_id", "label");

-- CreateIndex
CREATE UNIQUE INDEX "students_pagination_token_key" ON "students"("pagination_token");

-- CreateIndex
CREATE INDEX "students_tenant_id_status_last_name_first_name_idx" ON "students"("tenant_id", "status", "last_name", "first_name");

-- CreateIndex
CREATE UNIQUE INDEX "students_tenant_id_identity_user_id_key" ON "students"("tenant_id", "identity_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_tenant_id_source_external_reference_key" ON "students"("tenant_id", "source", "external_reference");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_pagination_token_key" ON "teachers"("pagination_token");

-- CreateIndex
CREATE INDEX "teachers_tenant_id_status_last_name_first_name_idx" ON "teachers"("tenant_id", "status", "last_name", "first_name");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_tenant_id_identity_user_id_key" ON "teachers"("tenant_id", "identity_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_tenant_id_source_external_reference_key" ON "teachers"("tenant_id", "source", "external_reference");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_pagination_token_key" ON "subjects"("pagination_token");

-- CreateIndex
CREATE INDEX "subjects_tenant_id_status_name_idx" ON "subjects"("tenant_id", "status", "name");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_tenant_id_name_key" ON "subjects"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "course_subjects_pagination_token_key" ON "course_subjects"("pagination_token");

-- CreateIndex
CREATE INDEX "course_subjects_tenant_id_course_id_status_sort_order_idx" ON "course_subjects"("tenant_id", "course_id", "status", "sort_order");

-- CreateIndex
CREATE INDEX "course_subjects_tenant_id_subject_id_status_idx" ON "course_subjects"("tenant_id", "subject_id", "status");

-- CreateIndex
CREATE INDEX "course_enrollments_tenant_id_course_id_status_student_id_idx" ON "course_enrollments"("tenant_id", "course_id", "status", "student_id");

-- CreateIndex
CREATE INDEX "course_enrollments_tenant_id_student_id_status_course_id_idx" ON "course_enrollments"("tenant_id", "student_id", "status", "course_id");

-- CreateIndex
CREATE INDEX "student_subject_enrollments_tenant_id_student_id_status_cou_idx" ON "student_subject_enrollments"("tenant_id", "student_id", "status", "course_subject_id");

-- CreateIndex
CREATE INDEX "student_subject_enrollments_tenant_id_course_subject_id_sta_idx" ON "student_subject_enrollments"("tenant_id", "course_subject_id", "status", "student_id");

-- CreateIndex
CREATE INDEX "course_subject_teachers_tenant_id_teacher_id_status_course__idx" ON "course_subject_teachers"("tenant_id", "teacher_id", "status", "course_subject_id");

-- CreateIndex
CREATE INDEX "course_subject_teachers_tenant_id_course_subject_id_status__idx" ON "course_subject_teachers"("tenant_id", "course_subject_id", "status", "teacher_id");

-- Domain checks that Prisma cannot currently express in the schema.
ALTER TABLE "academic_years"
ADD CONSTRAINT "academic_years_date_range_check"
CHECK ("start_date" <= "end_date");

ALTER TABLE "course_subjects"
ADD CONSTRAINT "course_subjects_sort_order_check"
CHECK ("sort_order" >= 0);

-- Preserve relationship history while allowing at most one current active
-- relationship. These partial unique indexes are intentionally migration SQL.
CREATE UNIQUE INDEX "course_subjects_one_active_course_subject_key"
ON "course_subjects"("tenant_id", "course_id", "subject_id")
WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX "course_enrollments_one_active_enrollment_key"
ON "course_enrollments"("tenant_id", "student_id", "course_id")
WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX "student_subject_enrollments_one_active_assignment_key"
ON "student_subject_enrollments"("tenant_id", "student_id", "course_subject_id")
WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX "course_subject_teachers_one_active_assignment_key"
ON "course_subject_teachers"("tenant_id", "teacher_id", "course_subject_id")
WHERE "status" = 'ACTIVE';

-- AddForeignKey
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_tenant_id_academic_year_id_fkey" FOREIGN KEY ("tenant_id", "academic_year_id") REFERENCES "academic_years"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_subjects" ADD CONSTRAINT "course_subjects_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_subjects" ADD CONSTRAINT "course_subjects_tenant_id_course_id_fkey" FOREIGN KEY ("tenant_id", "course_id") REFERENCES "courses"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_subjects" ADD CONSTRAINT "course_subjects_tenant_id_subject_id_fkey" FOREIGN KEY ("tenant_id", "subject_id") REFERENCES "subjects"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_tenant_id_student_id_fkey" FOREIGN KEY ("tenant_id", "student_id") REFERENCES "students"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_tenant_id_course_id_fkey" FOREIGN KEY ("tenant_id", "course_id") REFERENCES "courses"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_subject_enrollments" ADD CONSTRAINT "student_subject_enrollments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_subject_enrollments" ADD CONSTRAINT "student_subject_enrollments_tenant_id_student_id_fkey" FOREIGN KEY ("tenant_id", "student_id") REFERENCES "students"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_subject_enrollments" ADD CONSTRAINT "student_subject_enrollments_tenant_id_course_subject_id_fkey" FOREIGN KEY ("tenant_id", "course_subject_id") REFERENCES "course_subjects"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_subject_teachers" ADD CONSTRAINT "course_subject_teachers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_subject_teachers" ADD CONSTRAINT "course_subject_teachers_tenant_id_teacher_id_fkey" FOREIGN KEY ("tenant_id", "teacher_id") REFERENCES "teachers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_subject_teachers" ADD CONSTRAINT "course_subject_teachers_tenant_id_course_subject_id_fkey" FOREIGN KEY ("tenant_id", "course_subject_id") REFERENCES "course_subjects"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
