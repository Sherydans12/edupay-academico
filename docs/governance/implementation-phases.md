# Proposed implementation phases

Status: proposed work decomposition; application code intentionally not started

## Phase 0 — architecture approval and repository bootstrap

Own the future monorepo layout, coding conventions, environment contract, CI quality gates, ADR process, and the reconciled Identity/API/integration contracts. Do not start domain features until the 10-minute Identity JWT, canonical tenant context, membership switching, and tenant-isolation boundaries are testable.

## Phase 1 — identity adapter and tenant guardrails

Build the narrow application boundary to EduPay Identity, JWKS/JWT validation, membership/role context, request-scoped canonical tenant resolution, authorization foundations, high-risk session-status checks, audit correlation, and isolation fixtures. Deliver no broad academic UI in this phase.

## Phase 2 — academic structure

Implement academic years, courses, students, teachers, subjects, enrollment, default subjects, direct subject enrollment, multiple teachers, and manual administration. Include external-reference seams but do not invent an unapproved sync contract.

## Phase 3 — learning authoring and access

Implement learning units, typed learning items, attachments, ordering, draft/published/archived behavior, teacher authoring, and student navigation. Integrate tenant theme tokens through the design-system boundary.

## Phase 4 — submissions and review

Implement the approved submission/revision model, private file flows, deadline/late rules, teacher reviews, comments, change requests, resubmissions, audit events, and responsive upload/review UX.

## Phase 5 — notifications and EduPay synchronization

Implement the approved outbox/worker path, in-app notifications, Resend adapter, delivery observability, and the explicit student/course synchronization contract. Keep sync failure independent from manual academic operations.

## Phase 6 — hardening and pilot

Complete security, accessibility, performance, migration, backup/restore, incident, support, observability, and tenant-isolation evidence. Load sanitized Colegio Conquistadores pilot data and run the full end-to-end acceptance path.

## Sequencing constraints

- Identity and tenant context precede tenant-owned domain writes.
- Academic structure precedes learning authoring.
- Learning item and file contracts precede submissions.
- Submission semantics precede notifications for submission/review events.
- Hosting and recovery decisions precede production pilot.
