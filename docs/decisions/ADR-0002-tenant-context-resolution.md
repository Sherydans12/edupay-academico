# ADR-0002: trusted tenant-context resolution

Status: Proposed; tenant isolation requirement is mandatory; Identity context reconciled by ADR-0009
Date: 2026-08-08

## Context

Client-supplied tenant IDs are mutable and cannot be used as authorization context. Users may eventually belong to multiple tenants.

## Candidate decision

Resolve the effective tenant from authenticated Identity membership/session context, establish a request-scoped tenant context, and require every tenant-owned read/write/job/storage operation to use it. A client tenant selector may request a context change only through an approved membership-selection flow.

## Rationale

This makes the authorization boundary server-owned and testable across API, database, workers, files, caches, and notifications.

## Consequences

- Every request needs a defined context when tenant-owned data is involved.
- Multi-tenant users need a tenant-switching/session strategy.
- System-admin support actions need explicit elevation and audit.

## Open items before acceptance

- Database-level defense-in-depth policy, if any.

The token claim, membership-switch endpoint, 10-minute staleness ceiling, and high-risk online status checks are resolved for Académico by [ADR-0009](ADR-0009-identity-contract-reconciliation.md). This ADR remains proposed for any remaining persistence implementation details.
