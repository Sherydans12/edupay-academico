# ADR-0016: EduPay synchronization strategy decision

Status: **Accepted**; D-06 resolved 2026-08-11

Date: 2026-08-11

Approved by: EduPay integration owner, platform/operations owner, security/privacy owner, Académico product owner

Related: [Synchronization discovery](../integration/edupay-sync-discovery.md), [ADR-0004](ADR-0004-edupay-sync-contract.md), [ADR-0011](ADR-0011-api-and-shared-contract-strategy.md)

## Context and verified source capability

The real upstream is `C:\Users\nicol\Documents\EduPay`, repository `Sherydans12/BL-002-EduPay`, inspected at revision `d7a8321`. The source is a separate NestJS 11/Prisma 7/PostgreSQL administrative application.

The source currently provides:

- unversioned admin CRUD routes under `/api/courses`, `/api/students`, and `/api/guardians`;
- offset pagination with `page`/`limit`, not an opaque cursor or `updatedSince` contract;
- `createdAt`/`updatedAt` on relevant entities;
- soft deletion through `deletedAt`, while ordinary list routes omit deleted records;
- local admin JWT authentication and a separate portal static-key API for guardian/payment/Webpay operations;
- XLSX administrative exports;
- no academic outbox, academic event stream, source change feed, or academic webhook.

The current source responses can include guardian data, payment/charge data, and derived financial totals. The existing portal API is not an academic roster API. Existing exports do not include deletion tombstones, a versioned machine contract, or sparse academic-only data. Direct database access is disallowed by the target architecture.

Therefore, no current source interface is sufficient for a safe incremental Académico sync. A source-side contract is a prerequisite, not an implementation detail to be silently worked around.

## Options considered

| Option | Complexity | Reliability/error recovery | Load/latency | Deployment coupling | Security | Finding |
| --- | --- | --- | --- | --- | --- | --- |
| A. Scheduled pull from EduPay API | Medium after contract changes; simple operational model | Retryable/replayable with cursor and full reconciliation | Predictable bounded load; eventual consistency | Depends on an explicit API contract, not DB schema | Dedicated S2S auth and tenant mapping | **Accepted MVP; source API prerequisite.** |
| B. Scheduled pull from supported export/interface | Low-medium consumer; export operations required | Good replay of complete files; weak incremental/tombstone semantics unless designed in | Bursty and less fresh | Operational export producer is coupled | Secure delivery, integrity, tenant binding, PII minimization | **Fallback only.** Existing XLSX is not sufficient. |
| C. Push/webhook/event | High producer and consumer complexity | Requires durable delivery, replay, ordering, dead-lettering, and backstop | Low latency; producer must emit every change | High source/target coupling | Signed tenant-bound delivery and replay protection | **Not supported by source today.** |
| D. Hybrid events plus scheduled reconciliation | Highest initial complexity; best eventual correctness | Events reduce latency; full run repairs drift/missed messages | Low latency plus periodic load | Highest | Two secure contracts and event operations | **Recommended future evolution.** |
| Direct database coupling | Low initial coding effort only | Fragile across migrations and outages; poor service audit boundary | Shared/unbounded load | Maximal migration/deployment coupling | Expands credentials and tenant exposure | **Rejected.** |

## Accepted decision

### MVP mechanism

Use a **scheduled pull from a dedicated, versioned, read-only EduPay integration API**. The synchronizer must be asynchronous and independent of interactive Academic requests. Ordinary EduPay admin CRUD endpoints, portal endpoints, and direct database access are not supported sync contracts.

The current source admin and portal interfaces do not satisfy the contract. This ADR accepts the architecture; it does not claim that the source API or synchronization implementation exists.

### Accepted cadence baseline

The operational default is:

- hourly incremental pull during an agreed operational window;
- nightly complete tenant reconciliation in an agreed low-load window;
- bounded operator-triggered full run for onboarding and recovery;
- exponential backoff for temporary source unavailability;
- explicit trusted tombstones may apply lifecycle changes immediately;
- simple absence may deactivate/archive only after two consecutive complete successful full reconciliations;
- partial or failed runs never cause absence-driven lifecycle changes.

