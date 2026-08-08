# Testing strategy

Status: proposed quality baseline

## Test layers

### Unit tests

Cover pure domain rules and policy decisions:

- enrollment resolution;
- publication visibility;
- deadline and late calculation;
- submission transitions;
- tenant-context requirements;
- role/resource authorization;
- canonical tenant-ID handling and rejection of client-selected tenant context;
- notification recipient selection.

### Integration tests

Use PostgreSQL and provider fakes/contracts to verify:

- tenant-scoped queries and constraints;
- transactions and idempotency;
- file metadata lifecycle;
- outbox/notification persistence;
- sync upserts and conflict behavior;
- migration compatibility.

### Contract tests

Verify the EduPay Identity, existing EduPay integration, object storage abstraction, and Resend adapter contracts. Identity contract tests must cover JWKS signature validation, issuer/audience, the `sub`/`sid`/`tenant_id`/`membership_id`/`roles` claim shape, the 10-minute maximum access-token lifetime, membership switching issuing a new token, online high-risk status checks, and the separation of Identity refresh-token ownership. Provider tests should not require production credentials.

### API and end-to-end tests

Exercise the MVP path as each role, including negative cases:

- student sees assigned content only;
- teacher sees assigned CourseSubjects only;
- late submission is accepted and flagged;
- change request and resubmission work;
- forbidden cross-tenant resource, file, notification, and sync access is rejected.
- a client-supplied `tenantId` cannot widen or switch trusted context;
- a `SYSTEM_ADMIN` without explicit audited elevation cannot access tenant data;
- an explicit Académico-initiated Student/Teacher ↔ IdentityUser link is tenant-scoped, auditable, and cannot match by name-only or unverified email;
- the existing EduPay admin cookie/credential path is not accepted by the Identity integration.

### Frontend and visual tests

- responsive student and teacher flows;
- loading/empty/error/permission states;
- keyboard and screen-reader-oriented checks;
- file upload failure/retry states;
- tenant theme fallback and token application.

## Test data rules

- Fixtures must include at least two tenants with overlapping labels, the same canonical-ID mapping represented in separate service fixtures, and users with one or multiple memberships.
- Never use real student data in development or CI.
- Include records with inactive enrollment, draft content, late work, correction requests, and missing provider delivery.

## Release gates

- lint/type/build checks;
- migration and rollback review;
- unit/integration/contract/e2e suite appropriate to the changed boundary;
- tenant-isolation and authorization tests;
- accessibility and responsive smoke checks;
- security and dependency checks;
- operational health and rollback verification.

Coverage percentage is not a sufficient gate; behavior risk and boundary evidence matter more.
