# ADR-0016: EduPay synchronization strategy proposal

Status: **Proposed**; D-06 remains open

Date: 2026-08-10

Owners to approve: EduPay integration owner, platform/operations owner, security owner

Related: [Synchronization discovery](../integration/edupay-sync-discovery.md), [ADR-0004](ADR-0004-edupay-sync-contract.md)

## Context

Académico needs a recoverable synchronization boundary for selected EduPay academic records. Direct database coupling is prohibited by the service boundary. The source checkout requested for discovery is missing, so EduPay API, export, webhook, event, authentication, change-volume, rate-limit, and timestamp behavior are unknown.

This proposal compares the required modes without claiming that any source capability exists.

## Options considered

| Option | Assessment |
| --- | --- |
| Scheduled pull from EduPay API | Medium implementation complexity; predictable load; replayable and retryable; recommended MVP if an explicit versioned API exists. |
| Scheduled pull from an explicitly supported export/interface | Viable fallback when a stable, secure, tenant-bound export exists; less fresh and weaker for incremental deletion semantics. |
| Push/webhook/event | Low latency but requires producer support, signed delivery, replay protection, ordering/idempotency, and recovery for missed events. Not evidenced. |
| Hybrid push/event plus scheduled reconciliation | Strongest eventual correctness and latency after both contracts exist, but highest initial complexity and coupling. Recommended future evolution. |
| Direct database access | Rejected; violates independent persistence and expands migration, availability, authorization, and secret boundaries. |

## Proposal

### MVP

Use a **scheduled pull from an explicit versioned EduPay API** when source inspection proves that the API is supported and supplies stable IDs, tenant scoping, bounded pagination, and a trustworthy `updatedAt` or cursor. The integration should be asynchronous and independent of interactive academic requests.

The provisional cadence is:

- hourly incremental pull during operational hours;
- daily full reconciliation in a source-approved low-load window;
- bounded authorized operator-triggered runs for onboarding and recovery;
- exponential backoff for temporary unavailability;
- no deactivation from an incomplete, failed, or untrusted source response.

This is a provisional recommendation only. It must be recalibrated against actual EduPay change frequency, rate limits, volume, operational windows, and freshness requirements before acceptance. If no supported API exists, this ADR returns to review; an explicit export contract may be evaluated as the fallback.

### Future evolution

Adopt **hybrid signed push/events plus scheduled full reconciliation** after the source proves durable delivery, replay protection, ordering/version semantics, and a secure tenant-bound callback contract. The scheduled reconciliation remains the correctness backstop.

## Idempotency and recovery

Use the deterministic key:

```text
canonical tenantId + source + entityType + immutable externalId
```

The current Student/Teacher target equivalent is `(tenantId, source, externalReference)`. Every item is processed in a tenant-scoped transaction or independently retryable unit. Same-version replays are unchanged; older source versions are ignored; failed items do not roll back successful items in the batch.

Duplicate source IDs, cross-tenant collisions, and mappings to different target records are quarantined as conflicts. Names, email, RUT, and mutable course labels are never used for automatic matching.

## Deactivation and conflict recovery

- Student becomes `INACTIVE`; related source-owned active course memberships become `INACTIVE` as appropriate; historical data remains.
- A moved student closes the old active `CourseEnrollment` and creates/activates the new one; the old relationship is not deleted.
- A confirmed missing source Student becomes inactive and a missing Course becomes archived only after a complete successful reconciliation and an owner-approved absence grace rule (proposed: two consecutive successful full reconciliations).
- A partial batch remains `PARTIAL` and exposes item results; an unavailable source preserves the last known state and never triggers mass deactivation.
- Source-authoritative field changes are recorded with conflict evidence before/when applied. Initial-only and manual-only fields retain local values.

## Minimum reconciliation evidence

The future implementation must expose, per tenant/source:

- run ID, mode, trigger, correlation ID, start/end, status, source cursor/version, and last successful sync;
- counts for `seen`, `created`, `updated`, `unchanged`, `deactivated`, and `failed`;
- item results with source entity type, external ID, target ID, result, source version, error code, retryability, and safe conflict evidence;
- bounded error summary and alertable failure/unavailable state.

No source credentials or unnecessary student PII may be persisted in logs or synchronization evidence.

## Security and operational requirements

- Use source-approved server-side authentication and secret custody; never copy credentials into code, fixtures, client bundles, logs, or documentation.
- Resolve the source institution through a server-controlled mapping to the canonical ecosystem tenant ID.
- Enforce timeouts, bounded retries, concurrency/page limits, source rate limits, and circuit-breaker/backoff behavior.
- For future push, validate signature, issuer/audience, timestamp/replay protection, payload schema, and idempotency before processing.
- Keep sync independent of interactive Academic writes and revalidate tenant context for asynchronous work.
- Log correlation IDs, counts, opaque IDs, and bounded error codes; redact names, RUT, email, tokens, and raw payloads.

## Consequences

Positive:

- The MVP is recoverable and operationally simple if the API contract exists.
- Eventual consistency is explicit and real-time coupling is avoided.
- Full reconciliation provides drift detection and recovery from missed or duplicated changes.
- No direct database coupling or source credential sharing is required.

Costs and unresolved questions:

- The source API/export/event capability and actual cadence are unknown.
- Future target provenance gaps must be resolved for Course, AcademicYear, and relationships.
- Sync run/item evidence will require an accepted persistence or observability design; this branch intentionally adds no models.

## Acceptance gates

This ADR may become Accepted only after:

- source capability and authentication are verified from the requested checkout or an owner-approved contract;
- tenant mapping, source IDs, pagination/cursor, update/deletion semantics, volume, and rate limits are documented;
- the cadence is recalculated from source behavior and approved;
- idempotency, duplicate, stale replay, partial failure, outage, conflict, and deactivation tests are approved;
- security and operational owners approve secret custody, logging, retry, and alerting behavior;
- the mechanism is implemented only after the necessary contract/schema review.

Until then, D-06 remains **OPEN** and no worker, cron, webhook, API client, or sync model may be implemented from this proposal alone.
