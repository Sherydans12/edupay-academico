# Roles and authorization

Status: proposed MVP policy; resource-level details require owner approval

Authorization is defense in depth:

1. authenticate the user;
2. establish tenant membership context;
3. check role capability;
4. check resource relationship and lifecycle state;
5. apply action-specific constraints.

## Proposed capability matrix

| Capability | System admin | Tenant admin | Teacher | Student |
| --- | ---: | ---: | ---: | ---: |
| Manage platform tenants | Yes, audited | No | No | No |
| Manage tenant memberships/invitations | Explicit support path | Yes | No | No |
| Manage academic years/courses | Support path | Yes | No | No |
| Manage student/teacher records | Support path | Yes | Limited view | Self only where applicable |
| Manage subjects and enrollments | Support path | Yes | Assignment-limited proposal | Read assigned only |
| Create/edit learning content | Support path | Tenant policy | Yes, assigned subjects | No |
| Publish/retire learning content | Support path | Tenant policy | Yes, assigned subjects | No |
| View assigned learning content | Support path | Tenant policy | Yes | Yes |
| Submit work | No | No | No | Own submissions |
| Review submissions | Support path | Tenant policy | Assigned subjects | No |
| Request changes | Support path | Tenant policy | Assigned subjects | No |
| Manage tenant theme/settings | Yes | Yes | No | No |
| View audit events | Platform scope | Tenant scope | Own relevant actions | Own relevant actions |

“Support path” means a system administrator uses an explicit, audited elevated context; it does not mean every request automatically crosses tenants.

## Resource policies

- A teacher may act only on subjects to which the teacher is assigned and only within the tenant context.
- A student may read only published content available through course enrollment or direct subject enrollment.
- A student may create/read/update only their own draft or submitted work according to the submission policy.
- Tenant administrators may administer tenant academic structure but should not gain access to credentials or refresh tokens.
- Draft learning content is invisible to students unless a future preview policy explicitly says otherwise.

## Policy questions to resolve

- Whether tenant administrators can review all submissions or only administer structure.
- Whether a teacher sees all enrolled students in an assigned subject or only a selected roster.
- Whether teachers can co-edit content or whether one owner controls publication.
- Whether students can delete or replace files after submission.
- Whether `SYSTEM_ADMIN` can impersonate a user, and what approval/audit is required.

## Enforcement requirements

- Centralize policy evaluation enough to prevent controller-by-controller drift.
- Never rely on hidden UI controls for authorization.
- Return consistent forbidden/not-found behavior that avoids cross-tenant enumeration.
- Add positive and negative tests for every matrix cell that is implemented.
