# ADR-0003: Identity ownership and optional academic links

Status: Proposed; ownership split is mandated  
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

- Email uniqueness and identity matching.
- Which service initiates link operations.
- Existing-admin recognition and future migration plan.
