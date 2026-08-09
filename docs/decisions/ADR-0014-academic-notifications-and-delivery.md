# ADR-0014: academic notifications and delivery

Status: Accepted
Date: 2026-08-09
Decision authority: owner-approved Academic Notifications MVP baseline

## Context

Académico needs durable in-app and operational academic email notifications for
Learning publication and Submission/review workflows. The academic mutation
must remain successful when an email provider is unavailable, and a worker
restart must not silently lose a notification. EduPay Identity separately owns
invitation, activation, password-recovery, and authentication email delivery.

This ADR resolves D-12 (queue/worker technology and retry policy) and D-13
(MVP event catalog, preferences, and email copy). It does not change the
Identity ownership boundary or introduce Identity email behavior.

## Decision

### PostgreSQL transactional outbox

PostgreSQL is the durable notification queue/outbox for the MVP. Académico
does not introduce Redis, RabbitMQ, Kafka, or another queue service.

Academic domain transactions create a `NotificationEvent` and its
`NotificationDelivery` rows before commit. Learning publication and
Submission/review mutations therefore cannot commit without their durable
notification intent, while Resend availability is not part of the transaction.
Provider delivery is never attempted synchronously by the API request.

The persistence model is intentionally separated into:

- `NotificationEvent`: stable tenant-scoped event identity, event type,
  aggregate/resource identity, safe template payload, occurrence time, and
  `notBefore` time;
- `NotificationDelivery`: one channel/recipient/template-version attempt,
  status, idempotency key, retry/claim metadata, provider ID, and sanitized
  failure state;
- `InAppNotification`: recipient-scoped read state and minimal display data.

Every tenant-owned row carries the canonical ecosystem `tenant_id`. No
foreign key to Identity tables is created. `recipientIdentityUserId` is an
opaque external reference resolved from the academic Student/Teacher link.

### Claiming, retries, and idempotency

The independently runnable notification worker uses PostgreSQL row claiming
equivalent to `FOR UPDATE SKIP LOCKED`. A claim atomically changes eligible
`PENDING`/`RETRY` rows to `PROCESSING`, increments the attempt count, and
records the lease timestamp. Expired `PROCESSING` leases are reclaimable after
the configured lease interval. Multiple worker instances therefore do not
normally process the same delivery concurrently.

Delivery remains idempotent even after a crash. The database enforces a unique
key equivalent to:

`eventId + recipient + channel + template/version`

The worker defaults are configurable and are safe for the MVP: five-second
polling, batches of fifty, a maximum of five attempts, and approximately
one-minute, five-minute, fifteen-minute, one-hour, and six-hour retry delays.
The maximum attempt setting is bounded; terminal `FAILED` rows remain visible
for operators. Provider errors are categorized without storing full email
bodies or sensitive student content.

In-app notifications are materialized transactionally from the intent because
they do not depend on an external provider. Email rows remain pending for the
worker. Delivery states are `PENDING`, `PROCESSING`, `DELIVERED`, `RETRY`,
`FAILED`, and `SKIPPED`.

### Scheduled publication

Scheduling a LearningItem does not send a notification early. Existing
Learning read queries continue to determine effective visibility from
`SCHEDULED` plus elapsed `publishAt`; visibility does not depend on the worker.
The worker scans due scheduled assignments, assessments, and announcements and
materializes a deterministic publication event after `publishAt`. Repeated
scans and worker restarts are idempotent.

### MVP event catalog and channels

| Event | Recipients | Channels |
| --- | --- | --- |
| `ASSIGNMENT_PUBLISHED` | eligible students for the CourseSubject | `IN_APP` + `EMAIL` |
| `ASSESSMENT_PUBLISHED` | eligible students for the CourseSubject | `IN_APP` + `EMAIL` |
| `SUBMISSION_RECEIVED` | active teachers assigned to the CourseSubject | `IN_APP` |
| `RESUBMISSION_RECEIVED` | active teachers assigned to the CourseSubject | `IN_APP` |
| `SUBMISSION_REVIEWED` | submitting student | `IN_APP` + `EMAIL` |
| `CHANGES_REQUESTED` | submitting student | `IN_APP` + `EMAIL` |

