# ADR-0019: audit retention and support policy

Status: Accepted; resolves D-17 for the controlled pilot

Date: 2026-08-10

Decision authority: Security and operations owner approval

## Context

The pilot needs a clear distinction between durable audit evidence and ordinary
operational logs. It also needs a bounded support-access rule that preserves the
existing tenant and Identity security boundaries. This policy does not decide
statutory retention, legal hold, deletion, export, or malware scanning.

## Decision

### Security and domain audit

Application security and business audit records are retained for at least 12
months during the pilot. This includes, where applicable:

- Identity authentication and security audit;
- membership and role lifecycle;
- Academic sensitive-change audit;
- Identity linking;
- support-context activity;
- submission and review audit; and
- operational security events intended as durable audit evidence.

Audit records remain the durable evidence source for those events. Ordinary
infrastructure/application logs are not business audit and must not be the only
record of a security or business action. Existing event ownership stays with
Identity or Académico; this ADR does not create a shared audit database.

### Operational logs

The default operational-log retention target is a maximum of 90 days, unless
an operator or backend intentionally configures a shorter period. Longer
retention requires an explicit owner decision. Log retention does not replace
the 12-month audit-record requirement.

### Support access

- `SYSTEM_ADMIN` has no automatic tenant access.
- User impersonation is out of scope for the MVP.
- Tenant support access must use the already accepted explicit audited
  support-context mechanism if and when that mechanism is enabled.
- Every support-context start, end, and sensitive action must be auditable.
- A support context is bounded to one tenant.
- Support context must never expose Identity credentials, refresh tokens, or
  passwords.

## Consequences

The pilot release evidence must identify the durable audit destinations and the
operator-log retention setting. Existing structured correlation fields remain
required, but a transient application log stream cannot be presented as the
12-month audit store. If future contractual or legal requirements require
longer retention, tenant policy can supersede this baseline.

This is an operational product policy, not a statement of statutory or legal
retention sufficiency.

## Scope boundaries

D-11 is resolved for the controlled pilot by
[ADR-0018](ADR-0018-file-security-retention-and-malware-policy.md). Permanent
retention/deletion, legal hold, export, and future scanner-policy behavior
remain subject to later review. D-15 remains open for final provider,
backup destination, RTO/RPO, and support acceptance.
