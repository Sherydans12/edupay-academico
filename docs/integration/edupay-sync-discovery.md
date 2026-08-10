# EduPay -> EduPay Académico synchronization discovery

Status: source discovery complete; D-05 and D-06 remain **OPEN**

Decision state: **Proposed**, not accepted. This document is evidence for owner review, not implementation authorization.

Date: 2026-08-10

Proposed decisions: [ADR-0015](../decisions/ADR-0015-edupay-source-of-truth-proposal.md) and [ADR-0016](../decisions/ADR-0016-edupay-sync-strategy-proposal.md)

## Executive finding

The real source is the BaseLogic administrative EduPay repository at `C:\Users\nicol\Documents\EduPay`, GitHub `Sherydans12/BL-002-EduPay`. It is a separate NestJS/Prisma/PostgreSQL system for manual payment administration. Its implementation confirms that Tenant, Course, Guardian, Student, and financial entities exist, but it does **not** provide AcademicYear, grade/level/section fields, enrollment history, Teacher, Subject, CourseSubject, Learning, or Submission entities.

The source has useful administrative lifecycle fields and `updatedAt` timestamps, but its current public routes are offset-paginated CRUD endpoints, not a versioned academic integration API. Existing XLSX exports are administrative exports and the portal API is a guardian/payment interface. No source academic event stream or webhook exists.

The most important identifier correction is that current EduPay `Course.id` values must not be treated as immutable cross-system IDs: source migrations deliberately resequence and rewrite them from course names and grade patterns. Student IDs are better candidates, subject to an explicit no-reuse guarantee. The source tenant key `colegio-conquistadores` is a slug-like string, not the canonical Identity/Académico tenant UUID; a server-controlled tenant mapping is required.

The proposed MVP is a scheduled pull from a new, explicit, versioned source API after the source contract gaps are resolved, with a nightly full reconciliation. A supported export is a fallback only if it becomes a formal tenant-bound contract. Events/webhooks are a future evolution. No synchronization code, worker, cron, webhook, API client, or persistence model is added by this discovery.

## Evidence labels

- **VERIFIED** — directly established from implementation, schema, migration, or existing target contract.
- **PROPOSED** — a recommendation for owner review; not an accepted architecture decision.
- **NOT SUPPORTED BY SOURCE** — the inspected source has no corresponding model/API capability.
- **REQUIRES OWNER DECISION** — evidence is insufficient or a product/security/contract choice is needed.

## Evidence ledger

### Source repository and files inspected

Source checkout: `C:\Users\nicol\Documents\EduPay`.

Source repository: `Sherydans12/BL-002-EduPay`.

Source revision inspected: `d7a8321` (`feat(communications): add tenant email kill switch and previews`). The source worktree was clean before and after read-only inspection.

The following source evidence was inspected:

- `README.md`, `backend/package.json`, `backend/.env.example`, and `frontend/AGENTS.md`.
- `backend/prisma/schema.prisma`.
- All relevant migrations under `backend/prisma/migrations`, especially the initial schema, Student status, multi-tenant, RUT normalization, and Course ID resequencing/alignment migrations.
- `backend/src/courses/courses.controller.ts` and `courses.service.ts`.
- `backend/src/students/students.controller.ts`, DTOs, and `students.service.ts`.
- `backend/src/guardians/guardians.controller.ts` and `guardians.service.ts`.
- `backend/src/tenants/tenants.controller.ts` and `tenants.service.ts`.
- `backend/src/auth`, `tenant`, and Prisma tenant-extension code.
- `backend/src/main.ts`, `app.module.ts`, portal controllers/services, portal API-key middleware, and the Resend webhook controller.
- `backend/scripts/import.ts`, source seed/rescue scripts, and route/module search for sync, outbox, events, and versioning.

Target evidence was also rechecked in:

- `AGENTS.md`, target README and architecture/governance documents.
- `apps/api/prisma/schema.prisma`, Academic Structure migrations, Academic services/controllers, tenant context, and audit port.
- `docs/architecture/edupay-integration.md`, `docs/governance/unresolved-decisions.md`, and the accepted ADR index.

Canonical tenant shape was checked read-only in EduPay Identity: `TenantRealm.id` is a UUID and the JWT `tenant_id` claim is UUID-shaped. No actual mapping for `colegio-conquistadores` was found in the Identity checkout.

### Source capability status

