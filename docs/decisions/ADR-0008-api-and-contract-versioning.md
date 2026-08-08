# ADR-0008: versioned API and contract strategy

Status: Proposed  
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

## Open items before acceptance

- JSON naming, pagination shape, schema source of truth, generated clients, and idempotency-key policy.