This cadence is an operational default and may be configured later. The source implementation does not provide a real-time contract; the accepted strategy is scheduled eventual consistency.

### Future evolution

Adopt **hybrid signed events/webhooks plus scheduled full reconciliation** once the source has a durable academic event producer. Events must include a stable entity version or sequence, tenant scope, delivery ID, replay protection, ordering semantics, retry/dead-letter behavior, and a documented recovery path. The scheduled full run remains the correctness backstop.

## Required source API contract

Before implementation, the source owner should provide a dedicated namespace such as `/api/v1/integrations/academico` with:

1. Read-only, sparse academic payloads; no payments, charges, financial totals, credentials, roles, permissions, or Guardian contact data.
2. Server-side service authentication approved by security. The source admin JWT and portal static bearer key are not assumed to be integration credentials.
3. Server-validated tenant scoping and source tenant ID in every response. The integration must resolve `(EDUPAY, sourceTenantId)` to the canonical ecosystem tenant server-side.
4. An immutable, never-reused public Course ID/UUID. Source migrations prove that current Course integer IDs can be rewritten. Student IDs also need an explicit no-reuse guarantee or replacement public ID.
5. Minimum fields:

   - Course: source tenant key, immutable public ID, `name`, `createdAt`, `updatedAt`, `deletedAt`;
   - Student: source tenant key, immutable ID, `name`, optional `rut` only after privacy approval, `status`, current Course public ID, `createdAt`, `updatedAt`, `deletedAt`.

6. Bounded pagination with an opaque cursor or deterministic `(updatedAt, immutableId)` order, an incremental watermark, a schema version, and a complete-snapshot mode.
7. Soft-delete tombstones or a deletion feed, including behavior for deletion between pages and tombstone retention.
8. Defined error codes, rate limits, timeouts, freshness expectations, and retry-safe behavior.

Guardian should remain out of the MVP API. A future Guardian contract needs a separate privacy and target-model decision.

## Idempotency and stale-update protection

### Identity

Use the deterministic key:

```text
(canonicalTenantId, source = "EDUPAY", entityType, externalId = integrationId)
```

EduPay must add and backfill generated UUIDs `Course.integrationId` and `Student.integrationId`. They are immutable, never reused, exposed by the dedicated API, and become Académico `externalReference` values. For CourseEnrollment, use explicit tenant-safe provenance based on the source Student/Course integration IDs. Never use the current mutable/resequenced Course integer ID, RUT, name, email, or display label.

### Processing rules

- Resolve and validate one canonical tenant before reading or writing items.
- Upsert by stable external identity, not name, RUT, email, Guardian, or Course label.
- Equal source version/cursor replay is `unchanged`.
- Older source version is ignored or recorded as stale; newer source version applies under the D-05 ownership rule.
- Duplicate source IDs within an entity namespace are quarantined; no arbitrary winner is selected.
- Cross-tenant records and a source ID mapped to different target records are hard conflicts for the item, not remapping opportunities.
- Process items independently or in tenant-scoped retryable units. A successful item is not repeated as a new row because its external identity is deterministic.
- A partial batch reports successful and failed items separately and is safe to retry.
- Source outage preserves the last known Academic state.

The source currently has `updatedAt` but no incremental API. The required API must define a deterministic cursor/watermark, equal-timestamp behavior, resume semantics, bounded pages, schema version, and tombstones.

## Deactivation, course movement, and history

### Student status mapping

| EduPay state | Target action |
| --- | --- |
| `ACTIVE` | Set source-linked Student `ACTIVE`. |
| `INACTIVE` | Set source-linked Student `INACTIVE`. |
| `GRADUATED` | Set target Student `INACTIVE`; preserve raw source state in accepted sync evidence/provenance if available. |
| `deletedAt != null` | Set target Student `INACTIVE` only after a trusted tombstone or complete reconciliation rule. |

No Student hard delete is proposed.

