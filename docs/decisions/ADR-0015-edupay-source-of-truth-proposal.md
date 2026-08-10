# ADR-0015: EduPay source-of-truth proposal

Status: **Proposed**; D-05 remains **OPEN**

Date: 2026-08-10

Owners to approve: EduPay integration owner, Académico product/domain owner, security/privacy owner

Related: [Synchronization discovery](../integration/edupay-sync-discovery.md), [ADR-0009](ADR-0009-identity-contract-reconciliation.md), [ADR-0010](ADR-0010-course-subject-and-lifecycle.md), [ADR-0011](ADR-0011-api-and-shared-contract-strategy.md)

## Context

The real upstream is the BaseLogic EduPay administrative system in `C:\Users\nicol\Documents\EduPay`, repository `Sherydans12/BL-002-EduPay`, inspected at source revision `d7a8321`. It is separate from EduPay Identity and Académico. The inspected source schema contains Tenant, Course, Guardian, Student, and financial entities. Académico contains its own academic records and must not share the source database.

The source evidence is now available, but it exposes several mismatches that prevent a blind field copy:

- EduPay `Student.name` is one full-name string; Académico stores `firstName` and `lastName`.
- EduPay Student has no email/contact field. Guardian email/phone are Guardian fields.
- EduPay Course has only mutable `name` plus an integer `id`; migrations resequence and rewrite Course IDs from names/grades.
- EduPay has no AcademicYear, grade/level/section model, enrollment history, Teacher, Subject, CourseSubject, Learning, or Submission.
- Source ordinary list routes omit soft-deleted rows and have offset pagination; no versioned academic feed, cursor, outbox, or academic webhook exists.
- EduPay’s tenant ID is a string/slug such as `colegio-conquistadores`; Identity’s canonical tenant ID is UUID-shaped. Compatibility is not established.

This ADR proposes ownership for review. It does not authorize synchronization implementation and does not mark D-05 accepted.

## Source facts

| Source entity/field | Verified behavior | Target implication |
| --- | --- | --- |
| `Tenant.id`, `slug`, `isActive` | String ID; seeded value `colegio-conquistadores`; source-local tenant scope | Server-controlled source-to-canonical tenant mapping; no ID equality assumption. |
| `Course.id`, `tenantId`, `name`, timestamps, `deletedAt` | Integer ID; name is the only course descriptor; ID-rewriting migrations exist; delete is soft | Stable Course external ID must be added/frozen before sync; year/grade/section cannot be inferred. |
| `Student.id`, `tenantId`, `rut`, `name`, `status`, `courseId`, `guardianId`, timestamps, `deletedAt` | Integer ID, single full name, status `ACTIVE`/`INACTIVE`/`GRADUATED`, current course/guardian links, soft delete | Student ID is a candidate with an explicit no-reuse guarantee; name transformation and status projection need approval. |
| `Guardian.id`, `tenantId`, `rut?`, `name`, `email?`, `phone?`, student association | Real upstream entity; RUT nullable; association is relevant to administration | No Académico Guardian model; exclude from MVP pending separate privacy/domain decision. |
| Payment/Charge/financial records | Real tenant-scoped administrative entities linked to students | `NOT_SYNCED`; financial ownership remains in EduPay. |
| Teacher, Subject, AcademicYear, enrollment history, Learning, Submission | No source model/API found | Do not invent parity or auto-create target records. |

## Decision proposal

### 1. Administrative source authority

For source-linked records, EduPay is proposed as authoritative for the administrative facts it actually owns and exposes:

- Student source identity, after the source ID contract is accepted;
- Student administrative status;
- Student current course assignment, projected into target enrollment lifecycle;
- Student source name, only after an approved transformation into target first/last name;
- Course source identity, only after an immutable source Course ID is supplied;
- Course display name and source soft-deletion lifecycle.

EduPay is not authoritative for target-only pedagogical data, target AcademicYear lifecycle, or any entity it does not expose.

### 2. Académico authority

Académico is proposed as authoritative for:

- AcademicYear creation, dates, label, and lifecycle;
- Subject, CourseSubject, teacher assignments, learning content, and submissions;
- academic history and evidence retention;
- manual records that have no explicit EduPay mapping.

Synchronization must never overwrite or hard-delete Learning or Submission data. A source Student/Course deactivation changes lifecycle state only and preserves historical academic records.

### 3. Fields excluded from the MVP

The following are explicitly `NOT_SYNCED` for this proposal:

- Guardian and `Student.guardianId`;
- source RUT (target has no RUT field; it may be a controlled reconciliation attribute only if separately approved);
- Student email/contact (no source Student field exists);
- Teacher, Subject, CourseSubject, StudentSubjectEnrollment, CourseSubjectTeacher;
- AcademicYear as a source-owned entity;
- payments, charges, financial setup, notification, authentication, role, and permission data;
- Learning and Submissions as target-owned aggregates.

### 4. Stable identity proposal

For Student, use:

```text
(canonicalTenantId, source = "EDUPAY", entityType = "Student", externalId = String(source Student.id))
```

The current target representation is `Student.source = EDUPAY` plus `Student.externalReference`. This is conditional on an explicit EduPay guarantee that Student IDs are immutable and never reused. RUT, name, email, Guardian, and Course label must never be primary synchronization keys.

Do **not** use the current EduPay `Course.id` as a final Course external ID. Source migrations have resequenced, compacted, and grade-aligned those IDs. A future source contract must add an immutable public Course ID/UUID or an accepted no-change/no-reuse guarantee. Académico’s current Course model also needs an approved provenance mapping before implementation.

