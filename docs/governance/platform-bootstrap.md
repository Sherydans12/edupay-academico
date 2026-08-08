# Platform bootstrap implementation note

Status: implemented on `chore/platform-bootstrap`

Date: 2026-08-08

This note records implementation-level tooling selected for Phase 0. It does
not amend architecture, security boundaries, ownership, or product behavior.

## Workspace and tooling choice

No accepted document mandated a package manager. The bootstrap therefore uses
pnpm 10.19.0 workspaces with one root lockfile and `apps/*` plus `packages/*`
workspace globs. Node.js 22 is the shared local and CI runtime. TypeScript,
ESLint, and Prettier policy is centralized at the repository root, while
non-secret TypeScript presets live in `packages/config`.

Root quality commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, and
`pnpm build`. GitHub Actions runs the same gates plus Prisma schema validation.

## Implemented boundaries

- `apps/web` is a strict TypeScript Next.js 16 App Router shell with Tailwind
  CSS, Zod environment validation, React Hook Form installed for future forms,
  and a technical placeholder only.
- `apps/api` is a NestJS 11 shell under `/api/v1` with validated external
  configuration, a health endpoint, global DTO validation defaults, a stable
  error envelope, correlation IDs, and OpenAPI scaffolding.
- Prisma 7 is configured for PostgreSQL using only external `DATABASE_URL`.
  The schema intentionally contains no models or speculative migration.
- The Identity consumer seam contains external claim types, a trusted-principal
  type, and an adapter port. It deliberately provides no authentication
  implementation, token bypass, credential persistence, or tenant resolution.
- `packages/contracts` exports only the already-documented API error envelope.
  The Zod-versus-OpenAPI source-of-truth decision remains unresolved.
- `packages/ui` reserves the approved tenant-neutral package boundary without
  creating a design system or Colegio Conquistadores branding.

## Deferred work

JWT/JWKS validation, trusted request tenant context, authorization, Prisma
domain models, academic APIs/UI, storage, workers, notifications, and
synchronization remain assigned to later phases and their governing decisions.
