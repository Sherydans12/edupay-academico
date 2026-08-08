# EduPay Academico

EduPay Academico is a multi-tenant academic service. This repository contains
the approved platform bootstrap only; product and academic capabilities are
introduced in later governed phases.

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

No database model or initial migration exists yet. Domain agents must introduce
reviewed tenant-scoped models and migrations rather than deriving schema from
this placeholder boundary.

## Configuration and trust boundaries

The API validates database and EduPay Identity consumer settings at startup. In
production, Identity issuer and JWKS URLs must use HTTPS. The current Identity
package is only a port/type seam: it does not accept credentials, mint tokens,
implement password authentication, or trust a client-provided `tenantId`.

Never commit `.env` files, provider credentials, access/refresh tokens, private
keys, or real student data. EduPay Identity and EduPay Academico remain separate
services and databases.
