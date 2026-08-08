# ADR-0003: Identity ownership and optional academic links

Status: Proposed; ownership split is mandated; Identity linking contract reconciled by ADR-0009
Date: 2026-08-08

## Context

Centralized identity is being introduced without moving the existing EduPay admin login immediately. Academic records have domain-specific lifecycles and must not become credential records.

## Candidate decision

EduPay Identity owns users, credentials, sessions, refresh tokens, memberships, roles, invitations, and authentication audit. EduPay Académico owns student and teacher records and may store an optional stable reference to an Identity user. Linking/unlinking is explicit and audited; academic history survives identity changes.

## Rationale

- Separates authentication from academic meaning.
- Supports records before invitations and manual setup.
- Leaves room for guardians and other future roles without changing academic ownership.

## Consequences

- Duplicate/merge/link conflict policy is required.
- Services need a stable identity reference contract.
- Existing admin login remains a separate compatibility concern.

## Open items before acceptance

- Any merge/unlink behavior beyond the approved exact-link operation.

Verified-email uniqueness, normalized tenant-realm username uniqueness, explicit Académico-initiated linking, restricted Identity lookup, and separate existing-admin coexistence are resolved for the current implementation boundary by [ADR-0009](ADR-0009-identity-contract-reconciliation.md). No automatic name-only or unverified-email linking may be added.
