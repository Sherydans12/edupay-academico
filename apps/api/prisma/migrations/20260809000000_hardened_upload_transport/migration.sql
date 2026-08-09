-- Hardened two-phase upload transport and idempotent completion marker.
ALTER TABLE "upload_intents"
  ADD COLUMN "finalized_file_object_id" UUID;

CREATE INDEX "upload_intents_tenant_id_finalized_file_object_id_idx"
  ON "upload_intents"("tenant_id", "finalized_file_object_id");