### 5. Tenant mapping proposal

Do not treat `colegio-conquistadores` as the canonical ecosystem tenant ID. Resolve this source key through an audited server-side mapping:

```text
(EDUPAY, "colegio-conquistadores") -> canonical Identity/Académico tenant UUID
```

No client-provided tenant field can authorize a read or write. An unmapped or ambiguous tenant blocks the run.

### 6. AcademicYear proposal

EduPay has no AcademicYear or period. The recommended MVP is that a local Academic admin creates the target AcademicYear and a server-controlled sync configuration maps a source tenant/feed to that target year. Parsing a year, grade, or section from mutable Course names is rejected.

## Proposed field-level matrix

| Source field/entity | Target field/entity | Ownership | Local mutation | Source change | Local difference |
| --- | --- | --- | --- | --- | --- |
| `Tenant.id`/`slug` | Tenant mapping config -> canonical Tenant | `NOT_SYNCED` | No client control | Resolve mapping only | Unmapped blocks sync. |
| `Student.id` | `Student.source`/`externalReference` | `EDUPAY_AUTHORITATIVE` conditional | Immutable | Never remap | Duplicate/collision quarantine. |
| `Student.name` | `Student.firstName`/`lastName` | `EDUPAY_AUTHORITATIVE` conditional | Review/hold until transform accepted | Apply with evidence | Ambiguous split is a conflict. |
| Student email/contact | `Student.email` | `NOT_SYNCED` | Local only | No source field | No comparison. |
| `Student.rut` | No target field | `NOT_SYNCED` | N/A | No write | Optional controlled reconciliation only after approval. |
| `Student.status` | `Student.status` | `EDUPAY_AUTHORITATIVE` conditional | Override requires policy | ACTIVE->ACTIVE; INACTIVE/GRADUATED/deleted->INACTIVE | Conflict evidence; no mass changes on partial run. |
| `Student.courseId` | `CourseEnrollment` | `EDUPAY_AUTHORITATIVE` conditional, derived | Manual/source distinction required | Old enrollment inactive; new active | Resolve by immutable IDs only. |
| `Course.id` | Course external mapping | `EDUPAY_AUTHORITATIVE` conditional | No use until stable ID exists | No update with current ID | Operator/source contract decision. |
| `Course.name` | `Course.label` | `EDUPAY_AUTHORITATIVE` conditional | No ordinary linked-row rename | Apply source rename with evidence | Hold/report conflict. |
| `Course.deletedAt` | `Course.status = ARCHIVED` | `EDUPAY_AUTHORITATIVE` conditional | No hard delete | Archive; inactivate memberships | Absence alone is not tombstone. |
| `AcademicYear` | AcademicYear | `ACADEMICO_AUTHORITATIVE` | Local admin | Source cannot change absent concept | Missing configured year blocks course sync. |
| Guardian | No target Guardian model | `NOT_SYNCED` | N/A | No write | Separate future decision. |
| Teacher/Subject/course teaching relations | Target academic structures | `NOT_SYNCED` | Académico local | No write | No name-based creation. |
| Learning/Submission | Target academic aggregates | `ACADEMICO_AUTHORITATIVE` | Academic rules | Never overwrite/delete | Source ignored. |
| Manual target row | Existing manual record | `MANUAL_ONLY` | Yes | Never auto-link | Explicit future mapping only. |

## Conflict and lifecycle proposal

- A source-linked row is matched only through approved external identity. Manual rows are never fuzzy-matched.
- Source-authoritative changes may update a linked row only with item-level reconciliation/conflict evidence. If current local data differs, the accepted implementation must either apply source-wins-with-evidence or hold for operator review; it must not silently overwrite.
- `ACTIVE` maps to target `ACTIVE`; `INACTIVE` and `GRADUATED` map to target `INACTIVE` because target has no Graduated state. Raw `GRADUATED` should remain in accepted sync evidence/provenance if the final design supports it.
- A source Student course move inactivates the old target CourseEnrollment and activates the new one. Old enrollments, Learning, and Submissions remain.
- A source Course soft deletion archives the target Course and inactivates source-owned enrollments. No hard delete occurs.
- Missing source rows cause lifecycle changes only after a complete successful full reconciliation and an approved absence grace rule. Outages and partial batches preserve the last known state.

## Consequences

Positive:

- Source authority is limited to verified administrative data rather than inferred academic parity.
- Mutable labels, names, RUT, and email are not synchronization identities.
- Local AcademicYear and pedagogical data remain owned by Académico.
- Deactivation preserves historical Learning and Submission evidence.

Costs and unresolved gaps:

- Source must provide stable Course identity and Student no-reuse semantics.
- Full-name transformation into target first/last name requires an owner decision.
- Target Course and relationship provenance is not currently modeled.
- Tenant mapping and conflict evidence require an accepted contract/operational design.

## Acceptance gates

This ADR may become **Accepted** only when the owner review explicitly approves:

1. the field matrix and local-edit conflict rule;
2. the source tenant-to-canonical tenant mapping;
3. Student ID no-reuse and immutable Course ID requirements;
4. full-name representation and Student status mapping;
5. AcademicYear option B and all MVP exclusions;
6. any target provenance/schema changes required before implementation;
7. acceptance tests for duplicate IDs, stale/replayed records, course movement, source status changes, absence, partial failure, outage, cross-tenant access, and preservation of Learning/Submission history.

Until then, D-05 remains **OPEN**, this ADR remains **Proposed**, and no synchronization code may be implemented from it.
