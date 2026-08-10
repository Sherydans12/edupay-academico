# Colegio Conquistadores pilot production runbook

Status: proposed single-VPS operational baseline. This runbook does not close
D-15 hosting/RTO/RPO/support, D-17 audit retention/support policy, D-18 pilot
success targets, or D-11 malware/retention/legal hold.

## 1. Proposed topology

```text
Student/Teacher/Admin browser
  -> HTTPS edupay-academico-web
  -> HTTPS edupay-academico-api -> private Academic PostgreSQL
                                  -> private/HTTPS Identity internal API
                                  -> private Academic files volume
Browser
  -> HTTPS edupay-identity-api -> private Identity PostgreSQL

edupay-academico-notification-worker -> Academic PostgreSQL -> Academic Resend
edupay-identity-email-worker       -> Identity PostgreSQL -> Identity Resend
```

The single VPS may host the containers and private volumes, but the two
databases remain independent services and databases. PostgreSQL is not
published to the internet. The Academic file and staging volumes are private
container mounts and are never mounted under a web/static directory or served
as a public path. Off-host backup storage should be used where the selected
provider supports it.

The checked-in `deploy/compose.pilot.yml` expresses the Academic half of this
topology. Identity is deployed from its read-only repository with its existing
commands and its own database; no shared Compose database or cross-service
Prisma package is introduced.

## 2. Process topology and commands

| Service | Production command | Replica rule |
| --- | --- | --- |
| `edupay-academico-web` | `pnpm --filter @edupay/web start` | One or more web replicas; build-time public URLs only. |
| `edupay-academico-api` | `node apps/api/dist/main.js` | One API replica for the local filesystem pilot. |
| `edupay-academico-notification-worker` | `pnpm --filter @edupay/api worker` | One instance for the pilot; the PostgreSQL claim lease supports later scale-out. |
| `edupay-identity-api` | `node dist/main.js` from Identity repository | One or more API replicas only after shared key/database/session operations are validated. |
| `edupay-identity-email-worker` | `node dist/email/worker-main.js` (`pnpm email:deliver`) | One scheduled runner; do not run it inside every API replica. |

Académico migrations run in the one-shot `academico-migrate` job before the API
and Academic worker start. Identity migrations run separately from the Identity
repository before its API/worker start. No web or API image starts a development
server, and no API replica runs a worker as a side effect of startup.

The current Identity email worker is a bounded one-shot delivery command. On a
Coolify-style host, run one scheduled job at the chosen interval or wrap it in
the platform's single-instance scheduled-worker facility. Do not create a
copy in each `edupay-identity-api` replica.

## 3. Service-auth configuration and rotation

Configure the same randomly generated, at-least-32-byte base64url secret in
server-side secret custody only:

```dotenv
# Identity
IDENTITY_ACADEMICO_SERVICE_TOKEN=<managed-secret>

# Académico
IDENTITY_INTERNAL_SERVICE_TOKEN=<same-managed-secret>
```

The value must not appear in `NEXT_PUBLIC_*`, browser responses, images, logs,
fixtures, database rows, or deployment tickets. Académico sends it only to the
two restricted Identity routes through its internal HTTP client; Identity
rejects browser-origin requests on those routes.

Safe rotation using Identity's supported overlap:

1. Generate a new secret in managed custody and record only its secret-manager reference.
2. Set Identity's current token to the new value, move the old value to `IDENTITY_ACADEMICO_SERVICE_TOKEN_PREVIOUS`, and set `IDENTITY_ACADEMICO_SERVICE_TOKEN_PREVIOUS_EXPIRES_AT` to a short future time, no more than 24 hours away.
3. Restart Identity and verify the restricted service-auth contract with the old and new values during the overlap window.
4. Update Académico's `IDENTITY_INTERNAL_SERVICE_TOKEN` to the new value and restart every API/worker process.
5. Exercise one authorized high-risk link/status call and verify request correlation without logging either credential.
6. Remove Identity's previous token and expiry before the overlap deadline and restart Identity.

If disclosure is suspected, rotate immediately, revoke affected deployment
access, and treat the event as an incident. Never test rotation against the
production database with a developer shell that could retain environment
history.

