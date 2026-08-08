# ADR-0009: Identity contract reconciliation

Status: Accepted
Date: 2026-08-08
Decision authority: owner-approved Identity decisions supplied for the final documentation reconciliation

## Context

Académico’s baseline separated academic ownership from authentication but left the active tenant context, identifier semantics, Identity protocol, session behavior, and several MVP role boundaries unresolved. The companion EduPay Identity repository documents the target architecture and API contracts. This ADR records the approved cross-repository contract for Académico without modifying the Identity repository.

## Decision

### Canonical tenant identity

The ecosystem has one stable opaque tenant identifier. The same logical value is used by Identity `TenantRealm`, the Académico `Tenant` record, and future ecosystem services. Each service stores its own tenant record/reference and database. Services do not share tables or foreign keys. The canonical value is used in integration contracts and the Identity JWT claim `tenant_id`.

In Académico, `tenantId` means the canonical ecosystem tenant ID. A client-provided value is never authorization context.

### Identity token and membership context

- Identity issues an asymmetric-signed access JWT with a maximum lifetime of 10 minutes.
- A tenant-scoped token contains the active canonical `tenant_id`, `membership_id`, stable user `sub`, session `sid`, effective `roles`, and the validated standard time/audience claims.
- Switching membership/tenant is performed by Identity. It verifies ownership and active status, then issues a new access token.
- Académico validates the token through Identity JWKS and applies its own tenant/resource authorization.
- A `SYSTEM_ADMIN` token without an explicit elevated support context grants no tenant data access.
- High-risk Académico operations may perform an online Identity session/membership status check.

Refresh tokens remain wholly owned by Identity. They rotate on use, and reuse revokes the session and token family. Académico never stores credentials, password hashes, refresh tokens, or Identity secrets.

### Identifiers and academic linking

- Institutional usernames are unique within a tenant realm after safe normalization.
- One verified email maps to one IdentityUser globally.
- EduPay Académico explicitly initiates Student/Teacher ↔ IdentityUser linking through a restricted Identity service contract and owns the academic link mutation and audit event.
- Linking is exact, authorized, tenant-scoped, and auditable. Name-only matching and automatic linking from an unverified email are prohibited.

### Integration protocol and coexistence

- The service boundary uses versioned REST/JSON under `/api/v1`, JWKS for JWT validation, opaque IDs, stable error envelopes, and versioned events from Identity’s durable outbox.
- The Académico adapter may use Identity’s restricted identity-user resolve endpoint for deliberate linking and session/membership status endpoint for high-risk checks.
- Identity owns authentication email delivery through its durable outbox and Resend adapter; Académico notification behavior remains separate.
- The existing EduPay administrative authentication remains a separate trust domain initially. No cookie, password-hash, migration, or federation bridge is assumed.
- Académico API JSON uses camelCase; Identity JWT claims retain the Identity names such as `tenant_id` and `membership_id`.

### Approved MVP authorization boundary

- `TENANT_ADMIN` may administer academic years, courses, students, teachers, the Subject catalog, CourseSubjects, enrollments, and assignments within the tenant, and may view submissions across the tenant for academic/operational oversight. It does not gain access to Identity credentials, password hashes, refresh tokens, or secrets.
- `TEACHER` may see students enrolled in assigned CourseSubjects, manage learning content only in assigned CourseSubjects, collaborate with all other teachers assigned to the same CourseSubject, publish content, and review submissions for assigned CourseSubjects.
- `STUDENT` may access only published content reachable through a valid active course enrollment whose CourseSubject is a default or through a direct StudentSubjectEnrollment, and only their own submission data, except where a future feature explicitly requires otherwise.
- `SYSTEM_ADMIN` has no automatic tenant data access. Tenant access requires an explicit audited elevated support context. User impersonation is out of scope for the MVP.

## Consequences

- Phase 1 can implement a narrow Identity adapter and tenant guardrail against a stable contract.
- Token claims provide request context but do not replace current academic resource policies.
- Cross-repository contract tests must cover canonical tenant mapping, JWT validation, membership switching, staleness/revocation, refresh reuse, linking, and cross-tenant rejection.
- Identity and Académico audit streams remain separately owned and may correlate through `sub`, `sid`, membership ID, and request/correlation IDs.

## Intentionally not decided

This ADR does not decide submission revision/replacement semantics, draft behavior, post-review resubmission, deadline timezone policy, synchronization source-of-truth rules, notification preferences, hosting, or other later-phase decisions in the decision register. Student submission originals remain immutable under accepted storage ADR-0005 unless a later accepted ADR changes that policy.

## Related documents

- [Identity model](../architecture/identity-model.md)
- [Multitenancy](../architecture/multitenancy.md)
- [Roles and authorization](../architecture/roles-and-authorization.md)
- [API conventions](../architecture/api-conventions.md)
- [Unresolved decisions](../governance/unresolved-decisions.md)
