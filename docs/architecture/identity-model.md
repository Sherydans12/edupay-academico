# Identity model

Status: mandated ownership boundary; token and linking details partly unresolved

## Ownership

EduPay Identity owns:

- users;
- credentials;
- sessions;
- refresh tokens;
- tenant memberships;
- roles;
- invitations;
- authentication auditing.

EduPay Identity does not own students, teachers, courses, subjects, payments, or grades. EduPay Académico owns academic records and may store an optional reference to an Identity user.

## User and academic-record separation

An Identity user is a person who can authenticate. A student or teacher record describes how that person participates in the academic domain for a tenant and academic period. The records have different lifecycles:

- a student record may exist before an account is invited;
- a teacher may be linked to an existing user or remain unlinked during setup;
- unlinking access must not delete academic history;
- deleting or disabling a user must not silently delete submissions or academic records.

The academic service stores a stable identity reference, never credentials or refresh tokens.

## Membership and roles

- Membership is tenant-scoped.
- `SYSTEM_ADMIN` is platform-wide or otherwise explicitly elevated; the exact claim shape is unresolved.
- `TENANT_ADMIN`, `TEACHER`, and `STUDENT` are evaluated within a tenant membership.
- A user may belong to multiple tenants and may have different roles in each.
- Role changes take effect according to the approved session/token revocation policy.

## Authentication boundary

The application should validate access tokens issued by the approved Identity contract and use refresh/session behavior owned by Identity. The existing EduPay admin login remains unchanged initially; migration or federation is not part of this MVP unless separately approved.

The following token/session data is proposed:

- stable user subject identifier;
- session identifier for revocation and audit correlation;
- issuer and audience;
- expiry and issuance time;
- optional active tenant/membership context, subject to the tenant-switching decision.

The API must still verify membership and resource authorization; token claims are not a substitute for current policy when the decision requires fresh data.

## Invitations and linking

Invitations should be issued by Identity but accepted through the user experience relevant to the tenant. Linking an academic record to an Identity user requires a deliberate, audited operation with a conflict policy for duplicate email or external identifiers.

## Unresolved identity decisions

- Whether tenant context is encoded in access tokens, selected through a dedicated endpoint, or represented by a server-side session.
- Whether email is globally unique in Identity or only unique within a tenant.
- Which service may initiate academic-record-to-user linking.
- How existing EduPay admin users are recognized without changing the current login.
- Session revocation propagation and maximum authorization staleness.
