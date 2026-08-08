# ADR-0012: Learning publication and edit semantics

Status: Accepted
Date: 2026-08-08
Decision authority: Learning Domain MVP owner approval

## Context

Learning content must support teacher preparation, scheduled publication, and
historical retention without making student visibility depend on a queue or
worker. The Learning MVP also needs a safe boundary for changes after content
has become visible, while student submissions and storage remain later bounded
contexts.

## Decision

### Learning unit lifecycle

Learning units are tenant-owned and attached to a `CourseSubject`, never to the
reusable global `Subject` catalog. Their stable lifecycle values are:

- `DRAFT`: teacher or administrator preparation;
- `ACTIVE`: eligible for the active CourseSubject learning route when its
  optional time window permits;
- `ARCHIVED`: retained history and removed from normal student navigation.

Units are never hard-deleted. `startAt` and `endAt` are optional absolute
instants; when both exist, `startAt <= endAt`.

### Learning item publication lifecycle

Learning items use these stable publication values:

- `DRAFT`: not visible to students;
- `SCHEDULED`: requires a server-validated future `publishAt` at scheduling
  time;
- `PUBLISHED`: visible to entitled students;
- `ARCHIVED`: retained history and hidden from normal student navigation.

Student visibility evaluates effective publication at read time. A scheduled
item whose `publishAt` has arrived is treated as visible even while its stored
status remains `SCHEDULED`. A later worker may normalize that status to
`PUBLISHED`, but no student correctness depends on that worker or on a queue.
Published and archived records remain retained.

All timestamps are stored as PostgreSQL `timestamptz` values and exposed as
ISO 8601 timestamps with an explicit offset. Domain calculations use absolute
instants and do not hard-code a tenant timezone.

### Typed item rules

`MATERIAL`, `ASSIGNMENT`, `ASSESSMENT`, and `ANNOUNCEMENT` are the only MVP
types. Assignments and document-based assessments require `instructions` and
`dueAt`. Materials and announcements do not have due dates. Announcements
require a body. Assessment is a document-deliverable definition, not an exam
engine: no questions, alternatives, question banks, automatic correction,
grades, rubrics, points, or scoring are stored.

### Editing and audit

Draft content may be edited normally. Changes to scheduled or published
content are audit-recorded. Changing type, instructions, due date,
publication timing, or a future attachment relationship is a sensitive change
and requires explicit `confirmSensitiveChange` at the application boundary.
When a later Submission domain reports that student work exists through the
Learning student-work port, the confirmation remains required and the audit
event records that historical evidence is involved. Learning does not create,
query, or simulate Submission persistence in this phase.

Archival is a status transition, not deletion. Historical student evidence is
never silently rewritten; later Submission and Storage decisions own the
immutable evidence and file-reference details.

### Authorization and access

`TENANT_ADMIN` may manage Learning content within the trusted tenant context.
`TEACHER` may manage, reorder, schedule, publish, and archive only for an
active `CourseSubjectTeacher` relationship on the target CourseSubject. All
active teachers assigned to one CourseSubject share the same content scope.
`STUDENT` may read only active CourseSubjects reached through an active default
course enrollment or direct subject enrollment, active/time-visible units, and
effectively published items. `SYSTEM_ADMIN` remains denied without the
separately approved audited support context.

Ordering is explicit and scoped. Reorder requests must contain the complete
set of IDs in one tenant and one parent scope; missing, cross-parent, and
cross-tenant IDs are rejected. Applying the same requested order is
deterministic and idempotent.

## Consequences

- The API can evaluate scheduled visibility synchronously with a database
  query and does not require a queue in the Learning MVP.
- Publication metadata is retained on the LearningItem for audit and future
  normalization.
- No raw files, filesystem paths, base64 data, submission records, or
  submission endpoints are introduced.
- Storage will later attach FileObjects/FileReferences through the documented
  port and accepted storage architecture.
- Submission revision, draft, replacement, post-review, and deadline policy
  decisions remain open under D-08, D-09, and D-10.

## Related documents

- [Learning model](../architecture/learning-model.md)
- [Domain model](../architecture/domain-model.md)
- [Roles and authorization](../architecture/roles-and-authorization.md)
- [API conventions](../architecture/api-conventions.md)
- [File storage architecture](../architecture/file-storage.md)
- [Unresolved decisions](../governance/unresolved-decisions.md)
