# ADR-0007: notification abstraction and outbox

Status: Proposed; MVP details accepted by [ADR-0014](ADR-0014-academic-notifications-and-delivery.md)
Date: 2026-08-08

## Context

The MVP needs in-app and academic Resend email notifications. Academic actions must not fail merely because an email provider is unavailable. EduPay Identity separately owns authentication email, its durable outbox, and its Resend adapter.

## Candidate decision

Record Académico notification intents transactionally with the domain action, then dispatch them asynchronously through channel adapters. Store in-app notifications as tenant-scoped recipient records and use an Académico-owned Resend adapter only for academic email. Delivery is idempotent, retryable, observable, and independently fail-able. Identity invitation, activation, and recovery emails remain outside this outbox.

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
