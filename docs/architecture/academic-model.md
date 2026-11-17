# Academic model

Status: accepted terminology and lifecycle baseline; MVP Academic Structure implementation present

The terminology and lifecycle baseline in this document is accepted by
[ADR-0010](../decisions/ADR-0010-course-subject-and-lifecycle.md). This is a
conceptual model. Its MVP Academic Structure subset is implemented as recorded
in [the implementation note](../governance/academic-structure-domain.md).

## Concepts

- **Academic year**: a tenant’s period in which courses operate. It has a lifecycle and date boundaries.
- **Course**: a tenant-owned student cohort/class inside one AcademicYear.
- **Student**: a tenant-owned academic person record, optionally linked to Identity.
- **Teacher**: a tenant-owned academic person record, optionally linked to Identity.
- **Subject**: a tenant-level reusable academic catalog entry, such as Matemáticas, Lenguaje, Ciencias, or Inglés. It is not itself a teaching/classroom instance.
- **CourseSubject**: the course-specific offering/context of a Subject, such as Matemáticas · 5° Básico A · 2026. It is the primary teaching and learning context.
- **Course enrollment**: a student’s membership in a Course.
- **CourseSubjectTeacher assignment**: an active or inactive teacher assignment to one CourseSubject. A CourseSubject may have multiple teachers.
- **StudentSubjectEnrollment**: an active or inactive direct student enrollment targeting one CourseSubject, outside or in addition to the Course’s default CourseSubjects.
- **Learning unit**: an ordered content container attached to one CourseSubject.
- **Learning item**: a typed unit of content or work attached through a LearningUnit.

The relationship is conceptually:

```text
AcademicYear
└── Course
    └── CourseSubject ── Subject (reusable catalog entry)
        ├── CourseSubjectTeacher ── Teacher
        └── LearningUnit
            └── LearningItem

CourseEnrollment ── Student ── StudentSubjectEnrollment ── CourseSubject
```

Teachers and learning content attach to CourseSubject, never directly to the
reusable Subject catalog when that would make them global across courses.

## Enrollment resolution

A student can access a CourseSubject when the student has either:

- an active CourseEnrollment for the Course and that CourseSubject is configured with `defaultForCourse=true`; or
- an active StudentSubjectEnrollment that targets the CourseSubject directly.

A CourseSubject may have `defaultForCourse=false` so it can be assigned
selectively. Direct enrollment may support exceptions, support plans, or
cross-course participation without changing the Course’s defaults. Effective
access is computed from active relationships and publication state.

## Lifecycle baseline

Lifecycle values are stable strings:

| Concept                  | Allowed states                          |
| ------------------------ | --------------------------------------- |
| AcademicYear             | `DRAFT`, `ACTIVE`, `CLOSED`, `ARCHIVED` |
| Course                   | `DRAFT`, `ACTIVE`, `ARCHIVED`           |
| Subject catalog          | `ACTIVE`, `ARCHIVED`                    |
| CourseSubject            | `ACTIVE`, `ARCHIVED`                    |
| CourseEnrollment         | `ACTIVE`, `INACTIVE`                    |
| StudentSubjectEnrollment | `ACTIVE`, `INACTIVE`                    |
| CourseSubjectTeacher     | `ACTIVE`, `INACTIVE`                    |

`DRAFT` may be configured before an AcademicYear opens. `ACTIVE` is
operational. `CLOSED` preserves the completed academic period and prevents
ordinary enrollment or structural mutation unless an explicitly authorized
correction workflow exists. `ARCHIVED` retains historical data and is normally
read-only. Historical academic years are not destructively deleted. No complex
school-year promotion logic is introduced by this decision.

### Year in context and preparing the next year

The administration console works on one **year in context**, shown with its
label, dates and status on every administration screen (Inicio, Cursos,
Matrículas and Personas) and shared between them (kept per browser and tenant;
an unknown or archived choice falls back to the active year). A draft year
shows that it is being prepared and does not change the active one. The
screens are organized by task; see
[Administración por tarea](../design/academic-admin-by-task.md).

