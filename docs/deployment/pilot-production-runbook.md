# Colegio Conquistadores pilot production runbook

Status: proposed single-VPS operational baseline. This runbook does not close
D-15 hosting/RTO/RPO/support. D-11 is resolved for the controlled pilot by
ADR-0018; D-17 is resolved for the pilot by ADR-0019 and D-18 is resolved for
the pilot baseline by ADR-0020.

## 1. Proposed topology

```text
Student/Teacher/Admin browser
  -> HTTPS edupay-academico-web
  -> HTTPS edupay-academico-api -> private Academic PostgreSQL
                                  -> private/HTTPS Identity internal API
                                  -> private Academic files volume
                                  -> private ClamAV/clamd service
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
| `clamav` | ClamAV image with `clamd` | One private instance; no host/public port; bounded CPU/memory. |
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
8. Start the private ClamAV service and verify its healthcheck. Start Identity API, verify JWKS and liveness, then start Academic API and verify liveness/readiness including the scanner dependency.
9. Start exactly one Academic notification worker and one Identity email runner/schedule.
10. Run the coordinated production-safe Identity and Academic tenant/admin bootstrap described in §9.
11. Run the controlled pilot workflow with synthetic or approved pilot data, verify audit/request correlation, and record the release evidence.

## 5. Health, readiness, and worker validation

Académico exposes:

- `GET /api/v1/health` — compatibility liveness response;
- `GET /api/v1/health/live` — liveness only;
- `GET /api/v1/health/ready` — checks a live `SELECT 1` against Academic PostgreSQL, both private storage directories, the configured physical guard, and the private malware scanner.

Readiness returns only service/status and `database`/`storage`/`malwareScanner`
check names. A failure is a safe `503`; it does not expose tenant data, paths,
credentials, ClamAV internals, or database error details. The web route is
`GET /api/health`.

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

ADR-0018 resolves D-11 for the 14-day controlled pilot:

- production uses the private ClamAV/`clamd` adapter and fails closed;
- an upload is staged, type/signature validated, hashed, scanned, and only a
  `CLEAR` result may proceed to deduplication, promotion, finalization, and
  Learning/Submission reference creation;
- `INFECTED`, `FAILED`, unavailable, and timeout results reject the upload,
  release/reconcile its reservation, and clean staged bytes;
- only authorized `AVAILABLE` files with `StoredBlob.scanStatus=CLEAR` can be
  downloaded;
- valid finalized Learning attachments and Submission evidence have no
  automatic purge during the pilot and no Student/Teacher finalized-evidence
  hard-delete UI/API;
- expired intents, failed validation, scanner failures, infected uploads, and
  abandoned staging are cleaned by a bounded sweep of at most 100 intents at
  startup and every 15 minutes; and
- future destructive retention/deletion requires approved legal-hold semantics.

Type/signature validation remains a separate control and must not be described
as malware scanning. The explicit `fake` scanner is permitted only for
development/test and is rejected by production environment validation.

Before launch, record evidence for a healthy ClamAV service, a known clean test
file accepted, an isolated EICAR test file rejected, rejected-file download
denial, and empty staging after rejection. Do not use actual malware or commit
an unsafe test artifact.

### ClamAV signature operations

The Compose service may update signatures on its own schedule and uses a
persistent signature volume when required by the selected image. Application
startup is not coupled to an Internet signature update on every boot: the
service healthcheck validates `clamd`, and any scan failure remains fail closed.
Operators must monitor signature freshness and run the image's supported
signature-update command or restart procedure during a maintenance window,
then repeat the clean-file readiness test. ClamAV signature data is an
operational cache, not application evidence, and is not required in the
application evidence backup.

## 9. Tenant/admin bootstrap procedure

The operator must execute the two repository-owned bootstrap procedures in this
order. There is no public bootstrap endpoint and no shared database.

1. The operator chooses one canonical UUID and records it as the opaque tenant
   reference for both services.
2. Identity bootstrap creates the `TenantRealm` and first `TENANT_ADMIN` using
   the Identity repository's owner-approved operator command. Identity creates
   the activation mechanism; the operator does not create or retain a password.
3. From the private Academic deployment environment, run the Academic command
   with the exact same UUID:

   ```sh
   pnpm bootstrap:tenant -- --tenant-id <canonical-tenant-uuid>
   ```

   The accepted pilot default is 20,000,000,000 bytes. An explicitly approved
   smaller quota may be supplied with `--quota-bytes <positive-integer>`.
   The command creates the Academic `Tenant`, global and tenant quota policies,
   and global and tenant usage-account rows. It is atomic and idempotent when
   the existing state is compatible; it refuses an existing tenant quota or
   storage scope with incompatible identity/quota/counter state. It does not
   create Identity users, passwords, demo Students, Teachers, or any HTTP
   route. Its structured output is non-secret bootstrap evidence; preserve it
   with the release record without adding database URLs or credentials.
4. The initial administrator activates their Identity account using the
   one-time mechanism and chooses their password through Identity.
5. The administrator logs in, verifies the Academic tenant context, and normal
   authenticated administration begins.

The coordinated first-tenant procedure is therefore:

1. operator chooses one canonical UUID;
2. Identity bootstrap creates the `TenantRealm` and first `TENANT_ADMIN`;
3. Académico bootstrap creates the matching `Tenant` using the same UUID;
4. the admin activates their Identity account; and
5. normal authenticated administration begins.

The current Identity API has no public tenant-creation route, and the current
pilot smoke's SQL bootstrap deliberately creates disposable data and credentials
for an ephemeral test. It must not be reused against the pilot database. The
Identity bootstrap remains an Identity-owned prerequisite; the Academic command
does not replace it. Do not add a public bootstrap endpoint or commit a default
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
- malware scan start/completion, outcome category, duration, scanner health,
  and bounded pending/failure counts, never file contents or raw daemon output.

Minimum pilot metrics/alerts:

- API/web/Identity liveness and dependency-readiness failures;
- Academic and Identity PostgreSQL connectivity, migration failure, and pool saturation;
- free bytes and free percentage on final and staging volumes;
- storage quota `CRITICAL`/`FULL`, reservation failures, and reconciliation drift;
- malware scanner unavailable/timeout/failure counts, infected detections, scan
  latency, signature freshness, and pending scan backlog;
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
