# Deployment and operations

Status: proposed environment and operational baseline; provider topology unresolved

## Runtime components

The production topology must support, at minimum:

- Next.js 16 web application;
- NestJS 11 API;
- EduPay Identity integration;
- PostgreSQL 15 academic database;
- S3-compatible object storage;
- Académico notification delivery adapter, if enabled;
- EduPay Identity’s separate durable-outbox/Resend delivery remains owned and operated by Identity;
- a mechanism for retryable notification/synchronization work once approved.

Components may share infrastructure in early environments, but ownership and failure boundaries must remain explicit.

## Environments

- **Local**: safe provider fakes or sandbox resources; seed data only.
- **Development**: integration testing with non-production credentials and representative fixtures.
- **Staging**: production-like schema, storage, Identity, and email configuration with sanitized data.
- **Production/pilot**: Colegio Conquistadores tenant and controlled operational access.

Environment configuration must be externalized and validated at startup. Missing required configuration should fail clearly rather than silently disabling security or tenant checks.

## Browser Identity topology

The Académico web deployment configures two independent public boundaries:

- `NEXT_PUBLIC_API_BASE_URL` points to the versioned Académico API base, ending in `/api/v1`.
- `NEXT_PUBLIC_IDENTITY_BASE_URL` is the EduPay Identity origin, without an API path. Browser login, refresh, logout, activation, recovery, and membership requests are resolved against this origin.

The exact user-facing Académico frontend origin must also be present in Identity's
`IDENTITY_TRUSTED_WEB_ORIGINS`. Identity reflects credentialed CORS only for exact
trusted origins and does not implicitly trust localhost. Cross-site HTTPS deployments
must coordinate Identity's secure cookie `SameSite` setting with the accepted browser-
session ADR; the frontend does not bypass Origin or CORS checks.

For the deployment topology where Académico serves the account pages, Identity's
`IDENTITY_PUBLIC_BASE_URL` must be the public web origin that serves `/activate` and
`/reset-password`, not the Identity API origin. Identity invitation and recovery emails
currently construct links under those exact routes. Production domains remain an
operator-approved environment choice and are not committed to this repository.

The access JWT exists only in the running frontend provider's memory. The rotating
refresh credential remains in Identity's host-only `HttpOnly` cookie and is never read,
copied, logged, persisted, or sent to Académico by frontend code.

## Database operations

- All schema changes are reviewed migrations.
- Migrations are forward-compatible with the deploy sequence where possible.
- Backups are automated and restore-tested.
- Destructive data changes require an approved migration plan and audit.
- Connection pooling, timeouts, and transaction boundaries are documented.

## Observability

Collect structured logs, metrics, and traces with:

- request/correlation ID;
- tenant attribution where safe;
- actor type, not unnecessary personal data;
- operation outcome and latency;
- provider failure and retry counts;
- upload, sync, and notification health.

Alerts should detect authentication failure spikes, cross-tenant authorization errors, database/storage failures, stuck outbox work, sync drift, and email delivery degradation.

## Resilience and recovery

- Define recovery point and recovery time objectives before production.
- Test database restore and object-storage recovery.
- Document provider outage behavior and manual fallback for synchronization and email.
- Keep academic transactions independent from non-critical email delivery.
- Rollback plans must cover application version, database migration, and queued work.

## Unresolved decisions

- Hosting provider, region, network topology, and infrastructure-as-code approach.
- Worker/queue technology.
- Backup retention and disaster-recovery targets.
- Production support ownership and on-call expectations.
- Email sending domain and storage bucket layout.
