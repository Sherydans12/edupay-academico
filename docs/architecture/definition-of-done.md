# Definition of done

Status: proposed release governance

Work is done only when the behavior, security boundary, operations, and documentation are complete enough for the next agent or operator to rely on it.

## For every change

- Scope matches an approved product requirement or ADR.
- Domain/API behavior and authorization are documented.
- Tenant scope is explicit for every tenant-owned read/write/background action.
- Validation and safe error behavior are present.
- Automated tests cover the happy path and relevant negative/cross-tenant cases.
- Database migrations are reviewed and safe for the deploy sequence.
- Audit events are defined for sensitive actions.
- Notifications and external calls are resilient and idempotent where applicable.
- UI has loading, empty, error, permission, and success states where applicable.
- UI is responsive and accessible for the supported flow.
- No out-of-scope feature or hidden product decision was introduced.
- Relevant documentation and ADR status are updated.

## MVP capability evidence

Before pilot, demonstrate:

- independent Identity/authentication path;
- tenant and role resolution;
- academic setup manually and through the agreed sync path;
- CourseSubject defaults and direct StudentSubjectEnrollment;
- multiple teachers per CourseSubject;
- learning unit and four learning item types;
- student assignment access;
- multiple-file on-time and late submission;
- teacher review, comment, change request, and student resubmission;
- in-app notification and Resend delivery or visible failure state;
- private file authorization;
- audit trail;
- backup/restore and operational runbook;
- two-tenant isolation test suite.

## Release approval

Release approval requires named product, technical, security/operations, and pilot owners. “Works locally” is not release evidence.
