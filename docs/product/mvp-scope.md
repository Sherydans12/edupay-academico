# MVP scope

Status: mandated scope with implementation acceptance boundaries

## In scope

### Identity and access

- Independent EduPay Identity integration boundary.
- Users, credentials, sessions, refresh tokens, memberships, roles, invitations, and authentication audit owned by Identity.
- MVP roles: `SYSTEM_ADMIN`, `TENANT_ADMIN`, `TEACHER`, `STUDENT`.
- Tenant-aware authorization derived from authenticated membership/session context.

### Academic structure

- Academic years.
- Courses.
- Student and teacher records.
- Subjects.
- Course enrollment.
- Course default subjects.
- Direct subject enrollment for an individual student.
- Multiple teachers on a subject.
- Import/synchronization of students and courses from existing EduPay through an explicit contract.
- Manual creation for supported records.

### Learning and work

- Subject → learning unit → learning item hierarchy.
- Learning item types: `MATERIAL`, `ASSIGNMENT`, `ASSESSMENT`, `ANNOUNCEMENT`.
- Materials and instructions with ordered attachments.
- Deadlines for assignments and document-based assessments.
- Multiple-file student submissions with an optional comment.
- Submission after deadline, with a late flag.
- Teacher review, comment, and request-changes action.
- Resubmission after a correction request.

### Platform services

- In-app notifications.
- Email notifications through Resend behind an application notification layer.
- S3-compatible file storage through a provider abstraction.
- Audit records for authentication and sensitive academic actions.

## Out of scope

- Online exam questions, question banks, timed exams, automatic grading, rubrics, and grades.
- Attendance, class book, curriculum planning, complex scheduling, video classes, and live classes.
- Financial management, admissions, enrollment/admission workflows, and payment operations.
- Internal chat.
- Native mobile application.
- Guardian UI; the domain must not make a future guardian portal impossible.

## MVP role outcomes

| Role | MVP outcome |
| --- | --- |
| `SYSTEM_ADMIN` | Support tenants and controlled platform operations with explicit elevated access. |
| `TENANT_ADMIN` | Set up the tenant’s academic structure, memberships, and operational configuration. |
| `TEACHER` | Manage authorized subject content and review authorized student submissions. |
| `STUDENT` | Access assigned work and submit files for authorized assignments and assessments. |

## MVP acceptance boundary

The MVP is complete only when a configured tenant can execute the end-to-end path:

1. A student and course exist, whether synchronized or manually created.
2. The student is enrolled in a course or directly in a subject.
3. A teacher is assigned to the subject.
4. The teacher creates a learning unit and publishes a material or work item.
5. The student sees only assigned content, opens instructions, and uploads one or more files.
6. The system records whether the submission is late without blocking it.
7. The teacher reviews, comments, and can request changes.
8. The student sees the feedback and can resubmit.
9. In-app and configured email notifications are emitted for the agreed MVP events.
10. Audit and tenant-isolation checks pass for the complete path.

Any feature not required to complete this path should be treated as post-MVP unless an approved ADR changes the boundary.