| Capability | Status | Evidence and consequence |
| --- | --- | --- |
| Tenant, Course, Guardian, Student schema | **VERIFIED** | Present in `backend/prisma/schema.prisma`. |
| Student status values | **VERIFIED** | `ACTIVE`, `INACTIVE`, `GRADUATED`. |
| Soft deletion | **VERIFIED** | `deletedAt` exists on Course, Guardian, Student, and financial records; ordinary list queries exclude deleted rows. |
| Source update timestamps | **VERIFIED** | `@updatedAt` exists on Tenant, Course, Guardian, and Student. |
| Academic year, grade, level, section | **NOT SUPPORTED BY SOURCE** | Course has only `name`; no period or structural fields exist. |
| Enrollment entity/history | **NOT SUPPORTED BY SOURCE** | Student has required `courseId`; there is no enrollment table, effective date, or relationship ID. |
| Teacher and Subject | **NOT SUPPORTED BY SOURCE** | No academic Teacher or Subject model/API was found. Email `subject` fields are communications metadata, not subjects. |
| Learning and Submission | **NOT SUPPORTED BY SOURCE** | No corresponding source model or route exists. |
| Versioned academic integration API | **NOT SUPPORTED BY SOURCE** | Global `/api` routes are unversioned; only `/api/v1/portal` is versioned and is for portal guardian/payment operations. |
| Academic change events/outbox | **NOT SUPPORTED BY SOURCE** | No academic outbox/event producer or academic webhook was found. Resend webhook is unrelated. |
| Incremental cursor/`updatedSince` API | **NOT SUPPORTED BY SOURCE** | Current lists use offset `page`/`limit`; no watermark or cursor contract exists. |

## 1. Exact EduPay source inventory

### Source technology and boundary

**VERIFIED:** EduPay is a NestJS 11 and TypeScript backend using Prisma 7 with PostgreSQL 15, Passport/JWT authentication, and a Next.js 16/React 19 administrative frontend. The backend exposes a global `/api` prefix and Swagger documentation at `/api/docs`; Swagger’s `1.0.0` value is documentation metadata, not API versioning. The source is a manual payment-registration administration system with local users, roles, permissions, and tenant scoping.

Admin API requests use source-local JWT authentication. The portal routes use a separate tenant-specific static bearer-key mechanism with `x-tenant-id`; this is an existing Portal integration boundary for guardian/payment statements and Webpay payment synchronization, not an Académico academic-feed contract.

### Tenant

**VERIFIED source fields:** `Tenant.id String`, `name`, unique `slug`, `isActive`, `createdAt`, and `updatedAt`. The seeded primary source tenant uses `id = 'colegio-conquistadores'`, and the seed sets the same value as its slug. The source tenant ID is therefore a string operational key/slug.

**Target implication:** Académico and Identity use a canonical opaque tenant ID; Identity’s inspected `TenantRealm.id` and JWT `tenant_id` are UUIDs. Equality with the EduPay string is not proven and is contradicted by the source/Identity shapes. Use an explicit mapping:

```text
(sourceSystem = EDUPAY, sourceTenantId = "colegio-conquistadores")
    -> canonical ecosystem tenantId
```

This mapping must be server-controlled and audited. A source slug must never be presented as a canonical UUID.

### Course/cohort

**VERIFIED source fields:** `Course.id Int @id @default(autoincrement())`, `tenantId String`, `name String`, `createdAt`, `updatedAt`, and nullable `deletedAt`. The source has a unique `(tenantId, name)` constraint and a tenant index. `Course.name` is the only academic-looking descriptive field.

**Important identifier finding:** source migrations `20260507120000_resequence_course_id_primero_basico`, `20260507140000_compact_course_ids_consecutive`, `20260507150000_align_course_ids_to_grade`, and `20260507160000_medio_course_ids_11_to_14` rewrite Course IDs, including parsing names and assigning grade-based numbers. Current `Course.id` is therefore not safe as an immutable cross-system identity. A future contract must add an immutable public Course ID/UUID or the source owner must explicitly freeze and guarantee the existing IDs; until then, Course synchronization is not implementation-ready.

**Course API behavior:** `POST /api/courses`, `GET /api/courses`, `GET /api/courses/:id`, `PUT /api/courses/:id`, `DELETE /api/courses/:id`, and XLSX export exist. List responses are offset-paginated and include derived active-student and financial values. Delete sets `deletedAt`; ordinary reads omit deleted Courses. The XLSX export includes `id`, `nombre`, a hard-coded `nivel: '—'`, and active student count. It is not a safe academic integration feed.

### Student

