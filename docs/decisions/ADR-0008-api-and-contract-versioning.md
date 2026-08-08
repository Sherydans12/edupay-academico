# ADR-0008: versioned API and contract strategy

Status: Superseded by [ADR-0011](ADR-0011-api-and-shared-contract-strategy.md)
Date: 2026-08-08

## Context

The target backend is NestJS 11 and the frontend is Next.js 16 in a monorepo. Multiple agents and future clients need stable boundaries.

## Candidate decision

Use REST/JSON under `/api/v1`, document it with OpenAPI, use stable opaque IDs and explicit error envelopes, and validate request/response contracts at boundaries. Share or generate schemas only after deciding whether Zod is the source of truth or an OpenAPI contract is the source of truth.

## Rationale

- Familiar browser/API integration model.
- Supports generated clients and contract tests.
- Makes versioning and agent handoffs visible.

## Consequences

- Requires naming, pagination, idempotency, and compatibility conventions.
- Schema duplication risk exists if frontend/backend contracts are hand-maintained.

## Resolution note

D-14 is accepted by [ADR-0011](ADR-0011-api-and-shared-contract-strategy.md),
which fixes the API style, shared Zod 4 contract location, pagination envelope,
hand-written client strategy, and endpoint-specific idempotency baseline.
