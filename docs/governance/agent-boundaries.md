# Recommended parallel agent boundaries

Status: proposed coordination model for subsequent coding agents

The repository was empty at the architecture baseline. Parallel agents should work behind explicit contracts and avoid editing the same foundational files until the bootstrap owner merges the shape.

## Agent A — repository/platform foundation

Owns monorepo layout, package conventions, shared configuration, environment validation, CI, local development, observability primitives, and migration workflow.

**Depends on:** approved documentation.  
**Must publish:** repository contract, run commands, environment schema, CI gates.

## Agent B — EduPay Identity adapter

Owns the application-side Identity client/adapter, JWKS/JWT validation, canonical tenant and membership context, high-risk session-status check, invitation integration boundary, and authentication audit correlation. It does not own academic records, Identity credentials, or refresh tokens, and it does not change existing EduPay admin login behavior.

**Depends on:** the reconciled Identity contract in [ADR-0009](../decisions/ADR-0009-identity-contract-reconciliation.md) and the approved Identity repository contract.
**Must publish:** adapter contract, fake provider, failure semantics, integration tests.

## Agent C — tenancy and authorization foundation

Owns request-scoped canonical tenant context, authorization policy primitives, tenant-scoped repositories/constraints, explicit elevated support context, and cross-tenant test fixtures. It must not treat a client `tenantId` as authorization context.

**Depends on:** Agent A and Agent B contracts.  
**Must publish:** rules for every tenant-owned access path and negative test helpers.

## Agent D — academic domain

Owns academic years, courses, students, teachers, the reusable Subject catalog,
CourseSubject offerings, course enrollment, CourseSubject default configuration,
direct StudentSubjectEnrollment targeting CourseSubject, CourseSubjectTeacher
assignments, manual administration, and external-reference seams.

**Depends on:** tenant/authorization foundation.  
**Must not:** invent synchronization semantics or learning/submission tables.

## Agent E — learning domain and teacher authoring

Owns CourseSubject learning units, typed learning items, publication/lifecycle
behavior, ordering, and teacher authoring APIs/UI. It must not attach learning
content directly to the reusable Subject catalog.

**Depends on:** academic domain and [ADR-0012](../decisions/ADR-0012-learning-publication-and-edit-semantics.md).
**Must not:** implement submission state before ADR-0006 is accepted.

## Agent F — student workspace and design system

Owns responsive student navigation, content presentation, component foundations, tenant theme tokens, accessibility states, and UI integration against mocked/contract APIs.

**Depends on:** API contracts and approved design inputs.  
**Must not:** encode Colegio Conquistadores as component logic.

## Agent G — file storage and submissions

Owns storage abstraction, upload/download authorization, file metadata, submission/revision workflow, deadline/late calculation, reviews, comments, and change requests.

**Depends on:** learning item contract, file policy, ADR-0006, tenant/authorization foundation.  
**Must publish:** failure/retry behavior and end-to-end submission evidence.

## Agent H — notifications and integration

Owns notification intents/outbox, in-app notifications, Resend adapter, delivery retries, and explicit EduPay sync adapter/reconciliation tooling.

**Depends on:** event catalog, queue decision, EduPay contract, and domain event shapes.  
**Must not:** read EduPay tables directly or make email delivery part of core academic transactions.

## Agent I — security, audit, and quality validation

Owns threat-model checks, audit coverage, tenant-isolation test matrix, dependency/secret checks, accessibility/performance checks, and release evidence.

**Depends on:** each boundary as it becomes available.  
**Must publish:** actionable findings and release gates, not only a coverage number.

## Coordination rules

- One owner per contract and schema boundary.
- Shared types are changed through a reviewed contract, not opportunistic edits.
- Every agent includes tenant-negative tests when touching a tenant-owned path.
- Agents may use mocks/fakes before dependent providers exist, but must not silently change provider semantics.
- No agent adds out-of-scope entities or UI without a product decision and ADR.