**VERIFIED source fields:** `Student.id Int @id @default(autoincrement())`, `tenantId String`, `rut String`, generated `rutNormalized`, `name String`, `status StudentStatus`, `financialSetup`, required `courseId`, required `guardianId`, `createdAt`, `updatedAt`, and nullable `deletedAt`.

`Student.name` is one full-name string. The source schema does **not** contain a Student email, phone, or other Student contact field. Source guardian email/phone fields belong to Guardian, not Student. `rut` is unique within a tenant in the current schema, but RUT is a mutable/sensitive validation attribute and is not the proposed synchronization identity.

`Student.status` is exactly `ACTIVE`, `INACTIVE`, or `GRADUATED`. Student create/list/update endpoints support status and course/guardian changes. Student update writes update `updatedAt` through Prisma. Student delete is a soft delete. Student list/find/export operations include course and/or guardian information and, in some responses, payment/charge-derived financial values; those fields must not be copied into Académico by an academic sync.

**Source API routes:** `POST /api/students`, `GET /api/students`, `GET /api/students/:id`, `PUT /api/students/:id`, `DELETE /api/students/:id`, and XLSX export. The list supports `courseId`, `status`, `search`, `page`, and `limit`; it has no `updatedSince`, cursor, source version, or deleted-tombstone option.

**Previous assumption corrected:** the prior incomplete proposal mentioned a source Student email/contact field. That was wrong and is removed. No proposed synced field may cite Student email because it is **NOT SUPPORTED BY SOURCE**.

### Course enrollment relationship

**VERIFIED source shape:** the current relationship is `Student.courseId -> Course.id`, a required many-to-one current assignment. There is no source `CourseEnrollment` model, relationship ID, status, effective date, enrollment period, or historical movement record.

**Proposed target behavior:** treat the source `Student.courseId` as current-membership input only. A source change from old Course ID to new Course ID should close the old target `CourseEnrollment` (`INACTIVE`) and activate/create the new one, preserving the old relationship and all academic evidence. This is a derived lifecycle projection, not a claim that EduPay owns historical enrollment semantics.

### Guardian/apoderado

**VERIFIED source fields:** `Guardian.id Int`, `tenantId`, optional `rut`, generated `rutNormalized`, `name`, optional `email`, optional `phone`, `createdAt`, `updatedAt`, and nullable `deletedAt`. Students reference one required `guardianId`; Guardian service operations also validate associated student IDs. Guardian list/find/export responses include student associations and financial-derived values.

**Target implication:** current Académico has no Guardian/apoderado model or guardian relationship. Guardian data is not an academic record needed for the MVP and contains PII/financially adjacent response data. Guardian and `Student.guardianId` are therefore **NOT SYNCED BY THE SOURCE MVP**. A future guardian integration would require a separate model, privacy scope, ownership matrix, and contract; it must not be invented here.

### Financial entities

**VERIFIED source entities:** PaymentConcept, PaymentGroup, Payment, Charge, NotificationLog, SentCommunication, TenantEmailConfig, and related administrative User/Role/Permission models exist. They are tenant-scoped and linked to Student or Guardian workflows.

**Proposed boundary:** financial, payment, charge, notification, authentication, role, permission, and credential data are `NOT_SYNCED` to Académico. Payment-linked Student records do not become academic Student fields.

### Structures absent from EduPay

The following were searched in the schema, migrations, modules, controllers, services, and routes and are **NOT SUPPORTED BY SOURCE**:

- `AcademicYear` or any source academic-period entity;
- explicit grade/level or section fields;
- `CourseEnrollment` or enrollment history;
- `Teacher`;
- `Subject`;
- `CourseSubject`;
- learning content;
- submissions or submission history;
- academic events/outbox/change feed.

The existing target models for Teacher, Subject, CourseSubject, StudentSubjectEnrollment, CourseSubjectTeacher, Learning, and Submission must not be populated by parity assumptions.

## 2. Target Academic model and provenance findings

**VERIFIED target models:** `Tenant`, `AcademicYear`, `Course`, `Student`, `Teacher`, `Subject`, `CourseSubject`, `CourseEnrollment`, `StudentSubjectEnrollment`, and `CourseSubjectTeacher` exist in `apps/api/prisma/schema.prisma`, together with Learning and Submission aggregates.

Relevant target gaps:

