# EduPay integration

Status: accepted boundary implemented for the Course/Student roster MVP

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

The tenant mapping must resolve the source institution to the canonical ecosystem tenant ID. A source-system identifier, client-provided tenant selector, or synchronized academic record is never proof of Identity membership or authorization.

Internal IDs remain the only IDs used by the academic API and UI.

## Synchronization mode

The accepted MVP uses scheduled pull from the dedicated schema-v1 EduPay
integration API: hourly incremental feeds, nightly source-confirmed full
reconciliation, and bounded operator runs. Manual creation remains available.
Push/events remain a future evolution and full reconciliation remains the
correctness backstop. Implementation details and operations are documented in
[EduPay roster synchronization consumer](../integration/edupay-sync-implementation.md).

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

Synchronization may create or update only the accepted Course, Student, and
source-owned current CourseEnrollment projection. It cannot silently create
Identity links; Student/Teacher ↔ IdentityUser linking remains an explicit
Académico-initiated operation through the restricted Identity contract.
