# Domain model

Status: proposed conceptual model; not a Prisma schema

## Bounded contexts

| Context | Owns | Does not own |
| --- | --- | --- |
| Identity | Users, credentials, sessions, refresh tokens, memberships, roles, invitations, authentication audit | Students, teachers, courses, subjects, payments, grades |
| Tenant configuration | Tenant lifecycle, tenant settings, theme tokens, external references | Identity credentials and academic work |
| Academic structure | Academic years, courses, students, teachers, subjects, enrollments, subject-teacher assignments | Authentication and learning content |
| Learning | Learning units and typed learning items, publishing, ordering, item attachments | Identity and payment records |
| Work and review | Submissions, submission files, reviews, comments, change requests | Grades and automatic evaluation |
| Platform services | Notifications, delivery attempts, integrations, operational audit | The source domain records being notified |

## Relationship overview

```mermaid
erDiagram
    TENANT ||--o{ ACADEMIC_YEAR : contains
    TENANT ||--o{ STUDENT : owns
    TENANT ||--o{ TEACHER : owns
    TENANT ||--o{ SUBJECT : owns
    ACADEMIC_YEAR ||--o{ COURSE : contains
    COURSE ||--o{ COURSE_ENROLLMENT : has
    STUDENT ||--o{ COURSE_ENROLLMENT : joins
    COURSE ||--o{ COURSE_SUBJECT : defaults
    SUBJECT ||--o{ COURSE_SUBJECT : is_default_for
    STUDENT ||--o{ STUDENT_SUBJECT_ENROLLMENT : receives
    SUBJECT ||--o{ STUDENT_SUBJECT_ENROLLMENT : directly_assigns
    SUBJECT ||--o{ SUBJECT_TEACHER : taught_by
    TEACHER ||--o{ SUBJECT_TEACHER : teaches
    SUBJECT ||--o{ LEARNING_UNIT : organizes
    LEARNING_UNIT ||--o{ LEARNING_ITEM : contains
    LEARNING_ITEM ||--o{ SUBMISSION : receives
    STUDENT ||--o{ SUBMISSION : creates
    SUBMISSION ||--o{ SUBMISSION_FILE : includes
    SUBMISSION ||--o{ REVIEW : receives
```

## Entity rules

- Every tenant-owned entity has an internal identifier and an immutable `tenantId`.
- External identifiers are stored as explicit references, not as primary keys.
- Soft deletion, archival, or status transitions must be chosen per aggregate; no global deletion convention is assumed.
- Creation and update timestamps use a consistent timezone strategy once approved; API dates are ISO 8601.
- Domain records should not contain credentials, refresh tokens, or payment details.

## Aggregate candidates

These are boundaries for implementation discussion, not a final persistence design:

- **Tenant**: tenant configuration and theme tokens.
- **Academic year**: lifecycle of a year and its courses.
- **Course**: course membership and default subject assignments.
- **Subject**: subject-teacher assignments and learning-unit ordering.
- **Learning unit**: ordered learning items and visibility state.
- **Learning item**: typed content and work configuration.
- **Submission**: the student work record, files, comments, and review history.

Cross-aggregate operations should use application services and explicit transactions/events rather than hidden database coupling.

## Deliberate omissions

No grade, rubric, attendance, question, exam-attempt, or guardian-relationship entity is part of the MVP model. Future features may add them behind new bounded-context decisions.
