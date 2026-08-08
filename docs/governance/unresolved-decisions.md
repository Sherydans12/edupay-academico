# Unresolved architectural and product decisions

Status: decision register; resolved rows are recorded for traceability and all remaining open rows must not be silently decided in implementation

| ID | Decision | Why it matters | Suggested owner | Needed before |
| --- | --- | --- | --- | --- |
| D-01 | **Resolved 2026-08-08:** Identity issues a new short-lived access JWT containing the active canonical tenant/membership context; switching through Identity issues a new token | Determines request context, switching, revocation, and client behavior | Identity + security | Resolved for Phase 1 |
| D-02 | **Resolved 2026-08-08:** verified email is globally unique to one IdentityUser; institutional usernames are unique within a tenant realm after safe normalization; Académico explicitly initiates audited Student/Teacher ↔ IdentityUser linking | Affects invitations, imports, duplicate users, and privacy | Identity + product | Resolved for Phase 1 |
| D-03 | **Resolved 2026-08-08:** use the approved versioned Identity REST/JSON, JWKS/JWT, restricted linking/status, and durable outbox/Resend contracts; existing EduPay admin authentication remains a separate trust domain initially | Defines authentication implementation and migration risk | Identity + platform | Resolved for Phase 1 |
| D-04 | **Resolved for approved MVP rules 2026-08-08:** tenant-admin academic reach, teacher subject collaboration/access, student published-content/own-submission access, and explicit system-admin support boundaries are recorded in [roles and authorization](../architecture/roles-and-authorization.md) | Defines tenant-admin reach, teacher roster visibility, and support access | Product + security | Resolved for approved rules; endpoint detail remains implementation work |
| D-05 | Academic source-of-truth by field | Prevents sync from overwriting manual changes | EduPay integration owner | Phase 2 |
| D-06 | Sync mode, frequency, and conflict/reconciliation flow | Determines worker, idempotency, and operational design | EduPay integration owner | Phase 2/5 |
| D-07 | Course/subject terminology and lifecycle states | Prevents incompatible UI and schema assumptions | Product + school pilot | Phase 2 |
| D-08 | Submission model: revisions versus independent attempts | Directly affects data model, UX, review history, and notifications | Product + teaching lead | Phase 4 |
| D-09 | Submission draft, replacement, and post-review rules | Defines file mutability and user expectations | Product + teaching lead | Phase 4 |
| D-10 | Deadline timezone and change policy | Determines late flags and edge-case correctness | Product + school pilot | Phase 4 |
| D-11 | Malware scanning, retention, deletion/legal hold, export, and cleanup durations. Initial size/type/quota policy is resolved by ADR-0005. | Security, cost, and compliance impact | Security + operations | Phase 4/6 |
| D-12 | Queue/worker technology and delivery retry policy | Enables reliable notifications/sync without coupling requests | Platform + operations | Phase 5 |
| D-13 | Notification event catalog, preferences, and email copy | Defines user-visible behavior and Resend configuration | Product + communications | Phase 5 |
| D-14 | API contract style details and shared schema strategy | Affects monorepo packages and frontend/backend coupling | Engineering | Phase 1 |
| D-15 | Production hosting, region, backups, RTO/RPO, and support | Determines operating cost and release readiness | Platform + operations | Phase 6 |
| D-16 | Colegio Conquistadores brand assets, localization, and theme-admin scope | Affects design tokens and first-pilot UX | Product + design + tenant | Phase 3 |
| D-17 | Audit retention, field-level change history, and support access | Affects storage, privacy, and incident response | Security + operations | Phase 1/6 |
| D-18 | MVP success targets and pilot cohort | Determines rollout and product validation | Product + tenant | Phase 0/6 |

## Reconciliation decisions now fixed

- There is one stable opaque ecosystem tenant ID. Identity `TenantRealm`, Académico `Tenant`, and future services keep separate records/references but use that same value in integration contracts and Identity token claim `tenant_id`; no shared tables or foreign keys exist.
- Identity owns authentication, credentials, sessions, refresh tokens, memberships, and roles. Académico validates the Identity JWT, owns academic authorization, and stores no credentials or refresh tokens.
- Identity access JWTs have a maximum lifetime of 10 minutes. Refresh tokens rotate; refresh-token reuse revokes the session/token family. High-risk actions may perform an online Identity status check.
- Existing EduPay administrative authentication remains a separate trust domain. User impersonation is out of scope for the MVP.

These resolutions do not close D-08 or D-09. Submission revision, replacement, draft, and post-review behavior remains a later-phase product/teaching decision.

## Decision protocol

For each item:

1. assign an owner and reviewers;
2. record options and consequences in an ADR;
3. mark accepted, superseded, or rejected;
4. update affected docs and acceptance tests;
5. communicate any changed user-visible behavior before implementation.

If an item is not required for the current phase, keep it explicitly unresolved and implement only the documented seam.

## Resolved storage decisions

On 2026-08-08, [ADR-0005](../decisions/ADR-0005-private-object-storage-abstraction.md) accepted the private storage abstraction, 25 MB file limit, allowed type-validation policy, independent 20 GB global and Colegio Conquistadores quotas, physical safety guard requirement, immutable originals, tenant-local SHA-256 deduplication, accounted usage with reconciliation, quota visibility, and full-state behavior. The remaining D-11 items above were not decided.