- `GET /api/v1/academic-years/{id}/overview` (tenant administrators) returns
  the year's courses by status and its active enrollments of active students,
  with how many are source-managed (EduPay). Read-only.
- `POST /api/v1/academic-years/{id}/courses/copy` with
  `{ sourceAcademicYearId, dryRun }` prepares a year's courses from another
  year: it creates the labels of the source's non-archived courses that the
  target lacks (trimmed, case-insensitive match) as `DRAFT` manual courses.
  `dryRun` only reports `toCreate` and `alreadyPresent`; repeating creates
  nothing new. The target year must be `DRAFT` or `ACTIVE`; it is audited as
  `ACADEMIC_YEAR_COURSES_COPIED`.
- `GET /api/v1/students?academicYearId={id}` adds `yearEnrollment` to each
  student of the page: `{ enrollmentId, courseId, courseLabel }` of an active
  enrollment in a course of that year, or `null` when there is none. If a
  student has several, the first by course label is returned. Without the
  parameter the field is omitted; a year of another tenant is `404`. Only the
  students of the requested page are looked up.

Courses and enrollments of a `DRAFT` year are allowed: new students can be
admitted into next year's courses before that year is activated. Activating
the year, the annual promotion and the EduPay authority transfer (ADR-0025)
remain separate steps.

### Closing an enrollment (authorized correction workflow)

Closing a `MANUAL` CourseEnrollment (`POST /api/v1/course-enrollments/{id}/deactivate`)
is the explicitly authorized correction for an archived Course: it only
reduces state, keeps history (the enrollment becomes `INACTIVE`, nothing is
deleted), records the `COURSE_ENROLLMENT_DEACTIVATED` audit event and, when the
financial projection is enabled, enqueues its tombstone in the same
transaction. It requires an open AcademicYear (`DRAFT` or `ACTIVE`); a
`CLOSED` or `ARCHIVED` year stays read-only. EduPay-owned enrollments keep
returning `SOURCE_MANAGED_ENROLLMENT_CONFLICT`. Creating enrollments in an
archived Course remains forbidden.

Archiving a Course or inactivating a Student does not close its `MANUAL`
enrollments. `GET /api/v1/course-enrollments/inconsistent` (tenant
administrators, cursor pagination, 50 per page by default) lists active
enrollments whose Student is `INACTIVE` or whose Course is `ARCHIVED`, with
their reasons and source. The administration console shows them under
**Estructura → Matrículas por revisar** and offers the same confirmed closure;
the course roster offers it per manual row. Neither surface exposes email or
RUN/IPE.

## Invariants

- All academic records belong to one tenant.
- A Course belongs to one AcademicYear.
- A CourseSubject links one Course to one reusable Subject within the same tenant.
- CourseEnrollment and StudentSubjectEnrollment cannot reference records in another tenant.
- StudentSubjectEnrollment targets a CourseSubject, not merely a Subject catalog entry.
- CourseSubjectTeacher and LearningUnit relationships target CourseSubject, not the reusable Subject catalog.
- Deactivating a relationship must not erase learning history or submissions.
- Academic identity linking is optional and cannot be inferred solely from a client-provided email.

## Synchronization and manual creation

Students and Courses may arrive from existing EduPay or be created manually. The
academic model therefore needs:

- internal immutable IDs;
- explicit source-system and external-ID references;
- sync status and last-seen metadata where synchronization is used;
- a conflict policy that does not overwrite manual changes accidentally;
- a way to mark records inactive without destructive deletion.

The exact source of truth for each field is unresolved and belongs in the
integration contract.

## Future compatibility

Do not encode Course, CourseSubject, Subject, or Teacher relationships into a
single hard-coded hierarchy. Future classroom workflows may need sections,
groups, guardians, attendance, or curriculum links. Those should extend
relationships rather than change the meaning of existing identifiers.
