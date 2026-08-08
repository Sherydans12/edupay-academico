# EduPay Académico documentation

Status: reconciled architecture baseline for implementation bootstrap
Repository state at baseline: empty; no application code, schema, tests, or prior documentation were found.

This documentation governs the first implementation phase of EduPay Académico. It separates product scope from architectural constraints, records the approved Identity integration contract, and keeps later unresolved choices explicit instead of hiding them in code.

## Reading order

1. [Product vision](product/vision.md)
2. [MVP scope](product/mvp-scope.md)
3. [System context](architecture/system-context.md)
4. [Domain model](architecture/domain-model.md)
5. [Multitenancy](architecture/multitenancy.md)
6. [Identity model](architecture/identity-model.md) and [roles and authorization](architecture/roles-and-authorization.md)
7. [Academic model](architecture/academic-model.md), [learning model](architecture/learning-model.md), and [submissions workflow](architecture/submissions-workflow.md)
8. [Cross-cutting architecture](architecture/file-storage.md), [notifications](architecture/notifications.md), [EduPay integration](architecture/edupay-integration.md), and [API conventions](architecture/api-conventions.md)
9. [Frontend architecture](architecture/frontend-architecture.md) and [design system](architecture/design-system.md)
10. [Security](architecture/security.md), [audit strategy](architecture/audit-strategy.md), [testing strategy](architecture/testing-strategy.md), [deployment](architecture/deployment.md), and [definition of done](architecture/definition-of-done.md)
11. [Roadmap](product/roadmap.md), [unresolved decisions](governance/unresolved-decisions.md), [risks](governance/risks.md), [implementation phases](governance/implementation-phases.md), and [agent boundaries](governance/agent-boundaries.md)

## Implementation notes

- [Platform bootstrap](governance/platform-bootstrap.md) records the Phase 0
  package-manager, workspace, quality-gate, and application-shell choices.
- [Tenancy and authorization foundation](governance/tenancy-authorization-foundation.md)
  records the implemented Identity consumer, request tenant context, policy,
  repository-scope, and future job-context guardrails.

## Documentation conventions

- **Mandated** means directly required by the project brief and should be treated as a constraint.
- **Proposed** means a recommended default that still needs owner approval before implementation.
- **Unresolved** means the implementation must not assume an answer without an explicit decision.
- Every change that materially alters a boundary, ownership model, security property, or user-visible workflow should update the relevant document and add or amend an ADR.
- Domain names in this documentation are canonical. UI labels may be localized, but they should map back to these terms.

## Canonical terms

- **Tenant**: an institution or organization using EduPay Académico.
- **Canonical ecosystem tenant ID**: one stable opaque tenant identifier used by Identity `TenantRealm`, the Académico tenant record, and future ecosystem services. Services own separate tenant records and databases; the identifier is an integration value, not a shared foreign key.
- **Identity user**: a person managed by EduPay Identity.
- **Student / teacher record**: an academic-domain record that may optionally link to an Identity user.
- **Course**: a class/cohort inside an academic year, not a catalog subject.
- **Subject**: a tenant-level reusable academic catalog entry, such as Matemáticas or Inglés; it is not a teaching/classroom instance.
- **CourseSubject**: the course-specific offering/context of a Subject and the primary teaching/learning context. It may be a default for its Course or assigned selectively.
- **CourseSubjectTeacher**: an active or inactive teacher assignment to one CourseSubject.
- **StudentSubjectEnrollment**: an active or inactive direct student enrollment targeting one CourseSubject, never only the reusable Subject catalog entry.
- **Learning item**: a unit of learning content or work, typed as material, assignment, assessment, or announcement.
- **Submission**: a student’s submitted work for an assignment or document-based assessment.

## Governing constraints

- The initial deployment is Colegio Conquistadores, but the product is multi-tenant from its first schema and request path.
- EduPay Académico owns its own database and must never read or write EduPay tables directly.
- EduPay Identity is a separate identity boundary. It issues a short-lived access JWT with the active membership context; Académico owns academic authorization and never stores credentials or refresh tokens.
- A client-provided `tenantId` is never authorization context. Tenant context comes from validated Identity claims or an approved high-risk status check.
- The same canonical ecosystem tenant ID is used in Identity token claim `tenant_id` and Académico integration contracts, without shared tables or foreign keys.
- The existing EduPay administrative login remains a separate trust domain initially.
- The MVP does not include grades, attendance, exams, chat, live classes, or financial workflows.
