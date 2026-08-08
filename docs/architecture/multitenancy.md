# Multitenancy rules

Status: mandatory security architecture; canonical Identity tenant context reconciled

Tenant isolation is a non-negotiable property. The application must be designed so a client cannot select an arbitrary tenant by changing a request parameter.

## Canonical tenant identifier

The ecosystem has one stable opaque tenant identifier. Identity `TenantRealm`, the Académico `Tenant` record, and future ecosystem services each store their own record/reference, but all use the same canonical value in integration contracts. These records live in separate databases and are not connected by shared tables or foreign keys.

Within Académico, `tenantId` denotes that canonical ecosystem tenant ID. A local database primary key may exist for implementation purposes, but it is not an integration identifier and must not replace the canonical value in tokens, events, or service contracts.

The Identity JWT claim `tenant_id` contains the canonical value for the active membership context. A client-provided `tenantId` is a selector at most; it never grants or changes authorization.

## Tenant context

1. Authenticate the request through EduPay Identity and validate the access JWT through the Identity JWKS contract.
2. Require the Identity-issued active `tenant_id` and `membership_id` for tenant-scoped work. `tenant_id` is the canonical ecosystem tenant ID.
3. Establish a trusted request-scoped tenant context from those validated claims. A `SYSTEM_ADMIN` without an explicit elevated support context has no tenant data context.
4. Authorize the requested resource inside that context using Académico’s role and resource policies.
5. Execute tenant-scoped queries and storage operations.

Switching membership/tenant context is performed by Identity. The client requests an owned, active membership, and Identity issues a new access token. Académico never switches context from a request body, URL, query string, header, hidden form field, or UI state.

If a client-supplied `tenantId` conflicts with the trusted context, reject the request or ignore the selector according to the endpoint contract; never use it to widen scope. Missing, malformed, expired, or context-free identity claims fail closed.

## Persistence rules

- Every tenant-owned table includes the canonical `tenantId` or an equivalent immutable tenant-scope reference.
- Repository/query APIs require trusted tenant context for tenant-owned reads and writes.
- Foreign-key relationships between tenant-owned records must prevent cross-tenant references.
- Unique constraints include `tenantId` unless the value is intentionally global.
- Background jobs carry a server-created tenant context and never infer it from user input.
- Database migrations and administrative scripts must document any cross-tenant operation explicitly.
- Académico stores no foreign key to Identity tables; `identityUserId` and `membershipId` are opaque external references when needed for domain/audit correlation.

## File and cache rules

- Object keys begin with an internal tenant namespace and resource namespace.
- Signed URLs are short-lived and generated only after authorization.
- Cache keys include tenant identity and the relevant resource scope.
- Search indexes, exports, metrics, and logs must retain tenant attribution or be explicitly platform-wide.

## Elevated access

`SYSTEM_ADMIN` may operate across tenants only through an explicit elevated support context that is authorized, reasoned, time-bounded as required, and audited. The MVP does not include user impersonation. A platform role alone never silently inherits tenant access.

## Failure and leakage prevention

- Missing tenant context fails closed.
- A resource lookup must not distinguish “exists in another tenant” from “does not exist” in a way that leaks information.
- Authorization checks happen again for file download and asynchronous work.
- Error responses must not include data from a rejected tenant.

## Required tests

- Same identifiers in two tenants cannot be confused.
- A user with membership in tenant A cannot read, mutate, notify, export, or download tenant B data.
- A user with memberships in A and B can switch only through Identity’s membership-selection flow, which issues a new token.
- A `SYSTEM_ADMIN` without explicit elevated context cannot access tenant data.
- Worker retries preserve the original tenant scope.
- Provider callbacks cannot cause a cross-tenant write.
