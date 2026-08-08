# Learning Content domain implementation note

Status: implemented on `feat/learning-domain`
Date: 2026-08-08

The MVP Learning Content implementation follows ADR-0010, ADR-0011, and
ADR-0012. It adds tenant-safe `LearningUnit` and `LearningItem` persistence,
typed content rules, explicit ordering, publication scheduling, and
CourseSubject-scoped REST/JSON routes. It does not add student submissions,
file uploads, FileObjects, FileReferences, grades, rubrics, questions, or
automatic evaluation.

## Persistence and tenant isolation

Every Learning row has a composite `(tenant_id, id)` primary key and every
LearningUnit/LearningItem relationship includes tenant scope. LearningItem
also references `(tenant_id, learning_unit_id, course_subject_id)`, which
prevents attaching an item to a unit from another CourseSubject even when UUIDs
are known. PostgreSQL checks enforce non-negative ordering, unit date ranges,
scheduled publication timestamps, and type-specific due/instruction/body
requirements.

Learning content attaches to `CourseSubject`, never to `Subject`. Archiving
changes status and preserves rows and their publication metadata.

## API routes

The API uses `/api/v1`, camelCase JSON, Zod 4 contracts in
`packages/contracts`, and the existing stable error envelope:

- `GET /course-subjects/{courseSubjectId}/learning`
- `POST /learning-units`, `GET /course-subjects/{courseSubjectId}/learning-units`,
  `GET /learning-units/{id}`, `PATCH /learning-units/{id}`,
  `POST /learning-units/{id}/archive`
- `POST /course-subjects/{courseSubjectId}/learning-units/reorder`
- `POST /learning-units/{learningUnitId}/items`,
  `GET /learning-units/{learningUnitId}/items`, `GET /learning-items/{id}`,
  `PATCH /learning-items/{id}`
- `POST /learning-items/{id}/schedule`, `/publish`, and `/archive`
- `POST /learning-units/{learningUnitId}/items/reorder`

The hierarchy route is role-aware. Teachers and tenant administrators receive
the scoped management view; students receive only effective active units and
visible items.

## Authorization and visibility

Teacher operations require an active linked Teacher and active
CourseSubjectTeacher relationship for the target CourseSubject. Multiple
assigned teachers share the same scope. Tenant administrators operate within
the trusted tenant context. Students need an active linked Student plus either
an active default CourseEnrollment or active direct StudentSubjectEnrollment.

Students never see DRAFT or ARCHIVED units/items. A scheduled item with an
elapsed `publishAt` is visible immediately through the effective visibility
query, even though no worker has normalized its stored status. Future scheduled
items remain hidden.

## File and Submission seams

Learning stores no file content or path. `learning-attachment.port.ts` defines
the minimal future Storage integration target; Storage remains responsible for
FileObjects/FileReferences and the private object-storage policy. The
`LearningStudentWorkPort` is the future Submission integration seam used by
sensitive-change confirmation. Its MVP adapter is an explicit no-submission
implementation and creates no Submission data.

## Validation coverage

PostgreSQL-backed E2E tests cover assigned-teacher collaboration, unrelated and
cross-tenant denial, default and direct student access, student isolation,
draft/future/elapsed-scheduled/published/archived visibility, type-specific
due dates, retained history, safe reordering, sensitive-change confirmation,
and SYSTEM_ADMIN fail-closed behavior.
