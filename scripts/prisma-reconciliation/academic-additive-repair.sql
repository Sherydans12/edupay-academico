-- PROPOSED ONLY: production execution requires explicit user authorization.
-- Source: deployed b2f489f schema and the two pending additive migration files.
-- Existing version columns, revision tables, enum types and migration history
-- must remain untouched. No data backfill is needed for nullable body documents.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
  IF to_regclass('public.learning_items') IS NULL
     OR to_regclass('public.learning_item_drafts') IS NULL
     OR to_regclass('public.tenants') IS NULL THEN
    RAISE EXCEPTION 'Required existing tables are unavailable';
  END IF;
  IF to_regclass('public.command_receipts') IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected existing command_receipts; repeat read-only reconciliation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('learning_items', 'learning_item_drafts')
      AND column_name = 'body_document'
  ) THEN
    RAISE EXCEPTION 'Unexpected existing body_document; repeat read-only reconciliation';
  END IF;
END $$;

ALTER TABLE public.learning_items ADD COLUMN body_document JSONB;
ALTER TABLE public.learning_item_drafts ADD COLUMN body_document JSONB;

CREATE TABLE public.command_receipts (
  id UUID NOT NULL,
  tenant_id VARCHAR(128) NOT NULL,
  actor_identity_user_id VARCHAR(128) NOT NULL,
  command_name VARCHAR(80) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  payload_fingerprint VARCHAR(128) NOT NULL,
  response_status INTEGER NOT NULL DEFAULT 200,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT command_receipts_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT command_receipts_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX command_receipts_tenant_id_created_at_idx
  ON public.command_receipts(tenant_id, created_at);
CREATE UNIQUE INDEX command_receipts_tenant_actor_command_key_key
  ON public.command_receipts(tenant_id, actor_identity_user_id, command_name, idempotency_key);

COMMIT;
