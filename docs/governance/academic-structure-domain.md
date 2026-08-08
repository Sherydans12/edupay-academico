# Academic Structure domain implementation note

Status: implemented on `feat/academic-domain`

Date: 2026-08-08

The MVP Academic Structure implementation follows ADR-0009, ADR-0010, and
ADR-0011. It adds Tenant, AcademicYear, Course, Student, Teacher, Subject,
CourseSubject, CourseEnrollment, StudentSubjectEnrollment, and
CourseSubjectTeacher persistence and `/api/v1` endpoints. The Academic
Structure portion itself does not add submissions, grades, attendance,
payments, synchronization, or support impersonation/elevation. LearningUnit
and LearningItem are implemented separately by the Learning Content domain;
see [the Learning implementation note](learning-content-domain.md).

## Persistence and tenant isolation

The Académico Tenant primary key is the canonical opaque ecosystem tenant ID
from trusted Identity context. Academic internal IDs are UUIDs. Every
tenant-owned relation uses a composite `(tenant_id, id)` foreign key, so
cross-tenant relationships fail in PostgreSQL as well as in application lookup.
Repositories are not exposed; every public academic operation constructs a
`TenantQueryScope` from `TrustedTenantContext` before issuing queries.

Student and Teacher retain optional `identity_user_id`, `source`, and
`external_reference` fields. Manual API creation fixes `source=MANUAL`.
No synchronization behavior or source-of-truth ownership is inferred while
D-05 and D-06 remain open.

PostgreSQL partial unique indexes allow only one ACTIVE CourseSubject for a
Course/Subject pair and one ACTIVE course enrollment, direct subject
enrollment, or teacher assignment for each relationship key. INACTIVE or
ARCHIVED rows remain historical and a later active relationship may be created.

## Lifecycle behavior

- AcademicYear transitions forward from DRAFT to ACTIVE to CLOSED to ARCHIVED;
  a DRAFT may also be archived. Configuration fields can change only in DRAFT.
- Course transitions from DRAFT to ACTIVE or ARCHIVED and from ACTIVE to
  ARCHIVED. Activation requires an ACTIVE AcademicYear.
- CLOSED and ARCHIVED AcademicYears and ARCHIVED Courses reject ordinary
  structural mutation.
- Student and Teacher use ACTIVE/INACTIVE; academic relationships are never
  hard-deleted by application use cases.
- Subject and CourseSubject use ACTIVE/ARCHIVED and archived records are
  read-only.

## Effective access and authorization

Effective student CourseSubjects are selected once from ACTIVE CourseSubjects
where either an ACTIVE CourseEnrollment reaches a default CourseSubject or an
ACTIVE StudentSubjectEnrollment reaches it directly. The query naturally
deduplicates records granted through both paths.

TENANT_ADMIN owns the administration endpoints inside trusted tenant context.
A TEACHER needs an ACTIVE Teacher record linked to the current Identity user and
an ACTIVE CourseSubjectTeacher assignment to view the CourseSubject or its
effective roster. A STUDENT needs an ACTIVE linked Student record and sees only
their profile and effective CourseSubjects. An Identity link alone grants no
CourseSubject or roster access. SYSTEM_ADMIN remains denied because support
context still fails closed.

Identity link endpoints require a current Identity status check and an exact
restricted-link verifier. The production verifier is intentionally
unconfigured and fails closed until its service transport is configured.
Relationship and identity-link mutations emit correlation-capable academic
audit events without deciding D-17 retention or field-history policy.
