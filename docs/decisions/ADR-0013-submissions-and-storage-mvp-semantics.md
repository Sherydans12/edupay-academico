# ADR-0013: MVP submissions, revisions, and deadline semantics

Status: Accepted
Date: 2026-08-08
Decision authority: Storage and Student Submissions MVP approval

## Context

The accepted private storage architecture preserves immutable academic evidence,
while the Learning domain exposes published assignments and document-based
assessments. The MVP needs one coherent submission workflow that does not turn
correction resubmissions into independent attempts or silently rewrite old
files, comments, reviews, or deadline evidence.

## Decision

### D-08 — one logical submission with immutable revisions

There is exactly one logical `Submission` per tenant, student, and eligible
LearningItem. Only `ASSIGNMENT` and `ASSESSMENT` items are eligible. A
Submission contains immutable `SubmissionRevision` records. Submit and
resubmit operations create a new revision number; an earlier submitted
revision is never overwritten and revisions are not independent attempts.

### D-09 — correction workflow and no persisted drafts

The MVP does not persist server-side student drafts. A submission moves through
`PENDING -> SUBMITTED -> REVIEWED`, or
`SUBMITTED -> CHANGES_REQUESTED -> SUBMITTED` after a new revision.

A teacher review targets one revision and may add a comment, mark the revision
reviewed, or request changes. The MVP stores no grades, scoring, or rubrics.
After `REVIEWED`, the student cannot freely create another revision. A new
revision is accepted only while the logical Submission is `CHANGES_REQUESTED`;
a future reopen workflow requires an explicit decision. Existing revisions and
their FileReferences remain available.

### D-10 — absolute deadlines and immutable lateness snapshots

The first tenant operational timezone is `America/Santiago` for documented
configuration/default behavior only. PostgreSQL stores absolute instants in
`timestamptz`, APIs expose ISO 8601 timestamps, and the server determines
lateness. Submissions after `dueAt` are accepted and marked late.

Each revision snapshots `submittedAt`, the LearningItem `dueAt` as
`effectiveDueAt`, and `isLate`, where `isLate = submittedAt > effectiveDueAt`.
Later LearningItem due-date changes do not rewrite historical revisions. A
future TenantConfiguration decision may define timezone display/input rules;
domain calculations remain instant-based.

## Storage and API consequences

- `StoredBlob`, `FileObject`, and `FileReference` remain separate, immutable,
  tenant-scoped concepts.
- Submission files are typed FileReferences to a SubmissionRevision. New
  revisions receive new FileObjects/references.
- Uploads reserve global and tenant quota atomically, validate authoritative
  bytes, and use the private provider abstraction. The control plane is JSON
  metadata only; the data plane transfers one file per request using bounded
  `multipart/form-data` disk staging. The first adapter uses a local private
  filesystem; no public storage path is exposed.
- Submission and revision JSON bodies contain finalized opaque `fileObjectIds`,
  never file bytes. Each referenced object is rechecked transactionally for
  tenant, actor, category, availability, LearningItem compatibility, and
  prior evidence attachment before its immutable FileReference is created.
- Every download reauthorizes the parent resource and trusted tenant. Student
  access is limited to the student’s own submission; assigned teachers can
  review their CourseSubject; TENANT_ADMIN has tenant oversight.

## Alternatives rejected

- Independent attempts: rejected because correction history is one piece of
  work and the MVP has no attempt scoring semantics.
- Mutable single-file or single-comment submission: rejected because it would
  destroy academic evidence.
- Persisted student drafts: deferred to a future explicit decision.
- Recomputing historical late flags after a due-date edit: rejected because
  evidence must preserve the facts known at submission time.

## Remaining open decisions

Malware scanning, pilot retention, finalized-evidence deletion, legal-hold
prerequisites, and staging cleanup are resolved for the controlled pilot by
[ADR-0018](ADR-0018-file-security-retention-and-malware-policy.md). Permanent
statutory/contractual retention and future destructive deletion remain subject
to later review.
Production storage provider, physical free-space thresholds, backup/RTO/RPO,
streamed-versus-signed download defaults, and quota-change authority also
remain governed by ADR-0005 follow-ups.

## Related documents

- [Private storage architecture](../architecture/file-storage.md)
- [Learning model](../architecture/learning-model.md)
- [Submissions workflow](../architecture/submissions-workflow.md)
- [Roles and authorization](../architecture/roles-and-authorization.md)
- [Unresolved decisions](../governance/unresolved-decisions.md)
