# ADR-0015: EduPay source-of-truth proposal for Académico synchronization

Status: **Proposed**; D-05 remains open

Date: 2026-08-10

Owners to approve: EduPay integration owner, Academic product owner, security owner

Related: [Synchronization discovery](../integration/edupay-sync-discovery.md), [ADR-0004](ADR-0004-edupay-sync-contract.md)

## Context

EduPay Académico must be able to receive selected academic records without sharing EduPay persistence or overwriting local academic work. The target already supports manual Student and Course administration. Student and Teacher have `source` and `externalReference`; the other academic aggregates do not yet have source provenance fields.

The requested read-only EduPay checkout at `C:\Users\nicol\Documents\EduPay` was absent during discovery. Consequently, the source entities, fields, identifiers, tenant IDs, timestamps, and current mutation semantics were not verified. This ADR is a decision proposal with explicit evidence gates, not an accepted source-of-truth decision.

## Proposal

Subject to source verification and owner approval:

1. Use EduPay as authoritative only for source-linked fields that the source contract proves it owns. The proposed default is source authority for Student names, Student lifecycle, Course identity/label/lifecycle, and source-owned enrollment membership.
2. Treat Student email/contact as initial-only by default: populate an empty target value during initial linking, then preserve later local edits and report source changes as reconciliation conflicts.
3. Keep RUT, guardian relationships, subjects, teachers, and other concepts `NOT_SYNCED` until source existence, target modeling, privacy, and ownership are separately approved. Do not create parity from names alone.
4. Keep manual records `MANUAL_ONLY` unless an operator explicitly maps them to a stable source record. Never match by display name, RUT, email, grade/section label, or other mutable value.
5. Keep Learning and Submission content `ACADEMICO_AUTHORITATIVE`; synchronization must never overwrite or delete it.
6. Use the immutable source ID as the external key. For current Student/Teacher persistence, the key is `(tenantId, source, externalReference)` with `source = EDUPAY`; future Course, AcademicYear, and relationship mappings require explicit target provenance decisions.
7. Resolve the source institution through a server-controlled `(sourceSystem, sourceTenantId) -> canonical ecosystem tenantId` mapping. Do not assume source and canonical IDs are compatible.
8. Use lifecycle transitions, not hard deletion, for source deactivation or confirmed disappearance. Preserve source mappings, enrollments, Learning data, Submission data, and audit/reconciliation evidence.

The complete field-level proposal and local-edit rules are maintained in the linked discovery document.

## Field ownership summary

| Target area | Proposed owner | Proposed mutation behavior |
| --- | --- | --- |
| Student source identity | EduPay | Immutable after mapping; collisions are quarantined. |
| Student first/last name on source-linked rows | EduPay | Source change may update target with conflict evidence; no fuzzy local merge. |
| Student email/contact | Initial EduPay value, then local | Source does not overwrite a later local value; report conflict. |
| Student status | EduPay for source-linked rows | Transition active/inactive; no deletion; local override requires an explicit future policy. |
| Course source identity, label, status | EduPay for source-linked rows | Preserve target internal ID; apply source changes under accepted conflict evidence. |
| Student-to-course membership | EduPay only if source relationship is proven | Close old relationship and create/activate the new one; preserve history. |
| RUT, guardians, subjects, teachers, unmodeled course structure | Unresolved / not synced | No write until a separate evidence and scope decision. |
| Manual Student/Course records | Académico | Remain editable and are not auto-matched. |
| Learning and Submission content/evidence | Académico | Never overwritten or hard-deleted by sync. |

## Consequences

Positive:

- Mutable display values are not synchronization keys.
- Manual academic setup remains possible when source data is absent or unavailable.
- Source-linked records can be reconciled without sharing databases or silently destroying history.
- Tenant mapping and source authority are explicit integration concerns.

Costs and gaps:

- Current target provenance is incomplete for Course, AcademicYear, and relationships.
- Current audit logging has no before/after field history; accepted source-authoritative overwrites require item-level reconciliation evidence or an explicit future conflict mechanism.
- The source contract must define stable IDs, status semantics, ownership, and tenant mapping before implementation.

## Acceptance gates

This ADR may become Accepted only after:

- the EduPay source checkout or an owner-approved source contract is available for inspection;
- exact entities/fields, stable IDs, tenant IDs, status/deletion semantics, and timestamps/cursors are documented;
- the field matrix and local-edit conflict rules are approved by the named owners;
- target provenance gaps are resolved by a separate reviewed schema/contract change if needed;
- acceptance tests cover positive, negative, stale/replayed, duplicate, partial-failure, deactivation, and cross-tenant cases.

Until then, D-05 remains **OPEN** and no synchronization code may be implemented from this proposal alone.
