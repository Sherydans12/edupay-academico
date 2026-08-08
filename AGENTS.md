# EduPay Académico agent constitution

This file governs every future agent working in this repository. It applies to implementation, review, documentation, testing, and operations work.

## Authority and scope

- Existing documentation and accepted ADRs are authoritative. The current accepted decisions are indexed in `docs/decisions/README.md`, including storage ADR-0005 and the Identity reconciliation ADR-0009.
- No agent may silently redesign architecture, ownership, security boundaries, persistence, API contracts, or user-visible workflows.
- No feature outside the approved MVP may be added without explicit instruction and the required product/documentation/ADR review.
- Unresolved decisions in `docs/governance/unresolved-decisions.md` remain open until an accepted decision closes them. Do not infer submission revision, replacement, draft, or post-review semantics.
- Unrelated refactors are prohibited. Keep changes inside the assigned directory and domain scope.

## Non-negotiable architecture

- Multi-tenancy is mandatory from the first schema, request path, background job, file operation, cache key, export, notification, and test fixture.
- A client-provided `tenantId` is never authorization context. Trusted tenant context comes from a validated EduPay Identity access JWT or an explicitly approved high-risk Identity status check.
- There is one stable opaque ecosystem tenant ID. Identity, Académico, and future services own separate tenant records/references and databases; they do not share tables or foreign keys.
- Identity owns authentication, credentials, sessions, refresh tokens, memberships, roles, invitations, activation, and authentication audit. Académico owns academic authorization and academic records.
- EduPay Académico must never store credentials, password hashes, refresh tokens, activation secrets, or Identity secrets.
- There are no shared databases with EduPay Identity or the existing EduPay platform. Integration uses reviewed contracts, APIs, JWKS, events, or synchronization boundaries.
- The existing EduPay administrative authentication remains a separate trust domain initially.
- `SYSTEM_ADMIN` has no automatic tenant access. Tenant access requires an explicit audited elevated support context; user impersonation is out of scope for the MVP.
- The accepted storage ADR remains authoritative. Student submission originals are immutable unless a later accepted ADR explicitly changes that policy.

## Change and collaboration rules

- Once implementation begins, application-code changes must use feature branches and worktrees. Agents must not work directly on `main` during parallel implementation.
- Schema or API changes that affect another domain require documentation and ADR review before implementation or merge.
- Tests are mandatory for every implemented authorization boundary, including positive, negative, stale/revoked-context, and cross-tenant cases.
- Secrets must never be committed, logged, placed in client bundles, or copied into fixtures. Use documented environment/secret mechanisms and synthetic test data.
- Destructive Git operations and force pushes are prohibited. Do not reset, discard, rewrite, or overwrite another agent’s work without explicit instruction.
- Respect the assigned directory/domain scope and coordinate shared contract changes with the contract owner.

## Expected future monorepo boundaries

The repository is intentionally documentation-only until bootstrap is explicitly authorized. These are expected boundaries, not a command to scaffold them now:

- `apps/web/`: Next.js presentation, routing, forms, and tenant-aware UI. It calls the API and never connects directly to databases, object storage, Identity tables, or the existing EduPay system.
- `apps/api/`: NestJS academic API, Identity adapter, request-scoped tenant context, academic authorization, domain services, migrations, and academic persistence. It owns no Identity persistence.
- `apps/worker/`: retryable Académico notification, file, or integration work when the relevant queue/worker decisions are accepted. Jobs must carry server-created tenant context.
- `packages/contracts/`: reviewed OpenAPI, Identity JWT/JWKS, event, and integration contract definitions. Contract changes require documentation/ADR review.
- `packages/ui/`: reusable, tenant-neutral design-system components and semantic theme tokens.
- `packages/config/`: shared non-secret tooling and environment-schema conventions approved during bootstrap.
- `infra/`: future deployment, environment, backup, and operational definitions; no infrastructure is created by this documentation baseline.
- `docs/`: product, architecture, governance, testing, and ADR source of truth.

EduPay Identity remains a separate repository/service. Do not create a shared Identity database package, cross-repository Prisma schema, or direct table integration. No monorepo directories, application code, schema, package, database, or infrastructure should be created until implementation bootstrap is explicitly authorized.