- `Tenant.id` is tenant-scoped but has no source provenance.
- `AcademicYear` owns UUID identity, label, dates, and lifecycle; it has no source fields.
- `Course` owns UUID identity, `academicYearId`, label, and lifecycle; it has no `source`, `externalSystem`, or `externalId`.
- `Student` has `source` and `externalReference`, unique within tenant, plus `firstName`, `lastName`, `email`, and `ACTIVE`/`INACTIVE` status.
- `Teacher` has similar provenance, but source Teacher is absent.
- Subject/relationship models have no source provenance.
- No target model currently has `externalSystem`, `lastSyncedAt`, or `syncVersion`.

Current Academic API behavior permits local edits to Student first/last name/email/status and Course label/status. The existing audit port has correlation-capable events but does not persist before/after field values. A future implementation therefore needs approved item-level reconciliation/conflict evidence and cannot infer source-vs-local ownership from timestamps alone.

## 3. Stable identifiers and mapping

### Proposed source identity

The general deterministic identity is:

```text
(canonical tenantId, source = "EDUPAY", entityType, immutable source externalId)
```

For the current target Student model, the exact representable candidate is:

```text
Student.tenantId + Student.source = "EDUPAY" + Student.externalReference = String(source Student.id)
```

This is **PROPOSED**, conditional on the source owner adding an explicit guarantee that Student IDs are never reused and on the integration API returning the ID consistently. No Student ID rewrite migration was found, but the source’s autoincrement declaration alone is not a no-reuse contract.

RUT can validate/reconcile a suspected mismatch if the owner approves handling it, but it must not be the primary synchronization key. Names, email, guardian data, and course labels are never automatic identity keys.

### Course identity

`String(source Course.id)` is **not** a safe final Course external reference because source migrations rewrite Course IDs. Course sync requires an immutable source public ID/UUID or an explicit accepted source guarantee that IDs are frozen and never reused. The current target Course also lacks a provenance field, so target-side Course mapping must be designed and accepted before implementation. A source ID may be shown as an operator diagnostic reference only.

### Relationship identity

The current source relationship has no ID. A future source-linked CourseEnrollment needs a deterministic relationship key derived from source Student immutable ID and source Course immutable ID, or a source-issued relationship ID. The target currently has no relationship provenance; do not create an implementation until this gap is reviewed.

## 4. AcademicYear strategy

EduPay has no AcademicYear, year boundary, or source course period. A year must not be parsed from the mutable `Course.name`; source migrations themselves use names to rewrite IDs, and the source export hard-codes `nivel` to `—`.

| Option | Assessment | Status |
| --- | --- | --- |
| A. Configured target AcademicYear per sync source | Safe if the mapping points to an existing target year and is versioned/audited. The source does not own the year. | **PROPOSED** fallback; requires owner decision. |
| B. Local admin creates AcademicYear; source Courses map into it | Preserves Académico’s year lifecycle and avoids source inference. A server-controlled config maps source tenant/course feed to the selected target year; changing years is an explicit administrative action. | **PROPOSED recommendation for MVP.** |
| C. Parse year/grade/section from mutable Course.name | Ambiguous, not represented in source schema, and unsafe as identity or lifecycle data. | **REJECTED proposal.** |

Recommended rule: local Académico administration creates and owns `AcademicYear`; an approved sync configuration selects the target year for a source tenant/feed. No Course is synchronized until a target year mapping exists. Grade/level/section remain absent unless a separate source contract and target model decision adds them.

## 5. D-05 — final proposed source-of-truth matrix

This matrix is **PROPOSED** and remains open for EduPay integration, product, security, and Academic owners. Every source field cited below is an actual inspected schema/API field; absent fields are called out explicitly.

