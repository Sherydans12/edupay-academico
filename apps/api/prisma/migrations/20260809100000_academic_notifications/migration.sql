-- Academic notification intents, in-app notifications, and PostgreSQL-backed delivery queue.
CREATE TYPE "NotificationEventType" AS ENUM (
  'ASSIGNMENT_PUBLISHED',
  'ASSESSMENT_PUBLISHED',
  'ANNOUNCEMENT_PUBLISHED',
  'SUBMISSION_RECEIVED',
  'RESUBMISSION_RECEIVED',
  'SUBMISSION_REVIEWED',
  'CHANGES_REQUESTED'
);
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'DELIVERED',
  'RETRY',
  'FAILED',
  'SKIPPED'
);

CREATE TABLE "notification_events" (
  "tenant_id" VARCHAR(128) NOT NULL,
  "id" VARCHAR(220) NOT NULL,
  "event_type" "NotificationEventType" NOT NULL,
  "aggregate_type" VARCHAR(80) NOT NULL,
  "aggregate_id" VARCHAR(128) NOT NULL,
  "payload" JSONB NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "not_before" TIMESTAMPTZ(3) NOT NULL,
  "request_id" VARCHAR(128),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_events_pkey" PRIMARY KEY ("tenant_id", "id")
);

CREATE TABLE "notification_deliveries" (
  "tenant_id" VARCHAR(128) NOT NULL,
  "id" UUID NOT NULL,
  "event_id" VARCHAR(220) NOT NULL,
  "recipient_key" VARCHAR(220) NOT NULL,
  "recipient_identity_user_id" VARCHAR(128),
  "recipient_email" VARCHAR(320),
  "channel" "NotificationChannel" NOT NULL,
  "template_version" VARCHAR(40) NOT NULL,
  "idempotency_key" VARCHAR(500) NOT NULL,
  "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_at" TIMESTAMPTZ(3),
  "last_attempt_at" TIMESTAMPTZ(3),
  "sent_at" TIMESTAMPTZ(3),
  "provider_message_id" VARCHAR(200),
  "last_error_category" VARCHAR(80),
  "last_error_message" VARCHAR(500),
  "skip_reason" VARCHAR(120),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("tenant_id", "id")
);

CREATE TABLE "in_app_notifications" (
  "tenant_id" VARCHAR(128) NOT NULL,
  "id" UUID NOT NULL,
  "notification_delivery_id" UUID NOT NULL,
  "recipient_identity_user_id" VARCHAR(128) NOT NULL,
  "type" "NotificationEventType" NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "body" VARCHAR(500) NOT NULL,
  "target_path" VARCHAR(500) NOT NULL,
  "event_id" VARCHAR(220) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "read_at" TIMESTAMPTZ(3),
  CONSTRAINT "in_app_notifications_pkey" PRIMARY KEY ("tenant_id", "id")
);

CREATE UNIQUE INDEX "notification_deliveries_idempotency_key_key"
  ON "notification_deliveries"("idempotency_key");
CREATE UNIQUE INDEX "notification_deliveries_event_recipient_channel_template_key"
  ON "notification_deliveries"("tenant_id", "event_id", "recipient_key", "channel", "template_version");
CREATE INDEX "notification_events_tenant_id_event_type_not_before_idx"
  ON "notification_events"("tenant_id", "event_type", "not_before");
CREATE INDEX "notification_events_tenant_id_aggregate_type_aggregate_id_idx"
  ON "notification_events"("tenant_id", "aggregate_type", "aggregate_id");
CREATE INDEX "notification_deliveries_tenant_id_status_next_attempt_at_id_idx"
  ON "notification_deliveries"("tenant_id", "status", "next_attempt_at", "id");
CREATE INDEX "notification_deliveries_tenant_id_recipient_identity_user_id_channel_status_idx"
  ON "notification_deliveries"("tenant_id", "recipient_identity_user_id", "channel", "status");
CREATE UNIQUE INDEX "in_app_notifications_tenant_id_notification_delivery_id_key"
  ON "in_app_notifications"("tenant_id", "notification_delivery_id");
CREATE INDEX "in_app_notifications_tenant_id_recipient_identity_user_id_created_at_id_idx"
  ON "in_app_notifications"("tenant_id", "recipient_identity_user_id", "created_at", "id");
CREATE INDEX "in_app_notifications_tenant_id_recipient_identity_user_id_read_at_idx"
  ON "in_app_notifications"("tenant_id", "recipient_identity_user_id", "read_at");

ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_tenant_id_event_id_fkey"
  FOREIGN KEY ("tenant_id", "event_id") REFERENCES "notification_events"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_tenant_id_notification_delivery_id_fkey"
  FOREIGN KEY ("tenant_id", "notification_delivery_id") REFERENCES "notification_deliveries"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_attempt_count_check"
  CHECK ("attempt_count" >= 0);
