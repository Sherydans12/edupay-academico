# Pilot release checklist

Status: controlled release gate. This checklist does not provide production
credentials and does not close D-11, D-15, D-17, or D-18.

## Automated repository gate

Install dependencies without changing the lockfile:

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

`pnpm release:check` runs:

- Prisma schema validation;
- Prisma client generation;
- lint;
- TypeScript typecheck;
- tests;
- production builds for all workspaces.

When an approved disposable/deployment database is available, add migration
status checks without putting credentials into ordinary CI:

```sh
RELEASE_RUN_DB_STATUS=1 \
EDUPAY_IDENTITY_DIR=/path/to/EduPayIdentity \
pnpm release:check
```

When Docker and the read-only current Identity checkout are available, include
the disposable real-service workflow:

```sh
RELEASE_RUN_PILOT_E2E=1 pnpm release:check
```

The pilot harness creates its own disposable PostgreSQL containers, signing
material, service token, activation values, and private files. It must not be
pointed at pilot or production databases. Ordinary CI runs no real Resend and
requires no production secrets.

## Identity repository gate

From the approved Identity checkout, run the corresponding non-secret checks:

```sh
pnpm install --frozen-lockfile
pnpm prisma:validate
pnpm contract:verify:jwks
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Against the disposable/deployment Identity database, also run
`pnpm prisma:migrate:status` and then the one-time `pnpm prisma:migrate:deploy`
job. The Identity repository is read-only for this hardening task; do not
modify it or its migrations from the Académico release process.

## Deployment evidence gate

- [ ] Git worktree is clean except for the intentional release commit and the expected branch.
- [ ] Académico and Identity are built from reviewed commits; no development server is running.
- [ ] Academic migration status is clean; Identity migration status is clean; both databases are separate.
- [ ] Pre-deploy backups exist outside live volumes and checksum verification passed.
- [ ] Final and staging storage paths are mounted, writable by the non-root API user, private, and have approved free-space thresholds.
- [ ] Web, Academic API, and Identity API use final HTTPS origins; certificates are valid and monitored.
- [ ] Academic and Identity exact CORS allowlists contain only the approved Academic web origin.
- [ ] Identity Secure cookie and SameSite behavior was tested with the final hostnames.
- [ ] JWKS retrieval, issuer, audience, active key ID, and access-token lifetime evidence is recorded.
- [ ] Current/previous service-token rotation references and expiry ownership are recorded; the token value is not.
- [ ] One Academic notification worker and one Identity email runner/schedule are active; no API replica starts either worker.
- [ ] `GET /api/v1/health/live`, `GET /api/v1/health/ready`, web `/api/health`, Identity health, and worker `--check` pass.
- [ ] Backup job, disk, database, notification, email, certificate, and terminal-failure alerts have owners.
- [ ] Tenant/admin bootstrap is completed through approved operator tooling; no default password or public bootstrap endpoint was used.
- [ ] D-11 malware/retention/legal-hold decision is signed by the relevant owner.
- [ ] D-17 audit/support retention and D-18 pilot success targets have named owners and are not represented as resolved by this change.
- [ ] Restore verification passed on a disposable target before pilot data is accepted.

## Container/config validation

With deployment-only placeholder values injected by the operator, validate the
Academic topology before publishing any public route:

```sh
docker compose -f deploy/compose.pilot.yml config
docker build -f deploy/Dockerfile.api .
docker build \
  --build-arg NEXT_PUBLIC_API_BASE_URL=https://<academico-api-hostname>/api/v1 \
  --build-arg NEXT_PUBLIC_IDENTITY_BASE_URL=https://<identity-api-hostname> \
  -f deploy/Dockerfile.web .
```

Do not put real secret values in build arguments. The web arguments are public
routing configuration only. The API image receives secrets at runtime through
managed environment injection.
