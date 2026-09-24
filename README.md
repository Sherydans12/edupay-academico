# EduPay Academico

## Estado y entrada rápida

El [mapa transversal EduPay](docs/architecture/edupay-ecosystem-architecture.md)
resume ownership, integraciones desplegadas, estado DIE, pendientes y límites
entre Identity, Académico y BL-002. Su runtime más reciente documentado se
verificó el **2026-09-24**; esta fecha no equivale a una comprobación en vivo
posterior. Para cambios, empieza por el [índice de documentación](docs/README.md)
y las instrucciones de [AGENTS.md](AGENTS.md).

- [Topología y artefactos productivos](docs/operations/PRODUCTION.md)
- [Runbook de despliegue, rollback y entornos aislados](docs/operations/RUNBOOK.md)
- [Cierre DIE, migraciones y último runtime verificado](docs/operations/die-release-closeout-2026-09-24.md)
- [Guía pendiente del piloto DIE](docs/operations/DIE-PILOT-GUIDE.md)
- [Inventario Coolify estructurado](docs/operations/coolify-inventory.json)

El FRONT productivo actual se sirve desde un recurso Coolify de imagen
inmutable. No infieras su artefacto por el SHA de `main`; mira el inventario y
el cierre fechados. Los despliegues son manuales. Para mejoras, crea un worktree
propio desde `origin/main` actualizado; las instrucciones locales siguientes
son sólo desarrollo y no se ejecutan contra producción.

EduPay Academico is a multi-tenant academic service. This repository contains
the approved platform bootstrap, Identity-consumer and tenant-authorization
foundation, and the MVP Academic Structure domain.

The architecture and implementation constraints in [AGENTS.md](AGENTS.md) and
[docs/README.md](docs/README.md) are authoritative.

## Workspace

- `apps/web`: Next.js 16 App Router application.
- `apps/api`: NestJS 11 REST API and Prisma 7 migration boundary.
- `packages/contracts`: reviewed cross-application contract types only.
- `packages/ui`: reserved tenant-neutral UI package boundary.
- `packages/config`: shared, non-secret TypeScript configuration.
- `docs`: product, architecture, governance, and accepted decisions.

pnpm 10 workspaces provide one lockfile and deterministic installs. Node.js 22
is the supported local and CI runtime.

## Developer bootstrap

### Prerequisites

- Node.js 22.12 or newer in the Node.js 22 release line.
- pnpm 10.19.0 (Corepack may activate the version in `package.json`).
- PostgreSQL 15 when exercising database connectivity or migrations.

### Setup

1. Install workspace dependencies:

   ```sh
   corepack enable
   pnpm install
   ```

2. Copy `apps/api/.env.example` to `apps/api/.env` and replace every synthetic
   value with local development configuration.
3. Copy `apps/web/.env.example` to `apps/web/.env.local`.
4. Validate the Prisma configuration after setting `DATABASE_URL`:

   ```sh
   pnpm db:validate
   ```

5. Start both applications:

   ```sh
   pnpm dev
   ```

The web application defaults to `http://localhost:3000`. The API defaults to
`http://localhost:3001/api/v1`, its health endpoint is
`http://localhost:3001/api/v1/health`, and OpenAPI is exposed at
`http://localhost:3001/api/docs`.

### Main configuration names

Use `apps/api/.env.example` and `apps/web/.env.example` as the complete local
reference. The main API groups are `DATABASE_URL` (Académico PostgreSQL),
`IDENTITY_ISSUER`, `IDENTITY_AUDIENCE`, `IDENTITY_JWKS_URI` (public token
validation), `IDENTITY_INTERNAL_BASE_URL` and
`IDENTITY_INTERNAL_SERVICE_TOKEN` (restricted server-to-server Identity
checks), `EDUPAY_INTEGRATION_BASE_URL` and `EDUPAY_INTEGRATION_TOKEN` (legacy
BL roster pull), `ACADEMIC_FINANCIAL_PROJECTION_ENABLED` and
`ACADEMIC_FINANCIAL_PROJECTION_PUBLISHER_ENABLED` (both false by default),
`STORAGE_ROOT`, `ACADEMIC_MALWARE_SCANNER`, and `ACADEMIC_TRUSTED_WEB_ORIGINS`.
The web bundle only needs `NEXT_PUBLIC_API_BASE_URL` and
`NEXT_PUBLIC_IDENTITY_BASE_URL`; these are public routing values, never
credentials or tenant authorization. Production-only value and purpose groups
are in the [environment matrix](docs/deployment/environment-matrix.md).

Do not reuse secrets across Identity, Académico or BL. The prior migration
reconciliation is complete; the DIE release verified the ledger of 13 Academic
migrations. Before future schema changes, verify ledger/checksums and rehearse
the update in a clone with recovery verified; see the
[Prisma reconciliation procedure](docs/deployment/prisma-reconciliation-rehearsal.md).
There is no blanket production migration authorization. The deployment uses
native Coolify PostgreSQL resources; `deploy/compose.pilot.yml` is for isolated
tests, not the production database.

### Quality commands

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Database commands are deliberately scoped to the API workspace:

```sh
pnpm db:validate
pnpm db:generate
pnpm --filter @edupay/api db:migrate:dev
pnpm --filter @edupay/api db:migrate:deploy
```

The initial Academic Structure migration is tenant-scoped and includes
composite tenant foreign keys plus reviewed PostgreSQL constraints. See the
[academic persistence notes](apps/api/prisma/README.md).

## Configuration and trust boundaries

The API validates database and EduPay Identity consumer settings at startup,
including the required server-only internal Identity base URL, service token,
and bounded timeout. In production, Identity issuer and JWKS URLs must use HTTPS. The API validates
asymmetric access JWTs through configured JWKS, creates immutable trusted
principal and tenant contexts, and applies centralized capability/resource
policies. It does not accept credentials, mint tokens, implement password
authentication, or trust a client-provided `tenantId`. See the
[foundation implementation note](docs/governance/tenancy-authorization-foundation.md)
and [Identity bridge note](docs/governance/identity-internal-bridge.md).

Never commit `.env` files, provider credentials, access/refresh tokens, private
keys, or real student data. EduPay Identity and EduPay Academico remain separate
services and databases.
