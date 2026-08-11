# Pilot release checklist

Status: controlled release gate. This checklist does not provide production
credentials. D-15 is accepted for the controlled Colegio Conquistadores pilot
by ADR-0017; production execution evidence remains open. D-11 is resolved for
the controlled pilot by ADR-0018; D-17 and D-18 are resolved for the pilot by
ADR-0019 and ADR-0020.

## Final pilot release-validation workflow

The expensive Linux/Docker gate is explicit and uses no production secrets:

```sh
pnpm release:check
pnpm release:config:check --service academico --env-file deploy/env/academico-api.ci.env.example
pnpm pilot:bootstrap:smoke
pnpm pilot:edupay:smoke
PILOT_MALWARE_SCANNER=clamav PILOT_CLAMAV_FAILURE_GATE=true pnpm pilot:e2e
```

The canonical GitHub Actions entry point is
`.github/workflows/pilot-release-validation.yml` with `workflow_dispatch`.
Its Ubuntu jobs build the reviewed images, exercise PostgreSQL 15, run the
real ClamAV pilot, execute the actual bootstrap and BL-002 smoke procedures,
and run disposable backup/restore verification. The workflow must be read as
release evidence, not as production acceptance; production-host execution
gates remain open.

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
- [ ] Pre-deploy backup exists outside live volumes, checksum verification passed, and the completed set was transferred to Cloudflare R2 with remote presence verification; local staging is not treated as authoritative custody.
- [ ] Final and staging storage paths are mounted, writable by the non-root API user, private, and have approved free-space thresholds.
- [ ] Web, Academic API, and Identity API use final HTTPS origins; certificates are valid and monitored.
- [ ] Academic and Identity exact CORS allowlists contain only the approved Academic web origin.
- [ ] Identity Secure cookie and SameSite behavior was tested with the final hostnames.
- [ ] JWKS retrieval, issuer, audience, active key ID, and access-token lifetime evidence is recorded.
- [ ] Current/previous service-token rotation references and expiry ownership are recorded; the token value is not.
- [ ] One Academic notification worker and one Identity email runner/schedule are active; no API replica starts either worker.
- [ ] One private Academic sync worker is active; `sync:worker:check` passes and no public route/port exposes it.
- [ ] `EDUPAY_INTEGRATION_BASE_URL` is the reviewed exact source origin; the dedicated token is in managed server/worker custody only and is absent from database dumps, logs, responses, and web bundles.
- [ ] The operator configured the source tenant to canonical tenant and active local AcademicYear mapping; a compatible configuration rerun passed and an incompatible mapping was refused.
- [ ] One controlled incremental and one source-confirmed full reconciliation passed; terminal watermarks, two-full-run absence behavior, and safe conflict/status visibility were reviewed.
- [ ] `GET /api/v1/health/live`, `GET /api/v1/health/ready`, web `/api/health`, Identity health, and worker `--check` pass.
- [ ] ClamAV is healthy on the private network, has no host/public port, and `ACADEMIC_MALWARE_SCANNER=clamav` is configured with validated private host, port, timeout, and bounded concurrency.
- [ ] A known clean synthetic file is accepted with `scanStatus=CLEAR`.
- [ ] A controlled isolated EICAR test file is rejected with a safe malware error, never becomes available/downloadable, and leaves staging empty. No actual malware payload is used.
- [ ] Failed/timeout scanner paths reject uploads, release/reconcile quota reservations, and leave no staged bytes.
- [ ] Valid finalized Learning attachments and Submission evidence have no automatic pilot purge; no finalized-evidence hard-delete UI/API exists.
- [ ] Backup job, disk, database, notification, email, certificate, and terminal-failure alerts have owners.
- [ ] One canonical tenant UUID is recorded; Identity creates the TenantRealm and first TENANT_ADMIN; Academic `pnpm bootstrap:tenant` creates the matching Tenant and storage accounting state; no default password or public bootstrap endpoint was used.
- [ ] D-11 malware/retention/legal-hold decision is signed by the relevant owner.
- [ ] ADR-0019 audit/support policy and ADR-0020 pilot success targets are included in the release evidence; their operational prerequisites are verified.
- [ ] Restore verification passed on a disposable target before pilot data is accepted.
- [ ] The production backup job uses `BACKUP_REQUIRE_OFFHOST=1`; R2 transfer or remote verification failure is non-zero/fail-closed, and at least 14 daily/4 weekly recovery-point retention is configured.

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
