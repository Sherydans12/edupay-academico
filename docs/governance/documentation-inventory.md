# Documentation inventory

Status: baseline inventory

| Area | Document | Purpose | Status |
| --- | --- | --- | --- |
| Product | [Vision](../product/vision.md) | Product purpose, users, principles, success signals, non-vision | Baseline proposed |
| Product | [MVP scope](../product/mvp-scope.md) | Included/out-of-scope capabilities and end-to-end acceptance boundary | Baseline |
| Product | [Roadmap](../product/roadmap.md) | Outcome-based sequencing and exit criteria | Proposed |
| Architecture | [System context](../architecture/system-context.md) | Services, data stores, providers, and integration boundaries | Reconciled baseline |
| Architecture | [Domain model](../architecture/domain-model.md) | Bounded contexts, entities, relationships, aggregate candidates | Reconciled baseline |
| Architecture | [Multitenancy](../architecture/multitenancy.md) | Canonical tenant ID, tenant resolution, persistence, file, cache, worker, and test rules | Mandatory controls / reconciled Identity context |
| Architecture | [Identity model](../architecture/identity-model.md) | Identity ownership, canonical tenant ID, academic links, JWT/session boundary | Reconciled cross-repository contract |
| Architecture | [Roles and authorization](../architecture/roles-and-authorization.md) | Approved MVP role matrix and academic resource policies | Reconciled MVP policy |
| Architecture | [Academic model](../architecture/academic-model.md) | Academic years, courses, Subject catalog, CourseSubjects, enrollment, lifecycle, and sync/manual rules | Accepted terminology/lifecycle baseline |
| Architecture | [Learning model](../architecture/learning-model.md) | CourseSubject/unit/item hierarchy and item-type behavior | Accepted MVP; ADR-0012 implemented |
| Architecture | [Submissions workflow](../architecture/submissions-workflow.md) | Submission, deadline, late, review, correction, and resubmission flow | Proposed / ADR candidate |
| Architecture | [File storage](../architecture/file-storage.md) | Private storage, dual quotas, metadata/blobs/references, validation, authorization, accounting, and reconciliation | Accepted storage baseline |
| Architecture | [Notifications](../architecture/notifications.md) | In-app/email abstraction, Resend adapter, reliability | Proposed |
| Architecture | [EduPay integration](../architecture/edupay-integration.md) | Explicit API/sync boundary, references, consistency, conflicts | Mandated boundary / unresolved details |
| Architecture | [API conventions](../architecture/api-conventions.md) | REST/JSON, JWT/JWKS, Identity integration, context, errors, pagination, shared Zod contracts, and versioning | Accepted D-14 baseline / endpoint details open |
| Architecture | [Frontend architecture](../architecture/frontend-architecture.md) | Next.js App Router, data, forms, responsive/accessibility rules | Proposed |
| Architecture | [Design system](../architecture/design-system.md) | Warm educational UX and tenant-configured design tokens | Proposed |
| Operations | [Security](../architecture/security.md) | Authentication, authorization, files, privacy, threat checkpoints | Mandatory controls / proposed operations |
| Operations | [Audit strategy](../architecture/audit-strategy.md) | Identity and academic audit ownership and event shape | Proposed |
| Operations | [Testing strategy](../architecture/testing-strategy.md) | Unit through e2e, contract, isolation, accessibility, release gates | Proposed |
| Operations | [Deployment](../architecture/deployment.md) | Environments, runtime, observability, recovery, operational gaps | Proposed |
| Governance | [Definition of done](../architecture/definition-of-done.md) | Quality and release evidence requirements | Proposed |
| Governance | [Unresolved decisions](unresolved-decisions.md) | Decision register with resolved reconciliation rows and remaining open items | Open after D-01–D-04, D-07, and D-14 resolution |
| Governance | [Risks](risks.md) | Risk register and mitigations | Open |
| Governance | [Implementation phases](implementation-phases.md) | Work packages and sequencing constraints | Proposed |
| Governance | [Agent boundaries](agent-boundaries.md) | Recommended parallel-agent seams and handoffs | Proposed |
| Decisions | [ADR index](../decisions/README.md) | Proposed and accepted ADR status and review workflow | ADR-0005, ADR-0009, ADR-0010, ADR-0011, and ADR-0012 accepted; later decisions open |

## Repository inspection result

At the time of this baseline, the repository contained no source files or prior documentation. No existing conventions, schema, CI pipeline, or deployment manifest were available to validate. The documents above therefore define a greenfield starting point and must be reconciled with the first approved repository bootstrap.