| Source entity/field | Target entity/field | Proposed ownership classification | Local mutation allowed | Source change behavior | Local-difference behavior | Evidence/status |
| --- | --- | --- | --- | --- | --- | --- |
| `Tenant.id`, `Tenant.slug` | Server mapping to canonical `Tenant.id` | `NOT_SYNCED` | No client-controlled mapping | Resolve through audited mapping; do not overwrite canonical ID | Unmapped tenant blocks the run; never guess by name | **VERIFIED** source string key; **REQUIRES OWNER DECISION** mapping. |
| `Tenant.isActive` | Identity/Academic tenant lifecycle | `NOT_SYNCED` | Canonical lifecycle remains local/Identity-owned | Do not deactivate canonical tenant automatically | Require explicit operator review | **VERIFIED** source field; ownership not equivalent. |
| `Student.id` | `Student.source = EDUPAY`, `Student.externalReference` | `EDUPAY_AUTHORITATIVE` conditional | Immutable after link | Never change/reuse mapping | Duplicate/collision quarantined; no fuzzy remap | **VERIFIED** field; **REQUIRES OWNER DECISION** no-reuse guarantee. |
| `Student.name` | `Student.firstName` + `Student.lastName` | `EDUPAY_AUTHORITATIVE` conditional | Local edit requires conflict policy | Apply only after an approved full-name-to-two-fields mapping | Hold/report if split is ambiguous; do not invent a surname | **VERIFIED** one full-name field; **REQUIRES OWNER DECISION** transformation. |
| Student email/contact | `Student.email` | `NOT_SYNCED` | Target email remains local | No source update | No source value exists to compare | **NOT SUPPORTED BY SOURCE**. This corrects the prior incomplete proposal. |
| `Student.rut`, `rutNormalized` | No current target field | `NOT_SYNCED` | N/A | Do not copy in MVP | Use only as a controlled reconciliation attribute if separately approved | **VERIFIED** source; target field absent. |
| `Student.status` | `Student.status` | `EDUPAY_AUTHORITATIVE` conditional | Local override requires a separate accepted policy | `ACTIVE -> ACTIVE`; `INACTIVE -> INACTIVE`; `GRADUATED -> INACTIVE`; `deletedAt != null -> INACTIVE` | Record conflict; a failed/partial run never mass-deactivates | **VERIFIED** source enum and soft delete; target only has active/inactive. |
| `Student.courseId` | `CourseEnrollment.studentId/courseId/status` | `EDUPAY_AUTHORITATIVE` conditional, derived | Manual enrollment needs explicit manual/source distinction | Old active membership becomes `INACTIVE`; new membership becomes `ACTIVE`; no history deletion | If target relationship differs, hold/reconcile by immutable IDs, never labels | **VERIFIED** current assignment; no source enrollment history. |
| `Student.guardianId` | No target Guardian relationship | `NOT_SYNCED` | N/A | No write | Separate future privacy/model decision | **VERIFIED** source; target concept absent. |
| `Student.financialSetup`, payments, charges | No Academic financial field | `NOT_SYNCED` | N/A | No write | Never copy financial state | **VERIFIED** source financial boundary. |
| `Course.id` | Target Course external identity | `EDUPAY_AUTHORITATIVE` only after stable-ID contract | No mapping until target provenance exists | No automatic sync using current ID | Operator mapping/source contract required | **VERIFIED** source ID rewrites; **REQUIRES OWNER DECISION** new immutable ID. |
| `Course.name` | `Course.label` | `EDUPAY_AUTHORITATIVE` conditional for linked Courses | No ordinary rename of source-linked row in MVP proposal | Apply source rename with conflict evidence | Source-linked row requires review/evidence; manual Courses are not label-matched | **VERIFIED** source field; mutable. |
| `Course.deletedAt` | `Course.status = ARCHIVED` | `EDUPAY_AUTHORITATIVE` conditional for source lifecycle | No hard delete | Archive Course and inactivate source-owned enrollments | Missing data alone is not a tombstone | **VERIFIED** soft delete; ordinary API hides it. |
| `Course.createdAt`, `updatedAt` | Sync watermark/evidence | `DERIVED` | No business edit | Use for cursor/version only when source contract defines semantics | Stale source version is ignored/quarantined | **VERIFIED** timestamps; no incremental endpoint. |
| `AcademicYear` | `AcademicYear` | `ACADEMICO_AUTHORITATIVE` | Local admin creates/owns it | Source cannot change it because source concept is absent | Sync blocks if configured target year is missing | **NOT SUPPORTED BY SOURCE**; local target model verified. |
| `Guardian.id`, `rut`, `name`, `email`, `phone`, association | No target Guardian model | `NOT_SYNCED` | N/A | No write in MVP | Future privacy/product decision | **VERIFIED** source; **NOT SYNCED BY MVP**. |
| Teacher | `Teacher` | `NOT_SYNCED` | Académico local only | No write | No automatic creation | **NOT SUPPORTED BY SOURCE**. |
| Subject | `Subject` | `NOT_SYNCED` | Académico local only | No write | No automatic creation | **NOT SUPPORTED BY SOURCE**. |
| CourseSubject / teacher assignments | `CourseSubject`, `CourseSubjectTeacher` | `NOT_SYNCED` | Académico local only | No write | No matching by name | **NOT SUPPORTED BY SOURCE**. |
| Learning and Submissions | Academic aggregates | `ACADEMICO_AUTHORITATIVE` | Current Academic rules | Never overwrite, replace, or hard-delete | Source records are ignored | **NOT SUPPORTED BY SOURCE** and target-owned. |
| Target manual records | `source = MANUAL` or no mapping | `MANUAL_ONLY` | Yes under Academic policy | Never auto-link or overwrite | Explicit future operator mapping only | **VERIFIED** current target behavior. |

