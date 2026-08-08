# Notifications

Status: proposed application notification layer

## Design goal

Domain behavior should emit notification intents without knowing whether delivery is in-app, email, or a future channel. Resend is an infrastructure adapter, not a domain dependency.

Identity email delivery is a separate ownership boundary: EduPay Identity owns invitation, activation, password-recovery, and authentication email state through its durable outbox and Resend adapter. Académico must not send, retry, or persist Identity email secrets. Any Académico email adapter handles only academic notification intents and has its own contract and audit ownership.

## Candidate flow

```mermaid
flowchart LR
    Domain[Academic domain event]
    Outbox[Notification intent/outbox]
    Dispatcher[Notification dispatcher]
    InApp[In-app notification store]
    AcademicResend[Académico Resend adapter]
    Mail[Email provider]
    Domain --> Outbox
    Outbox --> Dispatcher
    Dispatcher --> InApp
    Dispatcher --> AcademicResend
    AcademicResend --> Mail
```

## MVP notification candidates

- A new assignment or assessment is published to an assigned student.
- A deadline is approaching, if reminder timing is approved.
- A submission is received by the assigned teacher.
- A submission is reviewed.
- Changes are requested.
- A resubmission is received.
- An Identity invitation or activation event may be consumed as a bounded integration signal for an Académico in-app/status notification; Identity remains the owner of the email and secret.

The final event catalog, recipients, email copy, and reminder timing are unresolved.

## Reliability rules

- The domain transaction records the intent; delivery failure must not roll back the academic action.
- Delivery is idempotent by event/recipient/channel/template key.
- Retries use bounded backoff and expose a terminal failure state.
- In-app notifications are tenant-scoped and unread/read state is per recipient.
- Email delivery uses a Resend adapter with provider response IDs and sanitized error details.
- Provider webhooks, if used, are authenticated and mapped to the correct tenant/event without trusting arbitrary tenant input.

## Preferences and privacy

Per-user channel preferences are a likely follow-on. Until decided, the system should have a clear default and a supportable opt-out path for non-essential email. Notification content must minimize student data and avoid embedding sensitive file content.

## Unresolved decisions

- Queue/worker implementation and operational ownership.
- Whether notification preferences are required for MVP.
- Email sender domains and tenant-specific sender/reply-to behavior.
- Whether all in-app notifications are retained indefinitely or expire.
