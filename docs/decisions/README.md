# Architecture decision records

Status: decision index

These records capture major architectural choices from the brief and architecture baseline. Proposed records are contracts to review, not permission to silently finalize alternatives. Accepted records are authoritative within their documented scope; explicitly listed follow-up decisions remain open.

| ADR | Candidate | Status |
| --- | --- | --- |
| [0001](ADR-0001-service-and-database-boundary.md) | Independent academic service and database | Proposed / mostly mandated; Identity boundary reconciled by ADR-0009 |
| [0002](ADR-0002-tenant-context-resolution.md) | Trusted tenant-context resolution | Proposed / mandatory security property; Identity context reconciled by ADR-0009 |
| [0003](ADR-0003-identity-ownership-and-linking.md) | Identity ownership and optional academic links | Proposed / mostly mandated; linking contract reconciled by ADR-0009 |
| [0004](ADR-0004-edupay-sync-contract.md) | Explicit EduPay synchronization boundary | Proposed / mostly mandated |
| [0005](ADR-0005-private-object-storage-abstraction.md) | Private storage, quota, validation, immutability, and tenant-local deduplication | Accepted (2026-08-08) |
| [0006](ADR-0006-submission-revision-and-review-state.md) | Submission revision and review state | Proposed / product decision required |
| [0007](ADR-0007-notification-outbox.md) | Notification abstraction and outbox | Proposed |
| [0008](ADR-0008-api-and-contract-versioning.md) | Versioned API and contract strategy | Superseded by ADR-0011 |
| [0009](ADR-0009-identity-contract-reconciliation.md) | Reconciled Identity, canonical tenant, session, and MVP authorization contract | Accepted (2026-08-08) |
| [0010](ADR-0010-course-subject-and-lifecycle.md) | CourseSubject terminology and academic lifecycle baseline | Accepted (2026-08-08) |
| [0011](ADR-0011-api-and-shared-contract-strategy.md) | API and shared application contract strategy | Accepted (2026-08-08) |

## ADR workflow

Each accepted ADR must link back to affected product/architecture docs, add acceptance tests where behavior changes, and note any superseded decision. Unresolved items stay in the decision register until resolved.
