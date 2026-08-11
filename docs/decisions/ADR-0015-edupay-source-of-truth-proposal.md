# ADR-0015: EduPay source-of-truth decision

Status: **Accepted**; D-05 resolved 2026-08-11

Date: 2026-08-11

Approved by: EduPay integration owner, Académico product/domain owner, security/privacy owner

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

Owner review accepted the ownership rules below. Acceptance resolves D-05 as an architectural/product decision; it does not claim that the required EduPay integration API or synchronization implementation exists.

## Source facts

| Source entity/field | Verified behavior | Target implication |
| --- | --- | --- |
| `Tenant.id`, `slug`, `isActive` | String ID; seeded value `colegio-conquistadores`; source-local tenant scope | Server-controlled source-to-canonical tenant mapping; no ID equality assumption. |
| `Course.id`, `tenantId`, `name`, timestamps, `deletedAt` | Integer ID; name is the only current course descriptor; ID-rewriting migrations exist; delete is soft | Current ID is not integration identity; accepted contract adds/backfills immutable `Course.integrationId`; year/grade/section cannot be inferred. |
| `Student.id`, `tenantId`, `rut`, `name`, `status`, `courseId`, `guardianId`, timestamps, `deletedAt` | Integer ID, legacy full name, status `ACTIVE`/`INACTIVE`/`GRADUATED`, current course/guardian links, soft delete | Current ID/name are not sync identity/projection; accepted contract adds/backfills `Student.integrationId`, `firstName`, and `lastName`. |
| `Guardian.id`, `tenantId`, `rut?`, `name`, `email?`, `phone?`, student association | Real upstream entity; RUT nullable; association is relevant to administration | No Académico Guardian model; exclude from MVP pending separate privacy/domain decision. |
| Payment/Charge/financial records | Real tenant-scoped administrative entities linked to students | `NOT_SYNCED`; financial ownership remains in EduPay. |
| Teacher, Subject, AcademicYear, enrollment history, Learning, Submission | No source model/API found | Do not invent parity or auto-create target records. |

The current source schema does not yet contain the accepted `integrationId`, structured Student name, or dedicated API fields. Those are source implementation prerequisites defined by this accepted ADR, not claims about the current source checkout.

## Accepted decision

### 1. Administrative source authority

For source-linked `source = EDUPAY` records, EduPay is authoritative for the administrative facts defined by the supported integration contract:

- Student `integrationId`;
- Student `firstName` and `lastName`;
- Student administrative status;
- Student current Course assignment, projected into target CourseEnrollment lifecycle;
- Course `integrationId`;
- Course display name and active/deleted lifecycle.

EduPay is not authoritative for target-only pedagogical data, target AcademicYear lifecycle, or any entity outside the approved MVP scope.

### 2. Académico authority

Académico is authoritative for:

- AcademicYear creation, dates, label, and lifecycle, with a local AcademicYear explicitly selected in Sync configuration;
- Subject, CourseSubject, teacher assignments, learning content, and submissions;
- academic history and evidence retention;
- manual records that have no explicit EduPay mapping.

Synchronization must never overwrite or hard-delete Learning or Submission data. A source Student/Course deactivation changes lifecycle state only and preserves historical academic records.

### 3. Fields excluded from the MVP

The following are explicitly `NOT_SYNCED` for the MVP:

- Guardian and `Student.guardianId`;
- source RUT (target has no RUT field; it may be a controlled reconciliation attribute only if separately approved);
- Student email/contact (no source Student field exists);
- Teacher, Subject, CourseSubject, StudentSubjectEnrollment, CourseSubjectTeacher;
- AcademicYear as a source-owned entity;
- payments, charges, financial setup, notification, authentication, role, and permission data;
- Learning and Submissions as target-owned aggregates.

### 4. Stable identity contract

For Student, use:

```text
(canonicalTenantId, source = "EDUPAY", entityType, externalId = source integrationId)
```

EduPay must add and backfill `Course.integrationId` and `Student.integrationId` as generated UUIDs. They are immutable, never reused, exposed by the dedicated integration API, and become Académico `externalReference` values. The current target Student representation is `source = EDUPAY` plus `externalReference`; implementation may add equivalent tenant-safe provenance to Course and CourseEnrollment as approved by this decision.

The current mutable/resequenced EduPay `Course.id` is not an integration identity. RUT, name, email, Guardian, and Course label are never synchronization keys.

Existing source records without a valid integration ID are source-data conflicts and must not be silently matched or guessed.

### 5. Tenant mapping

Do not treat `colegio-conquistadores` as the canonical ecosystem tenant ID. Resolve this source key through an audited server-side mapping:

```text
(EDUPAY, "colegio-conquistadores") -> canonical Identity/Académico tenant UUID
```

No client-provided tenant field can authorize a read or write. An unmapped or ambiguous tenant blocks the run.

### 6. AcademicYear mapping

EduPay has no AcademicYear or period. A local Académico admin creates the target AcademicYear, and Sync configuration explicitly selects that local year for the source tenant/feed. Parsing a year, grade, or section from mutable Course names is rejected.

## Accepted field-level matrix

