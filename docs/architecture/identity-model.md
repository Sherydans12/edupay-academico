# Identity model

Status: reconciled cross-repository contract; Identity ownership and security properties are authoritative

## Canonical tenant identity

The ecosystem has one stable opaque tenant identifier. The same logical value is used by:

- the Identity `TenantRealm`;
- the EduPay Académico `Tenant` record;
- future ecosystem services.

Each service stores its own tenant record or reference in its own database. Services do not share tables or foreign keys. The canonical identifier is used in integration contracts and in the Identity access-token claim `tenant_id`; a service-local database key, if one exists, is never substituted into those contracts.

In Académico, `tenantId` means the canonical ecosystem tenant identifier. It is a tenant selector at most when supplied by a client and is never authorization evidence. The trusted request context comes from a validated Identity token or an approved high-risk Identity status check.

### Terminology mapping

| Identity term | Académico meaning and boundary |
| --- | --- |
| `TenantRealm` | Identity’s minimal login/membership reference. It is not the Académico tenant aggregate, although both use the same canonical ecosystem tenant ID. |
| `TenantMembership` | Identity access relationship for one user and tenant. It is not a course enrollment or subject enrollment. |
| Identity `roles` | Membership-scoped authentication capabilities. Académico still evaluates academic relationships and resource policy. |
| `IdentityUser` / `sub` | The person/account reference used for an optional Student/Teacher link. It is not a Student or Teacher record. |
| `membership_id` | Identity membership context and audit/correlation reference. It is not an academic-record foreign key. |

## Ownership

EduPay Identity owns:

- users;
- credentials;
- sessions;
- refresh tokens;
- tenant memberships;
- roles;
- invitations and activation challenges;
- authentication and membership auditing;
- the minimal `TenantRealm` reference needed for Identity login and membership management.

EduPay Identity does not own students, teachers, courses, subjects, learning content, submissions, payments, grades, or tenant academic configuration. EduPay Académico owns its academic `Tenant` record/configuration and may store an optional stable `identityUserId` reference on a Student or Teacher record.

The services must never share database tables, database credentials, or foreign keys. Académico never stores Identity credentials, password hashes, refresh tokens, invitation secrets, or other authentication secrets.

## User and academic-record separation

An Identity user is a person who can authenticate. A student or teacher record describes how that person participates in the academic domain for a tenant and academic period. The records have different lifecycles:

- a student record may exist before an account is invited;
- a teacher may be linked to an existing user or remain unlinked during setup;
- unlinking access must not delete academic history;
- deleting or disabling a user must not silently delete submissions or academic records.

Académico stores only the stable Identity user reference needed for its domain behavior. Identity does not infer that a user is a student or teacher from an academic record.

## Membership and roles

- Membership is tenant-scoped and is the Identity authorization unit.
- `TENANT_ADMIN`, `TEACHER`, and `STUDENT` roles are evaluated within the active tenant membership.
- `SYSTEM_ADMIN` is platform-scoped and has no automatic tenant context.
- A user may belong to multiple tenants and may have different roles in each.
- An inactive, suspended, or revoked membership cannot be selected as an active token context.
- Role and membership changes are audited and revoke affected sessions; already-issued access tokens remain bounded by the 10-minute maximum lifetime unless a high-risk action performs an online check.

## Authentication and token boundary

Identity issues an asymmetric-signed access JWT with a maximum lifetime of 10 minutes. Académico validates the signature using Identity JWKS and validates `iss`, `aud`, `exp`, `nbf`, acceptable clock skew, and the required claim shape before creating request context.

The Identity claim names are part of the integration contract. JSON API fields remain camelCase, but JWT claims use the Identity names below:

| JWT claim | Meaning in Académico |
| --- | --- |
| `sub` | Stable Identity user ID; the only Identity-user reference Académico stores. |
| `sid` | Revocable Identity session ID for correlation and high-risk status checks. |
| `iss`, `aud`, `iat`, `nbf`, `exp`, `jti` | Token validation and audit inputs. `exp - iat` must not exceed 600 seconds. |
| `tenant_id` | Canonical ecosystem tenant ID for the active membership context. |
| `membership_id` | Identity membership ID for the active context; not an Académico academic-record foreign key. |
| `roles` | Roles effective for the selected membership at issuance time; not a substitute for academic resource authorization. |
| `scope` | Audience/application scope; never interpreted as a tenant role. |
| `auth_time` | Authentication time for recent-authentication or step-up policies. |

Tenant-scoped requests require `tenant_id` and `membership_id` from a valid active context. A `SYSTEM_ADMIN` token without an active context does not authorize tenant data access. Académico must apply its own role, relationship, lifecycle, publication, enrollment, subject-assignment, and submission-ownership policies after token validation.

Refresh tokens, token-family state, and session revocation remain wholly owned by Identity. Refresh tokens rotate on every use; reuse revokes the session and token family. Académico does not store or process refresh tokens. Normal request validation does not require an Identity round trip, while high-risk operations may call the restricted session/membership status endpoint.

Switching membership/tenant context is an Identity operation. The client requests a membership selection; Identity verifies that it belongs to the user and is active, updates the session context, and issues a new access token. A client-provided tenant ID or membership ID never grants context.

The existing EduPay administrative login is a separate trust domain initially. Identity does not validate its cookies, import its password hashes, or silently federate it. Académico accepts the new Identity contract only for the new Identity path.

## Explicit academic linking

EduPay Académico explicitly initiates Student/Teacher ↔ IdentityUser linking through the restricted Identity service contract. Académico owns the optional link mutation and its academic audit event; Identity returns only minimum necessary lookup data and may record its own service/audit event.

Linking must use an exact, authorized, auditable operation. Name-only matching and automatic linking from an unverified email are prohibited. One verified email maps to one Identity user globally. Institutional usernames are unique within a tenant realm after safe normalization. Linking or unlinking must not delete academic history and must reject a cross-tenant target.

## Invitations and activation

Identity owns email invitations, no-email activation challenges, password recovery, and delivery through its durable outbox and Resend adapter. Académico may initiate an authorized membership workflow through the Identity contract, but it never receives or stores a password, refresh token, invitation secret, or activation secret as durable academic data.

See [API conventions](api-conventions.md), [multitenancy](multitenancy.md), and [roles and authorization](roles-and-authorization.md) for the consuming-service enforcement rules.