### Required local conflict behavior

For a source-linked record, a source-owned field change may update Académico only under an accepted rule and with item-level evidence. If the current local value differs, the synchronizer must report the conflict and either apply the approved source-authoritative value or hold the item for operator resolution. It must never silently choose a record by name, RUT, email, guardian, or course label.

The present target API permits local Student name/status/email and Course label/status edits, but current audit output does not preserve before/after values. A later implementation must therefore add an accepted conflict/provenance/evidence design or choose a review-first policy. This discovery does not add that persistence.

## 6. Student status, course movement, and history

### Status mapping

| EduPay source state | Proposed Academic state | History behavior |
| --- | --- | --- |
| `ACTIVE` | `Student.status = ACTIVE` | Keep source mapping and existing Learning/Submission history. |
| `INACTIVE` | `Student.status = INACTIVE` | Do not delete Student, enrollments, Learning, or Submissions. |
| `GRADUATED` | `Student.status = INACTIVE` | Preserve the source raw status in accepted sync evidence/provenance if available; target has no Graduated enum. |
| `deletedAt != null` | `Student.status = INACTIVE` | Treat as source lifecycle evidence only after a trusted tombstone; never hard-delete target history. |

### Course movement

Because EduPay stores only the current `Student.courseId`, a changed Course ID is a current-membership change, not a historical enrollment event. Proposed target behavior:

1. Resolve the old and new Courses through immutable source mappings.
2. Mark the old active source-owned `CourseEnrollment` `INACTIVE`.
3. Create or activate the new source-owned `CourseEnrollment` `ACTIVE`.
4. Keep the old enrollment row, Learning, Submissions, and audit/reconciliation evidence.
5. If either Course mapping is absent/ambiguous, quarantine the Student item and do not guess.

### Source disappearance

The source’s ordinary list endpoints omit soft-deleted records, so absence is not a tombstone. A future source contract must include deleted records or an explicit deletion feed. A Student/Course may be deactivated/archived for absence only after a complete, successful full reconciliation, with an owner-approved grace rule. A partial batch, timeout, invalid tenant response, or source outage never triggers mass deactivation.

## 7. D-06 — options and recommendation

| Option | Complexity | Reliability/recovery | Load/latency | Deployment coupling | Security | Evidence-specific finding |
| --- | --- | --- | --- | --- | --- | --- |
| A. Scheduled pull from EduPay API | Medium after source contract; bounded async processing | Replayable with cursor/full reconcile; per-item retries | Predictable; eventual consistency | API contract only | Dedicated S2S auth and tenant scope | **PROPOSED MVP.** Existing API must be extended first. |
| B. Scheduled supported export/interface | Low-medium consumer; export operations are a dependency | Replayable batch but weaker tombstone/incremental semantics | Bursty and less fresh | Operational export coupling | Secure delivery, integrity, tenant binding, PII minimization | **Fallback only.** Existing XLSX exports are not this contract. |
| C. Push/webhook/event | High producer and consumer complexity | Requires durable delivery, ordering, replay, DLQ, and backstop | Low latency; source load shifts to event delivery | High producer coupling | Signed, replay-protected tenant-bound delivery | **NOT SUPPORTED BY SOURCE** today. |
| D. Hybrid events + scheduled reconciliation | Highest initial complexity; strongest eventual correctness | Events reduce latency; full reconcile repairs drift | Low latency plus periodic bounded load | Highest | Requires both secure contracts | **PROPOSED future evolution.** |
| Direct database coupling | Appears simple initially | Fragile across migrations/outages; poor replay/audit boundary | Unbounded shared load | Maximal schema/deployment coupling | Expands secrets and tenant exposure | **REJECTED.** Violates target architecture. |

### Recommended MVP mechanism

**PROPOSED:** scheduled pull from a dedicated, versioned, read-only EduPay integration API. This is conditional: the current source API is insufficient, so no implementation should begin until the source-side contract below is accepted and available.

The existing admin CRUD API is not enough because it:

- is globally `/api` and not a versioned integration surface;
- uses source-local admin JWTs rather than a dedicated service-to-service contract;
- uses offset `page`/`limit` rather than a cursor or `updatedSince` watermark;
- excludes soft-deleted records from ordinary lists;
- returns guardian, payment, charge, and derived financial data in some responses;
- has no explicit schema version, stable public Course ID, no-reuse guarantee, or integration freshness contract.