## 4. First deployment sequence

1. Approve the unresolved deployment/support decisions and the D-11 release gate below.
2. Provision private Academic PostgreSQL, private Identity PostgreSQL, the Academic final-files volume, and the separate Academic staging volume.
3. Load only managed secret references and the environment matrix values. Confirm no wildcard CORS or HTTP browser URL remains.
4. Build the Academic API/web images and the Identity API image from their repositories.
5. Run both repositories' schema validation, generated-client checks, and migration status checks against their own databases.
6. Take a pre-migration backup and verify that the backup artifact is outside the live database/file volumes.
7. Run Identity migrations, then Academic migrations, each as a single controlled job.
8. Start Identity API, verify JWKS and liveness, then start Academic API and verify liveness/readiness.
9. Start exactly one Academic notification worker and one Identity email runner/schedule.
10. Run the production-safe tenant/admin bootstrap supplied by the Identity owner and the matching Academic tenant bootstrap. The current repositories do not yet contain a production-safe first-tenant bootstrap command; this is a genuine pre-pilot blocker (see §9).
11. Run the controlled pilot workflow with synthetic or approved pilot data, verify audit/request correlation, and record the release evidence.

## 5. Health, readiness, and worker validation

Académico exposes:

- `GET /api/v1/health` — compatibility liveness response;
- `GET /api/v1/health/live` — liveness only;
- `GET /api/v1/health/ready` — checks a live `SELECT 1` against Academic PostgreSQL and verifies both private storage directories are readable/writable and mounted with the configured physical guard.

Readiness returns only service/status and `database`/`storage` check names. A
failure is a safe `503`; it does not expose tenant data, paths, credentials, or
database error details. The web route is `GET /api/health`.

Identity currently exposes `GET /api/v1/identity/health`, which is liveness
only. Because the Identity repository is explicitly read-only for this task,
this deployment cannot claim an Identity dependency-aware readiness endpoint.
Use Identity's liveness plus migration status, a database probe in the
Identity deployment environment, JWKS retrieval, and the controlled
cross-service smoke as the release readiness evidence. Adding a true Identity
readiness endpoint remains a follow-up owned by Identity.

Safe Academic worker probe (does not deliver email):

```sh
pnpm --filter @edupay/api worker:check
```

`worker --once` is an operational delivery command and may contact the
configured Academic provider; do not use it as a healthcheck.

## 6. Migration and rollback procedure

For each database, use the repository's reviewed migrations:

```sh
# Académico
pnpm --filter @edupay/api db:migrate:status
pnpm --filter @edupay/api db:migrate:deploy

# Identity, from C:\Users\nicol\Documents\EduPayIdentity or its deployment checkout
pnpm prisma:migrate:status
pnpm prisma:migrate:deploy
```

Use `prisma migrate deploy`, never `prisma migrate dev`, on pilot/production
databases. Run migration once, wait for success, then start the new API and
workers. Do not allow multiple replicas to race destructive or unreviewed
migrations.

Migrations are forward-only operational changes. Application rollback is safe
only when the previous application can read the new schema. A destructive or
irreversible migration requires a tested database restore and a coordinated
forward fix; do not try to reverse it by editing the Prisma migration history.

## 7. Persistent file-volume operation

The pilot uses the accepted private local filesystem adapter. Recommended
mounts are:

```text
/var/lib/edupay-academico/files  final immutable blobs
/var/lib/edupay-academico/tmp    bounded multipart staging/scratch
```

Both directories must be private, writable by the non-root API user, and on
known persistent storage. Production startup rejects missing/relative paths,
equal final/temp paths, and missing free-space thresholds. The physical guard
checks both volumes before a reservation and refuses writes that would cross
either configured minimum free bytes or percentage.

The accepted logical limits remain unchanged: 25,000,000 bytes per file and
20,000,000,000 bytes for the global and initial Colegio Conquistadores tenant
quota. Quotas are not inferred from physical free space. The local adapter is
single-node only; horizontal API scaling that needs shared object storage is
future work and must use a reviewed S3-compatible adapter/ADR.

Do not expose the volume through Next.js, a reverse proxy alias, directory
listing, or a download URL. Downloads remain authorized API streams.

