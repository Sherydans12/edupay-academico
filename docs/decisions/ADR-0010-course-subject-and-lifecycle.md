# ADR-0010: CourseSubject terminology and academic lifecycle baseline

Status: Accepted
Date: 2026-08-08
Decision authority: Phase 1 foundation integration approval for D-07

## Context

The baseline documentation used `Subject` for both a reusable academic catalog
entry and the course-specific teaching context. That ambiguity would make
teachers, learning content, and direct student access appear global across all
courses that reuse the same subject.

## Decision

### Terminology and relationships

- **Subject** is a tenant-level reusable academic catalog entry, such as Matemáticas, Lenguaje, Ciencias, or Inglés. It is not itself the teaching/classroom instance.
- **Course** is a student cohort/class within one AcademicYear.
- **CourseSubject** is the course-specific offering/context of a Subject and the primary teaching/learning context.
- The conceptual relationship is `Course -> CourseSubject -> Subject`.
- Teachers attach through `CourseSubjectTeacher` assignments to a CourseSubject. A CourseSubject may have multiple teachers.
- Learning content attaches through `CourseSubject -> LearningUnit -> LearningItem`.
- A student reaches a CourseSubject through an active CourseEnrollment when that CourseSubject is configured as `defaultForCourse=true`, or through an active direct `StudentSubjectEnrollment` targeting the CourseSubject.
- A CourseSubject may have `defaultForCourse=false` so it can be assigned selectively.
- No second duplicate `SubjectOffering` concept is introduced; CourseSubject expresses the course-specific context.

Teachers, learning content, and direct student access must not attach directly
to the reusable Subject catalog when that would make them global across every
course.

### Lifecycle baseline

Lifecycle values are stable strings:

| Concept | Allowed states |
| --- | --- |
| AcademicYear | `DRAFT`, `ACTIVE`, `CLOSED`, `ARCHIVED` |
| Course | `DRAFT`, `ACTIVE`, `ARCHIVED` |
| Subject catalog | `ACTIVE`, `ARCHIVED` |
| CourseSubject | `ACTIVE`, `ARCHIVED` |
| CourseEnrollment | `ACTIVE`, `INACTIVE` |
| StudentSubjectEnrollment | `ACTIVE`, `INACTIVE` |
| CourseSubjectTeacher assignment | `ACTIVE`, `INACTIVE` |

`DRAFT` may be configured before an AcademicYear opens. `ACTIVE` is
operational. `CLOSED` preserves the completed academic period and prevents
ordinary enrollment or structural mutation unless an explicitly authorized
correction workflow exists. `ARCHIVED` is retained historical data and
normally read-only. Historical academic years are not destructively deleted.
This decision does not add complex school-year promotion logic.

## Consequences

- The reusable Subject catalog can be shared across courses without sharing teachers, content, timelines, or student direct-enrollment context.
- Academic Domain implementation can use CourseSubject as the authorization and learning boundary.
- UI labels may continue to say “subject” when they map to the user’s CourseSubject context, but canonical contracts and documentation distinguish Subject from CourseSubject.
- The Academic Domain agent remains responsible for schema/API design within this approved model; this ADR does not authorize implementing those models in Phase 1.

## Related documents

- [Academic model](../architecture/academic-model.md)
- [Domain model](../architecture/domain-model.md)
- [Learning model](../architecture/learning-model.md)
- [MVP scope](../product/mvp-scope.md)
- [Unresolved decisions](../governance/unresolved-decisions.md)