### Course movement

EduPay exposes only current `Student.courseId`, not enrollment history. When it changes:

1. Resolve old/new Courses by immutable source mappings.
2. Mark the old active source-owned `CourseEnrollment` `INACTIVE`.
3. Create/activate the new source-owned `CourseEnrollment` `ACTIVE`.
4. Preserve the old relationship, Learning, Submissions, and audit/reconciliation evidence.

If a Course mapping is missing or ambiguous, quarantine the item rather than creating a Course from its name.

### Disappearance and soft deletion

Current source ordinary lists exclude `deletedAt` records. The integration API must expose tombstones or a deletion feed. An unseen source row may be deactivated/archived only after two consecutive complete successful full reconciliations. Partial batches, timeouts, invalid responses, and source outages never trigger absence-driven lifecycle changes.

Course deletion maps to target `Course.status = ARCHIVED` and source-owned enrollment deactivation. No Course, CourseEnrollment, Learning, or Submission hard deletion occurs.

## Reconciliation and observability

The future implementation must provide per tenant/source:

### SyncRun evidence

- run ID, source, canonical tenant, mode, trigger, correlation ID;
- start/end, status (`SUCCEEDED`, `PARTIAL`, `FAILED`, `SOURCE_UNAVAILABLE`), source API/schema version;
- source cursor/version and last successful sync;
- counts `seen`, `created`, `updated`, `unchanged`, `deactivated`, `failed`.

### SyncItemResult evidence

- entity type, source external ID, target ID when known, result, source version, retryability, conflict/error code;
- safe redacted evidence for field conflicts and source validation errors;
- no raw source payload, credentials, tokens, payment data, or unnecessary PII.

An accepted implementation may choose persistence or an approved observability backend later. This discovery branch intentionally adds no SyncRun model or worker.

## Security and operations

- Keep dedicated source credentials in server-side secret custody; never copy them into documentation, code, fixtures, client bundles, or logs.
- Do not reuse source admin JWTs or portal static keys without an explicit security review.
- Enforce canonical tenant mapping, tenant scope on every request/page, and server-created tenant context for asynchronous work.
- Apply request timeouts, bounded retries, backoff/circuit breaker, page/concurrency limits, and source rate limits.
- Minimize PII and exclude Guardian contact/financial data from the MVP feed.
- Redact names, RUT, email, phone, tokens, authorization headers, and raw payloads from logs.
- Expose counts, opaque IDs, correlation IDs, bounded error codes, and last-successful-run state for operations.

## Consequences

Positive:

- The MVP has a recoverable, replayable boundary without direct database access.
- Eventual consistency is explicit and real-time coupling is avoided.
- Full reconciliation repairs missed/duplicated changes and is the only absence-based lifecycle trigger.
- The target preserves Academic history and pedagogical ownership.

Implementation prerequisites:

- The source must add/backfill `Course.integrationId` and `Student.integrationId`, structured Student names, tombstones, cursor/watermark behavior, and the supported service contract.
- Target provenance for Course and CourseEnrollment must be added using the approved explicit tenant-safe model.
- Tenant mapping and local AcademicYear selection must be configured before a run.
- SyncRun/SyncItemResult evidence, alerting, and acceptance tests remain implementation work.

## Implementation gates

This ADR is **Accepted**. Synchronization implementation remains gated on:

1. dedicated server-to-server authentication and tenant scoping;
2. sparse academic payloads with immutable/backfilled integration IDs and structured Student names;
3. schema version, deterministic cursor/watermark, full snapshot, tombstones, bounded pages, retry-safe semantics, documented errors, and rate limits;
4. configured source-tenant-to-canonical-tenant mapping and local AcademicYear selection;
5. approved Course/CourseEnrollment provenance;
6. idempotency, duplicate, stale replay, partial failure, outage, course movement, tombstone, two-run absence, and deactivation tests;
7. SyncRun/item observability, security, logging, retry, and alerting implementation.

These are delivery prerequisites, not an unresolved D-06 strategy decision. No direct database integration is permitted.
