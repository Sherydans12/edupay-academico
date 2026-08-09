# ADR-0006: submission revision and review state

Status: Superseded by [ADR-0013](ADR-0013-submissions-and-storage-mvp-semantics.md)
Date: 2026-08-08

## Context

Students can submit multiple files, submit late, and respond to teacher requests for corrections. The MVP does not define whether these are independent attempts or revisions of one work item.

## Candidate decision

Model one logical student submission per learning item with immutable submitted revisions. A draft may exist before submission. Each revision records its files, comment, submission time, effective deadline, late flag, and review history. A teacher can mark a revision reviewed or request changes; a change request enables a new revision without erasing prior history.

## Rationale

- Maps naturally to correction requests.
- Preserves an auditable history of files and feedback.
- Avoids grades/attempt scoring while keeping future extension possible.

## Consequences

- UI must explain logical submission versus revision.
- Storage cleanup and file authorization operate at revision scope.
- Deadline-change and post-review policies must be precise.

## Alternatives

- Multiple independent attempts with a selected current attempt.
- A mutable single submission record with no revision history.

## Open items before acceptance

- Draft support, post-reviewed resubmission, review edit/delete, required reason for changes, deadline timezone.
