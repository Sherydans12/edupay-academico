# Identity internal bridge implementation

Status: implemented high-risk Académico consumer boundary

## Runtime architecture

EduPay Académico uses one server-only HTTP client for the restricted EduPay
Identity verification API. The client owns the configured base URL, service
Bearer token, three-second default timeout, JSON content negotiation, and
`X-Request-Id` propagation. It performs no automatic retries. The session and
academic-link adapters validate their response contracts strictly before any
Identity data reaches application services.

The internal service-authentication contract is:

```http
Authorization: Bearer <EduPay-Academico service token>
Accept: application/json
X-Request-Id: <current Academic request ID>
```

The service token authenticates Académico as a caller. It does not replace the
human actor. Exact-link requests also send the current validated Identity user,
session, membership, and canonical tenant context so Identity can authorize and
audit the `TENANT_ADMIN` action.

## High-risk operations

Only endpoints explicitly decorated for a current Identity check call the
session-status endpoint. Student and Teacher link mutations are high risk and
perform these calls, in order:

1. `GET /internal/v1/sessions/{sessionId}/status`;
2. `POST /internal/v1/identity-users/resolve`.

The current-status service compares the validated response with the already
trusted JWT principal and tenant context. The response cannot create or replace
the local principal. Normal low-risk academic reads and writes continue to use
the bounded access JWT and do not call Identity online.

The exact-link request derives `expectedRole` from the target academic record:
`STUDENT` for Student and `TEACHER` for Teacher. The public Académico request
continues to accept only `identityUserId`; client `tenantId` and role fields are
rejected at the boundary. Académico persists only the verified opaque
`identityUserId`, with no Identity membership foreign key or shared database.

An Identity membership verified as `PENDING_ACTIVATION` may be linked. The link
does not authorize Academic access: a student or teacher still needs an Identity
access token issued for an `ACTIVE` membership before the normal Academic
authentication and resource policies can grant access.

## Configuration and operations

The API requires these server-only values at startup:

```dotenv
IDENTITY_INTERNAL_BASE_URL=http://identity-private-address:3000
IDENTITY_INTERNAL_SERVICE_TOKEN=<managed secret>
IDENTITY_INTERNAL_TIMEOUT_MS=3000
```

Use a private trusted container or service-network address where possible. If
the connection crosses an untrusted network, use HTTPS. Never prefix these
settings with `NEXT_PUBLIC_`, copy the token into the web application, persist it
in the database, include it in fixtures, or log it. Rotate the service token in
coordination with Identity so the producer and consumer change safely.

Timeouts, network errors, non-JSON or malformed responses, and Identity HTTP
authentication/availability errors fail closed with a generic safe error.
Response bodies and the service token are not included in errors or logs.

## Deterministic contract fixture

The executable fake Identity server is
`apps/api/test/support/identity-internal.fixture.ts`. It runs on an ephemeral
loopback port, requires a synthetic service token, captures method/path/headers/
body, and returns deterministic strict contract responses. It has no database,
private JWT key, or external network dependency.

Run its bridge contract suite with:

```sh
pnpm --filter @edupay/api exec vitest run src/identity/identity-internal-http.spec.ts
```

With `TEST_DATABASE_URL` configured, the Academic Structure e2e suite also uses
this HTTP server through the production module providers and proves that an
ordinary Academic request makes no online call:

```sh
pnpm --filter @edupay/api exec vitest run test/academic-domain.e2e-spec.ts
```

## Local cross-service smoke path

Once EduPay Identity contains `feat/internal-academic-integration` and this
repository contains `feat/identity-bridge`:

1. Start each service with its own PostgreSQL database. Apply each repository's
   migrations independently.
2. Generate Identity development signing keys using Identity's documented local
   key command. Académico consumes only Identity's public JWKS URL; never copy
   the private signing key.
3. Generate a base64url-encoded token with at least 32 random bytes outside
   source control. Configure it as `IDENTITY_ACADEMICO_SERVICE_TOKEN` in Identity
   and as `IDENTITY_INTERNAL_SERVICE_TOKEN` in Académico.
4. Set `IDENTITY_INTERNAL_BASE_URL` to the local Identity origin and keep the
   three-second timeout unless deliberately testing failure behavior.
5. Provision synthetic Identity tenant-admin and Student/Teacher memberships
   through Identity APIs. Create the corresponding Académico tenant with the
   same canonical tenant ID in the separate Academic database.
6. Obtain the tenant-admin access token from Identity, then call the Académico
   Student or Teacher `identity-link` endpoint with only `identityUserId`.
7. Activate a pending target membership through Identity and log in as that
   user to verify normal Academic authorization.

This smoke path shares identifiers only through authenticated contracts. It
does not share databases, database credentials, refresh tokens, or private JWT
signing keys.