## 8. D-11 malware/retention release gate

Current evidence:

- filename, declared MIME, extension, size, signature, bounded package, image,
  and text-content validation are implemented;
- immutable originals, tenant-local deduplication, quota reservation, and
  physical-capacity checks are implemented;
- the database has a scan-status seam, but the current local adapter persists
  uploaded blobs as `NOT_SCANNED` and does not run an antivirus or malware
  scanner;
- no retention, deletion, export, legal hold, or orphan-cleanup duration is
  claimed by this runbook.

Exact risk: a file can pass type/content validation and still contain malware
or an exploit payload. It can then be retained and downloaded by an authorized
user, creating endpoint, school-network, and downstream-device risk. Type
validation is not malware detection and must not be represented as such.

Required release decision: the security/operations owner must either (a) approve
a tightly controlled pilot cohort and documented compensating controls for
unscanned uploads, with the residual risk recorded, or (b) block pilot file
uploads until an approved scanner/quarantine adapter and failure policy exist.
No agent may choose retention, legal hold, deletion, or scanning behavior for
D-11 without the relevant owner approvals.

## 9. Tenant/admin bootstrap status

The intended safe sequence is:

1. Allocate one canonical opaque tenant ID and approved handle.
2. Create the Identity `TenantRealm` and tenant role catalog through an
   Identity-owned, audited operator bootstrap.
3. Create a pending Identity user/membership with `TENANT_ADMIN` and issue a
   one-time activation mechanism. The operator must never set or retain a
   permanent password.
4. Create the independent Académico `Tenant` record with the same canonical
   tenant ID.
5. Give the operator the activation handoff once, have the admin choose their
   password through Identity, and verify the first login and Academic tenant
   context.
6. Preserve the Identity and Academic audit/request evidence and mark the
   one-time bootstrap complete.

The current Identity API has no public tenant-creation route, and the current
pilot smoke's SQL bootstrap deliberately creates disposable data and credentials
for an ephemeral test. It must not be reused against the pilot database. The
current Académico repository also has no production-safe paired bootstrap
command. Therefore an Identity-owner-approved operator bootstrap command (or
equivalent audited migration tooling) is a genuine blocker before real pilot
data is created. Do not add a public bootstrap endpoint or commit a default
password.

## 10. Observability and operator actions

Structured evidence must correlate:

- `X-Request-Id` on browser/API requests and Identity internal calls;
- validated Identity `sessionId`, `membershipId`, and actor type in Academic
  audit logs, without JWT/cookie/token values;
- notification event/delivery IDs, status, attempt count, safe failure
  category, and worker run summaries;
- upload intent/file/submission/revision IDs, tenant context, outcome, and
  physical/quota rejection category, never file bytes.

Minimum pilot metrics/alerts:

- API/web/Identity liveness and dependency-readiness failures;
- Academic and Identity PostgreSQL connectivity, migration failure, and pool saturation;
- free bytes and free percentage on final and staging volumes;
- storage quota `CRITICAL`/`FULL`, reservation failures, and reconciliation drift;
- Academic notification worker last-success/run age, retry and `FAILED` counts;
- Identity email runner last-success/run age, outbox `FAILED` count, and provider failures;
- terminal notification/email failures and repeated Identity service-auth failures;
- backup job failure, missing daily restore point, and certificate/HTTPS expiry or handshake failure.

A large monitoring platform is not required for the MVP. A compatible reverse
proxy healthcheck, structured log sink, database queries, disk alert, one
scheduled backup job, and an operator checklist are sufficient if the alerts
have named owners and are tested before pilot.

## 11. Incident and shutdown basics

- If readiness fails for database or storage, stop routing new traffic and preserve the evidence; do not delete files to make space without an approved D-11 action.
- If notifications fail, keep Academic mutations available while monitoring in-app delivery and outbox state; restart only the singleton worker after capturing its safe summary.
- If service-token or signing-key material is exposed, rotate/revoke through the owning service's procedure and do not copy secrets into incident tickets.
- If a restore is required, use the disposable restore verification procedure first and obtain the operator/data-owner decision before touching live volumes.
