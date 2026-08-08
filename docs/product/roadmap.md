# MVP roadmap

Status: proposed sequencing; dates intentionally omitted

The roadmap is organized by independently verifiable outcomes rather than by front-end and back-end task lists.

## Phase 0 — decisions and delivery foundation

Exit criteria:

- This documentation set is reviewed and the unresolved decisions have owners.
- Repository conventions, environments, CI checks, and migration policy are agreed.
- Identity and EduPay integration contracts have a versioned interface owner.

## Phase 1 — identity and tenant foundation

Exit criteria:

- A user can authenticate through the agreed Identity boundary.
- Membership and role context is available to the application.
- Tenant resolution, authorization guards, audit correlation, and tenant-scoped persistence are covered by tests.

## Phase 2 — academic foundation

Exit criteria:

- Academic years, courses, students, teachers, Subject catalog entries, CourseSubjects, and enrollment rules are usable.
- CourseSubject defaults, direct StudentSubjectEnrollment, and multiple teachers per CourseSubject work.
- Manual creation works even if synchronization is unavailable.

## Phase 3 — learning authoring and student access

Exit criteria:

- Teachers can organize CourseSubject learning units and create the four MVP item types.
- Students can navigate assigned CourseSubjects and published content responsively.
- Draft/publish visibility and access rules are verified.

## Phase 4 — submissions and review

Exit criteria:

- Students can upload multiple files and an optional comment.
- Late submissions are accepted and flagged.
- Teachers can review, comment, request changes, and students can resubmit.
- File authorization and audit coverage are complete.

## Phase 5 — notifications and EduPay synchronization

Exit criteria:

- In-app notifications and Académico-owned Resend email delivery run through the notification abstraction; Identity invitation/activation/recovery email remains owned by Identity.
- Retry, idempotency, and failure visibility are implemented.
- The agreed student/course synchronization contract is exercised against a representative source.

## Phase 6 — pilot hardening and release

Exit criteria:

- Security, accessibility, responsive, performance, backup/restore, and tenant-isolation checks pass.
- Colegio Conquistadores pilot data and support runbook are approved.
- Definition-of-done evidence exists for every MVP capability.

## Future-compatible seams

The MVP should leave extension points for grades, attendance, guardians, and classroom workflows through explicit domain boundaries and event names. It should not create placeholder UI or tables whose behavior has not been decided.
