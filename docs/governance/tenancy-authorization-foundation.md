# Tenancy and authorization foundation implementation note

Status: implemented on `feat/tenancy-authorization`

Date: 2026-08-08

This note records the Phase 1 implementation of the accepted EduPay Identity
consumer and Académico tenant-authorization boundary. It does not add academic
entities or decide any unresolved product, support-elevation, queue, or
persistence choice.

## Request pipeline

Tenant endpoints use this ordered global NestJS guard pipeline:

1. `IdentityAuthenticationGuard` extracts a single bearer token and delegates
   to the JWKS verifier.
2. `JwksIdentityAccessTokenVerifier` verifies an explicitly configured
   asymmetric algorithm against the configured remote Identity JWKS, issuer,
   audience, `exp`, `nbf`, and bounded clock tolerance. It validates the
   complete claim shape and enforces `exp - iat <= 600` seconds.
3. The verifier creates a frozen `TrustedIdentityPrincipal`. No URL, header,
   query, body, cookie, or form value can create this object.
4. `TenantContextGuard` creates a frozen `TrustedTenantContext` only from the
   validated active `tenant_id` and `membership_id` plus a tenant membership
   role. Missing context fails closed.
5. The tenant guard recursively compares any `tenantId`/`tenant_id` or
   `membershipId`/`membership_id` selector in route parameters, query values,
   request bodies, or recognized headers with the trusted context. A conflict
   is forbidden; a matching value remains only a resource selector.
6. `AuthorizationGuard` requires centrally declared capabilities. The
   `AuthorizationService` first revalidates principal/context identity and
   tenant equality, then applies role capabilities and future resource policy.
7. Routes explicitly marked high-risk additionally call the current Identity
   session/membership adapter and require exact user, session, tenant, and
   membership agreement before the controller runs.

Health is explicitly public. Other routes authenticate by default. Tenant and
capability requirements are explicit decorators and are enforced by the global
guards rather than by controller-local role comparisons.

## Identity JWT validation

The API validates these standard and contract claims: `iss`, `aud`, `sub`,
`sid`, `jti`, `iat`, `nbf`, `exp`, `tenant_id`, `membership_id`, and `roles`.
Tenant and membership claims are optional only as a pair so Identity can issue
an authenticated token with no selected tenant context; such a token cannot
reach a tenant endpoint. Roles are restricted to the approved MVP codes and
cannot be empty or duplicated.

The following settings are startup-validated:

- `IDENTITY_ISSUER`
- `IDENTITY_AUDIENCE`
- `IDENTITY_JWKS_URI`
- `IDENTITY_JWT_ALGORITHMS`
- `IDENTITY_CLOCK_SKEW_SECONDS`
- `IDENTITY_JWKS_CACHE_MAX_AGE_MS`
- `IDENTITY_JWKS_COOLDOWN_MS`
- `IDENTITY_JWKS_TIMEOUT_MS`

Production issuer and JWKS URLs require HTTPS. The algorithm allowlist accepts
only asymmetric algorithms; there is no unsigned or shared-secret fallback.
Identity private keys and refresh tokens are not present in Académico.

## Authorization and support behavior

The initial capability map contains only rules that need no academic resource:
tenant access for active `TENANT_ADMIN`, `TEACHER`, or `STUDENT` membership;
tenant academic-structure administration for `TENANT_ADMIN`; and tenant-wide
submission oversight for `TENANT_ADMIN`. Teacher assignment, student
enrollment, publication visibility, and submission ownership remain
`ResourcePolicy` hooks for later domain modules.

Resource policy evaluation always runs after trusted-principal/context matching
and resource tenant equality. An absent, empty, unknown, false, or cross-tenant
policy path denies by default.

`SYSTEM_ADMIN` alone creates no tenant context, even if a client supplies a
tenant selector. `SupportContextPolicy` is a replacement seam, but its current
implementation always returns no context. It must not be enabled until an
accepted decision defines the grant, target binding, reason, duration, allowed
actions, and audit evidence. Impersonation is not implemented.

## Persistence and asynchronous seams

No Prisma model or migration was added because the accepted architecture does
not require a Tenant record in this phase and no academic models are approved
for this change. Future tenant-owned repository methods consume a
`TenantQueryScope`, which can be constructed only from a branded trusted tenant
context. This makes the canonical tenant predicate a required repository input
instead of an optional caller string.

`TrustedTenantJobContext` is the server-created in-process carrier for future
job dispatch. Arbitrary payload objects cannot be treated as trusted job
context. A future persisted queue needs an approved authenticated envelope and
must implement `TenantJobContextDecoder`; no queue provider or payload codec is
invented here.

The restricted online session/membership transport authentication is not fully
specified by the approved Identity contract. The production default status
adapter therefore fails closed. Tests replace it with a deterministic fake.
Ordinary requests never call this adapter.

## Security evidence

The tests use generated RSA keys, a real local JWKS HTTP endpoint, and signed
JWTs. They cover valid validation, bad signature, issuer/audience mismatch,
expiry, clock tolerance, malformed claims, excessive lifetime, tenant-less
context, URL/header/body tenant tampering, membership tampering, cross-tenant
teacher context, `SYSTEM_ADMIN`, centralized/default-deny capabilities,
resource-policy tenant ordering, trusted query/job carriers, and stale/revoked
high-risk Identity status.