| Source field/entity | Target field/entity | Ownership | Local mutation | Source change | Local difference |
| --- | --- | --- | --- | --- | --- |
| `Tenant.id`/`slug` | Tenant mapping config -> canonical Tenant | `NOT_SYNCED` | No client control | Resolve mapping only | Unmapped blocks sync. |
| `Student.integrationId` | `Student.source`/`externalReference` | `EDUPAY_AUTHORITATIVE` | Immutable | Never remap | Duplicate/collision quarantine. |
| `Student.firstName` | `Student.firstName` | `EDUPAY_AUTHORITATIVE` | Ordinary UI/API mutation prohibited | Apply source value | Any local divergence is an integrity/conflict result; no competing override. |
| `Student.lastName` | `Student.lastName` | `EDUPAY_AUTHORITATIVE` | Ordinary UI/API mutation prohibited | Apply source value | Any local divergence is an integrity/conflict result; no competing override. |
| Legacy `Student.name` | No target field | `NOT_SYNCED` | Local source compatibility only | Do not parse/split | Missing validated structured names are source-data conflicts. |
| Student email/contact | `Student.email` | `NOT_SYNCED` | Local only | No source field | No comparison. |
| `Student.rut` | No target field | `NOT_SYNCED` | N/A | No write | Optional controlled reconciliation only after approval. |
| `Student.status` | `Student.status` | `EDUPAY_AUTHORITATIVE` | Ordinary UI/API mutation prohibited | `ACTIVE->ACTIVE`; `INACTIVE`/`GRADUATED`/trusted deletion -> `INACTIVE` | Any local divergence is an integrity/conflict result; no competing override. |
| Current `Student.courseId` | `CourseEnrollment` | `EDUPAY_AUTHORITATIVE`, derived | Ordinary UI/API mutation prohibited for source-owned enrollment | Old enrollment inactive; new active | Resolve by immutable integration IDs only. |
| `Course.integrationId` | Course provenance / `externalReference` | `EDUPAY_AUTHORITATIVE` | Immutable | Never remap | Duplicate/collision quarantine. |
| `Course.name` | `Course.label` | `EDUPAY_AUTHORITATIVE` | Ordinary UI/API mutation prohibited | Apply source rename | Any local divergence is an integrity/conflict result; no competing override. |
| `Course.deletedAt` | `Course.status = ARCHIVED` | `EDUPAY_AUTHORITATIVE` | No hard delete | Explicit tombstone archives; two-full-run absence may archive | Simple response absence is not sufficient. |
| `AcademicYear` | AcademicYear selected by Sync configuration | `ACADEMICO_AUTHORITATIVE` | Local admin owns lifecycle | Source cannot change absent concept | Missing configured year blocks Course sync. |
| Guardian | No target Guardian model | `NOT_SYNCED` | N/A | No write | Separate future decision. |
| Teacher/Subject/course teaching relations | Target academic structures | `NOT_SYNCED` | Académico local | No write | No name-based creation. |
| Learning/Submission | Target academic aggregates | `ACADEMICO_AUTHORITATIVE` | Academic rules | Never overwrite/delete | Source ignored. |
| Manual target row | Existing manual record | `MANUAL_ONLY` | Yes | Never auto-link | Explicit future mapping only. |

## Conflict and lifecycle rules

- A source-linked row is matched only through approved external identity. Manual rows are never fuzzy-matched.
- Normal Académico UI/API must not mutate source-owned fields on `source = EDUPAY` rows. The MVP has no competing local override. Any divergence found by synchronization is an integrity/conflict result; the source remains authoritative and the item is not silently reconciled through a guessed local value.
- `ACTIVE` maps to target `ACTIVE`; `INACTIVE` and `GRADUATED` map to target `INACTIVE` because target has no Graduated state. Raw `GRADUATED` should remain in accepted sync evidence/provenance if the final design supports it.
- A source Student course move inactivates the old target CourseEnrollment and activates the new one. Old enrollments, Learning, and Submissions remain.
- A source Course soft deletion archives the target Course and inactivates source-owned enrollments. No hard delete occurs.
- An explicit trusted tombstone applies the lifecycle change immediately. Simple absence is sufficient only after two consecutive complete successful full reconciliations. Outages and partial/failed batches preserve the last known state.

## Consequences

Positive:

- Source authority is limited to verified administrative data rather than inferred academic parity.
- Mutable labels, names, RUT, and email are not synchronization identities.
- Local AcademicYear and pedagogical data remain owned by Académico.
- Deactivation preserves historical Learning and Submission evidence.

Implementation prerequisites:

- EduPay must add/backfill immutable `Course.integrationId` and `Student.integrationId`, structured `firstName`/`lastName`, and the dedicated integration API.
- Target Course and CourseEnrollment provenance may be added during implementation using the approved tenant-safe model.
- The source tenant mapping and selected local AcademicYear must be configured before a run.
- SyncRun/item evidence and operational alerting remain implementation work.

## Implementation gates

This ADR is **Accepted**. Synchronization implementation remains gated on:

1. source-generated, immutable, never-reused `Course.integrationId` and `Student.integrationId`, with existing-record backfill;
2. validated structured `firstName`/`lastName` in the source feed; legacy-only names become source-data conflicts;
3. the dedicated source API contract and tenant-scoped authentication;
4. configured source-tenant-to-canonical-tenant mapping and local AcademicYear selection;
5. approved target provenance for Course and CourseEnrollment;
6. acceptance tests for duplicate IDs, stale/replayed records, course movement, status changes, tombstones, two-run absence, partial failure, outage, cross-tenant access, and preservation of Learning/Submission history.

These are delivery prerequisites, not unresolved D-05 ownership decisions.