Eligible students are active academic Students reached through an active
default CourseEnrollment or active direct StudentSubjectEnrollment. Teacher
recipients are active Teachers with an active CourseSubjectTeacher assignment.
Only the submitting student receives review events; a `COMMENTED` review does
not create a notification event.

Announcement publication may create `ANNOUNCEMENT_PUBLISHED` in-app
notifications for eligible students. Announcements are not emailed by
default. Material publication has no email behavior. Deadline reminders, chat,
and ordinary teacher emails for content changes are out of scope.

If the academic person has no linked Identity user, Académico does not invent
a recipient. The corresponding delivery is recorded as `SKIPPED` with a
sanitized reason. A linked recipient without an academic email address is
similarly skipped for email only.

Per-user notification preferences are not required for this MVP. The delivery
channel and template-version columns preserve a future preferences seam. The
MVP email events are operational academic notifications, not marketing email.

### Académico Resend adapter and templates

Académico owns a separate Resend adapter configured with:

- `ACADEMIC_RESEND_API_KEY`;
- `ACADEMIC_EMAIL_FROM`;
- `ACADEMIC_PUBLIC_BASE_URL`;
- optional `ACADEMIC_EMAIL_REPLY_TO`.

These settings are never shared with Identity and API keys are never persisted.
The adapter stores a provider message ID where available, sent time, attempt
count, and sanitized error category/message. Tests use a fake adapter and do
not call Resend.

Templates are versioned as `v1`, tenant-neutral, and Spanish-language. They
may include subject name, activity title, due date, status, and a safe deep
link. They do not include uploaded files, file contents, passwords, tokens, or
unnecessary sensitive review history.

### API and isolation

The current authenticated user can access only their own tenant-scoped in-app
notifications through:

- `GET /api/v1/notifications` with cursor pagination;
- `PATCH /api/v1/notifications/:notificationId/read`;
- `POST /api/v1/notifications/read-all`;
- `GET /api/v1/notifications/unread-count`.

All routes require trusted Identity tenant/principal context. A
`SYSTEM_ADMIN` without explicit audited support context is denied. A
notification ID from another user or tenant is not readable or mutable.

Operational delivery summaries are worker/operator concerns and are not
exposed through ordinary student or teacher APIs.

## Consequences

- PostgreSQL capacity, indexes, lease recovery, and delivery-state monitoring
  are part of notification operations.
- The API remains independent of Resend availability, but a worker process
  must be scheduled or continuously run for email delivery.
- The deterministic event identity and bounded retries provide recovery without
  requiring exactly-once provider semantics.
- Email sender domains are environment/operator configuration only; tenant-
  specific sender domains and preferences remain future decisions.
- Notification retention, audit retention, malware scanning, hosting,
  synchronization, and pilot-success decisions remain governed by their own
  open decisions.

## Acceptance tests

PostgreSQL-backed coverage must verify publication, direct enrollment,
scheduled due-time materialization, submission/review catalog behavior,
cross-tenant and cross-recipient isolation, durable intents, duplicate event
idempotency, safe concurrent claiming, transient retry, terminal failure,
worker restart recovery, fake-provider delivery, and notification cursor/read
API behavior.

## Related documents

- [Notifications architecture](../architecture/notifications.md)
- [Learning model](../architecture/learning-model.md)
- [Submissions workflow](../architecture/submissions-workflow.md)
- [API conventions](../architecture/api-conventions.md)
- [Multitenancy](../architecture/multitenancy.md)
- [Unresolved decisions](../governance/unresolved-decisions.md)
- [ADR-0007](ADR-0007-notification-outbox.md) (proposal made concrete here)
