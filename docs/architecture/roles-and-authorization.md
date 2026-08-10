# Roles and authorization

Status: reconciled MVP policy for approved role boundaries; endpoint details remain implementation work

Authorization is defense in depth:

1. validate the Identity-issued access token;
2. establish the active tenant membership context from `tenant_id` and `membership_id`;
3. check the Identity role capability;
4. check the academic resource relationship and lifecycle state;
5. apply action-specific constraints and audit sensitive actions.

Identity role claims establish the caller’s membership-scoped role. They do not bypass Académico’s tenant, enrollment, assignment, publication, submission, or resource policies.

## Approved MVP capability matrix

| Capability                                                                                                                | `SYSTEM_ADMIN`                                                          | `TENANT_ADMIN`                                                                                                           | `TEACHER`                                                                | `STUDENT`                       |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------- |
| Access tenant data                                                                                                        | No automatic access; explicit audited elevated support context required | Within active tenant membership                                                                                          | Within active tenant membership                                          | Within active tenant membership |
| Administer academic years, courses, students, teachers, the Subject catalog, CourseSubjects, enrollments, and assignments | Only through explicit audited support context                           | Yes, within the tenant                                                                                                   | No, except actions separately granted by an academic relationship policy | No                              |
| Administer assignment records                                                                                             | Only through explicit audited support context                           | Yes, within the tenant                                                                                                   | Yes, only in assigned CourseSubjects                                     | No                              |
| View submissions                                                                                                          | Only through explicit audited support context                           | Yes, across the tenant for academic/operational oversight                                                                | Yes, for CourseSubjects to which the teacher is assigned                 | Own submission data only        |
| See enrolled students                                                                                                     | Only through explicit audited support context                           | Yes, within the tenant                                                                                                   | Students enrolled in CourseSubjects to which the teacher is assigned     | No general roster access        |
| Manage learning content                                                                                                   | Only through explicit audited support context                           | Only where a separately approved tenant academic policy grants it; this reconciliation does not expand content semantics | Yes, only in assigned CourseSubjects                                     | No                              |
| Collaborate on CourseSubject content                                                                                      | Only through explicit audited support context                           | Not inferred by this reconciliation                                                                                      | Yes; all teachers assigned to the same CourseSubject may collaborate     | No                              |
| Publish content and review submissions                                                                                    | Only through explicit audited support context                           | Only where separately approved tenant policy grants it                                                                   | Yes, for assigned CourseSubjects                                         | No                              |
| Access Identity credentials, password hashes, refresh tokens, or secrets                                                  | No                                                                      | No                                                                                                                       | No                                                                       | No                              |
| Impersonate a user                                                                                                        | Out of scope for MVP                                                    | No                                                                                                                       | No                                                                       | No                              |

`TENANT_ADMIN` operations that touch Identity memberships or invitations remain delegated to Identity’s own authorization boundary. Académico may initiate an explicitly authorized workflow, but no role receives Identity credentials, password hashes, refresh tokens, invitation secrets, or activation secrets.

A `TENANT_ADMIN` may link an exact Identity target whose tenant membership is
verified as `PENDING_ACTIVATION` or `ACTIVE` and has the Student/Teacher role
required by the academic record. Linking a pending membership is onboarding
metadata only. It does not let that user access Académico; Identity must first
activate the membership and issue a valid access token with an active context.

## Resource policies

- A tenant administrator may administer the approved academic records and assignments only inside the trusted active tenant context.
- A teacher may act only on CourseSubjects to which the teacher is assigned and only within that tenant. All teachers assigned to the same CourseSubject may collaborate on its learning content.
- A teacher may publish learning content and review submissions for an assigned CourseSubject.
- A teacher may see students enrolled in an assigned CourseSubject; an assignment does not grant access to unrelated tenant rosters.
- A student may read only published content reachable through a valid active CourseEnrollment whose CourseSubject is a default or through a direct StudentSubjectEnrollment.
- A student may access only their own submission data. This statement does not decide draft, revision, replacement, or post-review semantics; those remain later-phase decisions.
- Draft learning content is invisible to students unless a future accepted policy explicitly changes that rule.
- A system administrator has no automatic tenant data access. Cross-tenant support requires an explicit, audited elevated support context with a reason and appropriate current authorization.

## Enforcement requirements

- Centralize policy evaluation enough to prevent controller-by-controller drift.
- Never rely on hidden UI controls for authorization.
- Return consistent forbidden/not-found behavior that avoids cross-tenant enumeration.
- Recheck authorization for file download, asynchronous work, notifications, exports, and integration callbacks.
- Add positive and negative tests for every implemented matrix cell, including same-user multi-tenant and stale/revoked-context cases.

## Scope boundary

This reconciliation resolves only the approved MVP role boundaries above. It does not decide submission revision/replacement semantics, future roles, grades, impersonation, or platform support actions beyond explicit audited elevation.