The existing portal API is also not suitable: `/api/v1/portal` is authenticated with tenant-specific static keys and supports guardian lookup/financial statements and Webpay payment sync. It does not provide an Academic roster feed.

### Future evolution

**PROPOSED:** signed source events or webhooks for low-latency changes, backed by scheduled full reconciliation. The source currently has only a Resend delivery webhook and no academic outbox/event producer, so this is future work and not an MVP capability.

## 8. Cadence and source behavior

**VERIFIED source behavior:** records are changed manually through CRUD operations; `updatedAt` exists, but the source exposes no `updatedSince`, cursor, event stream, freshness SLA, change-volume metrics, or rate-limit contract. Therefore real-time synchronization is not justified by evidence.

**PROPOSED initial cadence, subject to owner approval:**

- hourly incremental pull during the agreed operational window once a cursor/watermark API exists;
- nightly complete tenant reconciliation in an agreed low-load window;
- bounded operator-triggered full run for onboarding/recovery;
- exponential backoff for temporary source unavailability;
- no deactivation based on failed, partial, stale, or tenant-ambiguous responses.

The exact cadence remains **REQUIRES OWNER DECISION** because source volume, manual change frequency, rate limits, and acceptable freshness were not implemented as measurable source contracts. The evidence supports eventual consistency and scheduled operation, not a real-time promise.

## 9. Idempotency and stale-update protection

### Deterministic identity

For Students, the proposed key is:

```text
(canonicalTenantId, source = "EDUPAY", entityType = "Student", externalId = String(Student.id))
```

For Courses, use a new immutable source public ID/UUID and a future approved target provenance mapping. Do not use the current mutable/resequenced Course integer ID as final identity.

For CourseEnrollment, use a source-issued relationship ID if one is added, otherwise a deterministic pair of immutable Student and Course external IDs. The target currently lacks relationship provenance; this must be accepted before implementation.

### Upsert and retry rules

- One tenant and entity type are resolved before processing any item.
- Existing external key: compare source version; update only when newer, count unchanged when equal, ignore/quarantine when older.
- Replayed pages or runs are safe because upsert identity is deterministic and independent of display values.
- Duplicate source IDs within one tenant/entity type are quarantined; no arbitrary winner is selected.
- The same numeric ID across Student and Course is allowed only because entity type namespaces are distinct.
- Cross-tenant source records are rejected; a client-provided tenant value is never trusted.
- Per-item success/failure allows a partial batch to be retried without duplicating successful rows.
- A source outage leaves last known state unchanged.

### Watermark requirements

`updatedAt` is present in source models, but current endpoints do not expose safe incremental semantics. A source integration API must define either an opaque cursor or a deterministic `(updatedAt, immutableId)` order, plus an `updatedSince`/resume contract, page bounds, schema version, and behavior for equal timestamps. It must include soft-delete tombstones or a deletion feed.

## 10. Reconciliation and observability

**PROPOSED minimum evidence, with no models added in this branch:**

### Sync run

- run ID, source system, canonical tenant, mode (`incremental`, `full`, `operator recovery`), trigger, correlation ID;
- start/end time, status (`SUCCEEDED`, `PARTIAL`, `FAILED`, `SOURCE_UNAVAILABLE`), source API/schema version;
- source cursor/watermark where supplied, last successful sync, and safe request/response timing metadata;
- counts: `seen`, `created`, `updated`, `unchanged`, `deactivated`, `failed`.

### Sync item result

- entity type, source external ID, target ID when known, item result, source version, retryability, conflict code, and redacted error evidence;
- no raw credentials, tokens, payment data, or unnecessary PII;
- duplicate IDs, invalid tenant mappings, stale updates, missing Course mappings, and ambiguous full-name transforms are explicit error/conflict categories.

A full reconciliation is the only proposed trigger for absence-based lifecycle changes. It must not mark unseen records inactive when the source response is incomplete or untrusted.

## 11. Required source API changes before implementation

**PROPOSED minimal source-side contract:**

