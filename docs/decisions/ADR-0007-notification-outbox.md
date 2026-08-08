# ADR-0007: notification abstraction and outbox

Status: Proposed  
Date: 2026-08-08

## Context

The MVP needs in-app and Resend email notifications. Academic actions must not fail merely because an email provider is unavailable.

## Candidate decision

Record notification intents transactionally with the domain action, then dispatch them asynchronously through channel adapters. Store in-app notifications as tenant-scoped recipient records and use a Resend adapter for email. Delivery is idempotent, retryable, observable, and independently fail-able.

## Rationale

- Preserves core academic transaction reliability.
- Keeps channel/provider details out of domain code.
- Provides a path for future channels and preferences.

## Consequences

- Requires a worker/queue or equivalent retry runtime.
- Requires event catalog, recipient rules, templates, and failure monitoring.
- Email copy and tenant sender policy must be approved.

## Open items before acceptance

- Queue/worker technology and provider webhook policy.
- MVP preferences and retention.
