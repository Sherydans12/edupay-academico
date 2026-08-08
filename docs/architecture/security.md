# Security architecture

Status: mandatory controls plus proposed operational baseline

## Security objectives

- Prevent cross-tenant data, file, notification, and integration access.
- Protect credentials and sessions through EduPay Identity.
- Preserve student work and teacher feedback against accidental or unauthorized mutation.
- Minimize sensitive data held by EduPay Académico.
- Make high-risk actions attributable and reviewable.

## Control areas

### Authentication and sessions

- Validate Identity JWT signature through JWKS, issuer, audience, expiry, not-before, acceptable clock skew, and required active-context claims (`sub`, `sid`, `tenant_id`, `membership_id`, and `roles`).
- Treat `tenant_id` as the canonical ecosystem tenant ID, not a client-selected or local database identifier.
- Enforce the Identity access-token maximum lifetime of 10 minutes. Role and membership changes may leave an already-issued token valid only within that bounded lifetime.
- Keep refresh-token ownership, rotation, reuse detection, token-family revocation, and logout behavior in Identity. Académico never stores refresh tokens.
- Perform an online Identity session/membership status check for high-risk operations when current status is required.
- Use secure transport and secure cookie/token handling as approved by the Identity threat model.

### Authorization and tenancy

- Resolve tenant from trusted membership/session context.
- A client-provided `tenantId` is never authorization context; reject or ignore it if it conflicts with the validated Identity context.
- Enforce tenant scope in API, database access, storage, background jobs, exports, and notifications.
- Apply resource policies for CourseSubjectTeacher assignment, enrollment, publication state, and submission ownership.
- Fail closed on missing or stale context where the risk is material.

`SYSTEM_ADMIN` has no automatic tenant access. Tenant access requires an explicit, audited elevated support context; user impersonation is out of scope for the MVP.

### Input and content

- Validate all request payloads, identifiers, enum values, and file metadata.
- Sanitize or safely render user-provided rich text/markup.
- Limit file types, sizes, and counts.
- Protect against injection, SSRF through external links/providers, path traversal, and untrusted redirect targets.

### Secrets and providers

- Keep database, storage, Resend, Identity, and EduPay credentials in a managed secret mechanism.
- Never store secrets in source control, logs, client bundles, or tenant configuration.
- Rotate provider credentials and document ownership.

### Abuse and availability

- Rate-limit authentication-adjacent operations, uploads, invitation endpoints, and expensive queries.
- Use bounded pagination and upload limits.
- Apply retry budgets and circuit-breaker behavior for external providers.
- Protect sync and support operations behind role checks and audit.

### Privacy and data lifecycle

- Store only data needed for the MVP.
- Avoid grades, financial data, or credentials in the academic service.
- Define retention, deletion, export, and incident response rules before production launch.
- Minimize sensitive student data in email and logs.

## Threat-model checkpoints

Before pilot, review at least:

- token theft and session fixation;
- tenant-ID tampering and cross-tenant references;
- ID enumeration and resource existence leaks;
- malicious file upload and signed URL abuse;
- unauthorized teacher/student linking;
- refresh-token replay and session/membership revocation staleness;
- replayed integration callbacks;
- notification spoofing and email enumeration;
- over-privileged system-admin support actions;
- data loss during migrations, sync, or storage failure.

## Security evidence

Release evidence should include dependency scanning, secret scanning, authorization tests, tenant-isolation tests, file tests, migration review, provider configuration review, and a documented incident/rollback path.
