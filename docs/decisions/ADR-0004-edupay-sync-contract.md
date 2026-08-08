# ADR-0004: explicit EduPay synchronization contract

Status: Proposed; no direct table sharing is permitted  
Date: 2026-08-08

## Context

Students and courses may be synchronized from current EduPay data, but manual creation must remain possible. The source API and field ownership are not yet specified.

## Candidate decision

Use explicit, versioned integration contracts and store source-system/external-ID references in the academic database. Synchronization is idempotent and eventually consistent, with field ownership, conflict handling, inactive-not-delete behavior, and observable run status. Manual records are valid when no source record exists.

## Rationale

- Avoids persistence coupling.
- Makes sync failure recoverable.
- Preserves local domain behavior and future sources.

## Consequences

- Requires a contract owner and reconciliation tooling.
- Requires duplicate/mapping and tenant mapping rules.
- Initial implementation may need provider fakes until EduPay API access is ready.

## Open items before acceptance

- Pull/push/reconciliation mode and cadence.
- Source-of-truth field matrix.
- Authentication and callback verification.
