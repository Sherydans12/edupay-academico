-- CreateTable
CREATE TABLE "command_receipts" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(128) NOT NULL,
    "actor_identity_user_id" VARCHAR(128) NOT NULL,
    "command_name" VARCHAR(80) NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "payload_fingerprint" VARCHAR(128) NOT NULL,
    "response_status" INTEGER NOT NULL DEFAULT 200,
    "response_body" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "command_receipts_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateIndex
CREATE INDEX "command_receipts_tenant_id_created_at_idx" ON "command_receipts"("tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "command_receipts_tenant_actor_command_key_key" ON "command_receipts"("tenant_id", "actor_identity_user_id", "command_name", "idempotency_key");

-- AddForeignKey
ALTER TABLE "command_receipts" ADD CONSTRAINT "command_receipts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
