# EduPay integration

Status: mandated separation with contract details unresolved

## Boundary rule

EduPay Académico must not share EduPay database tables directly. Integration happens through explicit APIs or synchronization mechanisms. The academic service owns its own persistence and can continue operating with manual creation where synchronization is unavailable.

## Initial integration scope

The MVP may synchronize:

- students;
- courses;
- optionally academic-year context if the source contract supports it.

Financial information is not part of EduPay Académico. Teacher, subject, enrollment, and learning data should not be assumed to exist in the current EduPay source without a separate contract.

## Proposed reference model

For synchronized records, store an explicit external reference containing:

- source system identifier;
- source entity type;
- external record ID;
- tenant mapping;
- last successful sync time;
- synchronization status/error summary;
- optional source version or updated timestamp.

Internal IDs remain the only IDs used by the academic API and UI.

## Candidate synchronization modes

1. **Pull**: academic service periodically reads an EduPay API.
2. **Push**: EduPay sends signed change events or batches.
3. **Reconciliation**: an operator starts a bounded import and reviews conflicts.

The first implementation should choose the smallest mode supported reliably by the existing EduPay platform. Manual creation remains available for the agreed records.

## Consistency and conflict rules

- Sync is eventually consistent; the UI should show a meaningful status when relevant.
- Upserts are idempotent by source plus external ID.
- Missing source records should be marked inactive or pending review, not immediately hard-deleted.
- Field ownership must be explicit: source-owned fields cannot be overwritten by manual edits unless a reconciliation rule says so.
- A sync failure must not roll back unrelated academic work.
- Cross-tenant external IDs must be rejected or mapped through an explicit tenant mapping.

## Integration security

- Use service credentials or signed callbacks managed outside application code.
- Validate issuer, audience, signature, replay protection, and payload schema.
- Never accept a client-provided source-system record as proof of tenant membership.
- Log sync runs, counts, failures, and correlation identifiers without logging unnecessary student data.

## Unresolved decisions

- Existing EduPay API availability, authentication, and contract owner.
- Pull versus push versus operator-led reconciliation.
- Source of truth for each student/course field.
- Tenant mapping between current EduPay institutions and new tenants.
- Initial sync frequency and expected data volume.
- Whether a sync can create Identity links or only academic records.
