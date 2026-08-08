# ADR-0011: API and shared application contract strategy

Status: Accepted
Date: 2026-08-08
Decision authority: Phase 1 foundation integration approval for D-14

## Context

The monorepo contains a web application, an API, and a contracts package. The
MVP needs a stable transport boundary without coupling frontend code to API
implementation or treating persistence models as public DTOs.

## Decision

- The application API remains REST/JSON under `/api/v1`.
- JSON fields use camelCase. IDs are stable opaque values. Timestamps are ISO 8601 with explicit offset.
- The stable error envelope is the API boundary contract.
- OpenAPI remains the externally inspectable API documentation at the API boundary.
- Shared application request/response contracts belong in `packages/contracts`.
- Shared cross-boundary request/response shapes use Zod 4 schemas in `packages/contracts`; TypeScript types are derived from those schemas rather than manually duplicated.
- The frontend may import `@edupay/contracts` but must never import API implementation files.
- The backend may adapt shared schemas at its HTTP boundary while keeping domain/application models independent from transport DTOs.
- Prisma models are persistence models and are not API contracts.
- The MVP does not require code-generation infrastructure. The initial frontend integration uses a thin hand-written API client.
- Cursor-paginated collections use the conceptual envelope `{ "items": [...], "nextCursor": "opaque-value-or-null" }`. The cursor is opaque to clients and must not expose database IDs or ordering implementation.
- Idempotency is endpoint-specific. Ordinary CRUD does not automatically require `Idempotency-Key`; uploads, submissions, and synchronization may define stronger rules in later accepted decisions.

## Rationale

- Keeps the web/API boundary explicit and reviewable.
- Gives shared validation one source of truth without making domain models transport-shaped.
- Preserves OpenAPI as the external contract and documentation surface without adding code-generation complexity to the MVP.
- Makes pagination and idempotency expectations stable while leaving endpoint-level semantics to their owning decisions.

## Consequences

- New shared web/API shapes require review in `packages/contracts`.
- Contract schemas and inferred types need boundary tests; API implementation and Prisma changes remain independently reviewable.
- Exact cursor encoding and endpoint-specific idempotency rules remain implementation details unless a later decision changes the public contract.

## Related documents

- [API conventions](../architecture/api-conventions.md)
- [Multitenancy](../architecture/multitenancy.md)
- [ADR-0008: versioned API and contract strategy](ADR-0008-api-and-contract-versioning.md)
- [Unresolved decisions](../governance/unresolved-decisions.md)
