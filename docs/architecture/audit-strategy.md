# Audit strategy

Status: proposed audit model

## Two audit streams

1. **Identity audit**: authentication, credential, session, membership, invitation, role, and token events owned by EduPay Identity.
2. **Academic audit**: tenant configuration, academic structure, learning content, submissions, reviews, file access, notifications, and integration operations owned by EduPay Académico.

The services may correlate events, but neither should duplicate ownership of the other’s audit source of truth.

## Academic audit event shape

Each event should include, as available:

- event ID and timestamp;
- tenant ID;
- actor identity and actor type;
- action and result;
- resource type and internal ID;
- affected subject/course context;
- request/correlation ID;
- source (API, worker, integration, support action);
- safe summary of changed fields;
- reason or support ticket for elevated actions.

Do not record credentials, refresh tokens, file contents, or unnecessary student personal data.

## Events to audit

- tenant settings/theme changes;
- academic record create/update/deactivate;
- enrollment and teacher assignment changes;
- learning item draft/publish/archive actions;
- attachment upload, replacement, download, and deletion decisions where required;
- submission create/submit/resubmit;
- review and request-changes actions;
- notification preference or delivery changes;
- sync runs, record mappings, conflicts, and failures;
- system-admin cross-tenant or impersonation-like support actions.

## Integrity and access

- Audit records are append-only from application behavior.
- Audit reads are tenant-scoped; platform support reads require explicit elevation.
- Audit events should be queryable by correlation ID for incident investigation.
- If tamper-evidence, external retention, or WORM storage is required, that belongs in the deployment/security decision.

## Unresolved decisions

- Retention duration and deletion/legal-hold policy.
- Whether before/after field values are stored for all mutations or only selected fields.
- Whether file downloads are audited individually or through aggregate access events.
- Whether Identity and Academic audit events are searchable in one support surface.
