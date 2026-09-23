CREATE TABLE "tenant_operational_profiles" (
    "tenant_id" VARCHAR(128) NOT NULL,
    "institution_display_name" VARCHAR(240),
    "time_zone" VARCHAR(80),
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_by_identity_user_id" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tenant_operational_profiles_pkey" PRIMARY KEY ("tenant_id")
);

CREATE TABLE "tenant_operational_profile_revisions" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(128) NOT NULL,
    "version" INTEGER NOT NULL,
    "institution_display_name" VARCHAR(240),
    "time_zone" VARCHAR(80),
    "actor_identity_user_id" VARCHAR(128) NOT NULL,
    "actor_membership_id" VARCHAR(128) NOT NULL,
    "request_id" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_operational_profile_revisions_pkey" PRIMARY KEY ("tenant_id", "id")
);

CREATE UNIQUE INDEX "tenant_operational_profile_revisions_tenant_id_version_key"
    ON "tenant_operational_profile_revisions"("tenant_id", "version");

CREATE INDEX "tenant_operational_profile_revisions_tenant_id_created_at_idx"
    ON "tenant_operational_profile_revisions"("tenant_id", "created_at");

ALTER TABLE "tenant_operational_profiles"
    ADD CONSTRAINT "tenant_operational_profiles_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tenant_operational_profile_revisions"
    ADD CONSTRAINT "tenant_operational_profile_revisions_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
