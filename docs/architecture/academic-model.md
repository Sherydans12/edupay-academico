# Academic model

Status: accepted terminology and lifecycle baseline; implementation remains pending

The terminology and lifecycle baseline in this document is accepted by
[ADR-0010](../decisions/ADR-0010-course-subject-and-lifecycle.md). This is a
conceptual model, not permission to add Academic Domain persistence during the
Phase 1 foundation integration.

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

| Concept | Allowed states |
| --- | --- |
| AcademicYear | `DRAFT`, `ACTIVE`, `CLOSED`, `ARCHIVED` |
| Course | `DRAFT`, `ACTIVE`, `ARCHIVED` |
| Subject catalog | `ACTIVE`, `ARCHIVED` |
| CourseSubject | `ACTIVE`, `ARCHIVED` |
| CourseEnrollment | `ACTIVE`, `INACTIVE` |
| StudentSubjectEnrollment | `ACTIVE`, `INACTIVE` |
| CourseSubjectTeacher | `ACTIVE`, `INACTIVE` |

`DRAFT` may be configured before an AcademicYear opens. `ACTIVE` is
operational. `CLOSED` preserves the completed academic period and prevents
ordinary enrollment or structural mutation unless an explicitly authorized
correction workflow exists. `ARCHIVED` retains historical data and is normally
read-only. Historical academic years are not destructively deleted. No complex
school-year promotion logic is introduced by this decision.

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
