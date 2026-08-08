# Academic model

Status: proposed domain behavior within the mandated MVP

## Concepts

- **Academic year**: a tenant’s period in which courses operate. It has a lifecycle and date boundaries.
- **Course**: a tenant-owned class or cohort within an academic year.
- **Student**: a tenant-owned academic person record, optionally linked to Identity.
- **Teacher**: a tenant-owned academic person record, optionally linked to Identity.
- **Subject**: a teachable academic area within a tenant.
- **Course enrollment**: a student’s membership in a course.
- **Course default subject**: a subject normally available to all students enrolled in a course.
- **Direct subject enrollment**: an individual student’s subject access outside or in addition to course defaults.
- **Subject-teacher assignment**: a teacher’s authorization and teaching relationship to a subject.

## Enrollment resolution

A student can access a subject when the student has:

- an active course enrollment whose course has the subject as a default; or
- an active direct subject enrollment.

The effective access should be computed from active records and publication state. Direct enrollment may be used for exceptions, support plans, or cross-course participation without changing course defaults.

## Invariants

- All academic records belong to one tenant.
- A course belongs to one academic year.
- Course enrollment and direct subject enrollment cannot reference records in another tenant.
- A subject can have multiple teachers.
- A duplicate active enrollment should be prevented or made idempotent.
- Deactivating a relationship must not erase learning history or submissions.
- Academic identity linking is optional and cannot be inferred solely from a client-provided email.

## Synchronization and manual creation

Students and courses may arrive from existing EduPay or be created manually. The academic model therefore needs:

- internal immutable IDs;
- explicit source-system and external-ID references;
- sync status and last-seen metadata where synchronization is used;
- a conflict policy that does not overwrite manual changes accidentally;
- a way to mark records inactive without destructive deletion.

The exact source of truth for each field is unresolved and belongs in the integration contract.

## Future compatibility

Do not encode course, subject, or teacher relationships into a single hard-coded hierarchy. Future classroom workflows may need sections, groups, guardians, attendance, or curriculum links. Those should extend relationships rather than change the meaning of existing identifiers.