1. Add a dedicated read-only namespace such as `/api/v1/integrations/academico`; do not reuse admin CRUD or payment portal routes.
2. Authenticate with a source-approved service-to-service mechanism and keep credentials in secret custody. The existing portal static key mechanism must not be copied by assumption.
3. Resolve tenant scope from server-validated configuration and return the source tenant key in every response; never rely on an untrusted payload tenant.
4. Add an immutable, never-reused public Course ID/UUID. Add an explicit no-reuse guarantee for Student IDs or expose a replacement immutable Student public ID.
5. Provide sparse academic payloads, excluding payments, charges, authentication, roles, guardian PII, and derived financial totals. Minimum proposed fields:

   - Course: source tenant key, immutable public ID, `name`, `createdAt`, `updatedAt`, `deletedAt`;
   - Student: source tenant key, immutable ID, `name`, optionally `rut` only after privacy approval, `status`, current `courseId`/Course public ID, `createdAt`, `updatedAt`, `deletedAt`.

6. Provide bounded pagination with an opaque cursor or deterministic `(updatedAt, immutableId)` ordering, an incremental watermark, schema version, and complete-snapshot mode.
7. Include soft-delete tombstones or a supported deletion feed. Define retention for tombstones and behavior for records deleted between pages.
8. Define rate limits, timeout expectations, error codes, freshness expectations, and tenant authorization. No source data change events are required for the MVP.

Guardian should remain outside this MVP contract. If later included, it needs a separate PII/privacy decision and explicit target model.

## 12. Security requirements

- Source admin JWT and portal bearer keys are not automatically suitable Académico integration credentials.
- Store any dedicated source credential in the approved server-side secret manager; never place it in this repository’s docs, client bundles, fixtures, or logs.
- Use a server-controlled source-tenant-to-canonical-tenant mapping and revalidate tenant scope for every page and asynchronous run.
- Apply connection timeout, bounded retry, backoff/circuit-breaker, concurrency/page limits, and source rate limits.
- Minimize PII: Student name is the only required personal attribute in the proposed sparse feed; RUT is conditional and Guardian contact data is excluded.
- Never copy payment/charge data, credentials, JWTs, API keys, raw payloads, or sensitive contact data into Academic logs.
- Redact names, RUT, email, phone, tokens, and authorization headers; log opaque IDs, counts, correlation IDs, and bounded error codes.
- Define audit access and retention for SyncRun/item evidence before implementation.

## 13. Explicit MVP exclusions

The following must **NOT** synchronize in this MVP:

- Guardian records or `Student.guardianId`;
- Teacher;
- Subject;
- CourseSubject, StudentSubjectEnrollment, CourseSubjectTeacher;
- AcademicYear as a source-owned entity (the target year is local/configured);
- Learning and Submissions;
- payments, charges, financial setup, notifications, users, roles, permissions, credentials, and any financial totals;
- direct database access;
- source-to-target matching by name, RUT, email, guardian, or mutable Course label;
- hard deletion of Academic records.

## 14. Owner decisions still required

1. Approve D-05 field ownership, especially source authority for linked Student names/status, Course label/status, and current course membership.
2. Decide how a source single full-name `Student.name` is safely represented by target `firstName`/`lastName`; do not split heuristically without approval.
3. Require and approve an immutable Course public ID and Student ID no-reuse guarantee.
4. Provide the actual mapping from source tenant key `colegio-conquistadores` to the canonical ecosystem tenant UUID.
5. Choose and approve the AcademicYear mapping, with option B (local target AcademicYear + configured source mapping) recommended.
6. Approve that Guardian, Teacher, Subject, CourseSubject, Learning, Submissions, and financial data are out of the MVP.
7. Approve the dedicated source API contract, authentication mechanism, tenant scoping, sparse payload, tombstones, pagination/cursor, schema version, rate limits, and error semantics.
8. Approve the initial hourly incremental/nightly full cadence after source volume and freshness are measured.
9. Decide whether source-authoritative local conflicts are source-wins-with-evidence or review-first, and where before/after evidence is retained.
10. Approve the absence grace rule before any unseen record is deactivated/archived; two consecutive complete full reconciliations is a proposal, not a decision.
11. Approve target provenance requirements for Course, AcademicYear mapping, and CourseEnrollment before implementation.

## 15. Conclusion and decision state

The source inspection materially changes the prior incomplete discovery: the source is available and confirms Student, Course, Guardian, tenant, status, soft deletion, and timestamps, but it does not provide Student email, academic year, structural course fields, enrollment history, Teacher, Subject, or an academic integration surface. Current Course IDs are not safe immutable keys.

The recommended path is a separate, versioned, sparse, tenant-bound source API plus scheduled pull and full reconciliation. This remains a proposal. D-05 and D-06 remain **OPEN** until the named owners review and explicitly accept the ADRs and the source/target contract. No synchronization implementation is authorized by this document.
