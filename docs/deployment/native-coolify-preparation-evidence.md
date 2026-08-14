# Native Coolify pilot preparation evidence

Status: **HOLD_PENDING_FINAL_CUTOVER_REVIEW**

## Source-backed Docker Compose migration build proof — passed before maintenance (2026-08-14)

Temporary operations-only proof branches were created from the reviewed source
commits and pushed without touching either `main` branch:

| Repository | Proof branch | Final proof commit | Reviewed base |
| --- | --- | --- | --- |
| Identity | `ops/coolify-migrate-compose-proof` | `c511716f077752f69d0b0dff7e5f9174d51a3103` | `21a8cd9b10660bd4cb38679298393387a60b9eee` |
| Academic | `ops/coolify-migrate-compose-proof` | `a75e8d7b6c57850a52b5bcccb1c606a25b80cd02` | `5b0ad1f5f8ab0552ed1c502f30840b4afcc13fd8` |

For both repositories the complete diff from the reviewed base contains
exactly `deploy/compose.migrate.preflight.yml`.  No Dockerfile, application
source, package, schema, migration, lockfile, or product configuration was
changed.  Each Compose file defines an unpersisted `postgres:15-alpine` `db`
and a no-domain `migrate` service with `exclude_from_hc: true`,
`restart: "no"`, `build`, and a per-resource `PREFLIGHT_DB_PASSWORD` managed
only by Coolify.  The file uses `build.context: .`: Coolify runs Compose with
the cloned checkout as its project directory, so this is the repository root
in the actual stable deployment path.

Two private-GitHub-App, Docker Compose-build-pack applications were created
with auto-deploy and generated domains disabled:

| Proof application | UUID | Repository / pinned proof commit | Compose checkout path |
| --- | --- | --- | --- |
| Identity source proof | `bgaqul218khdtq3se4pf8dnj` | `Sherydans12/edupay-identity` / `c511716f...` | `/deploy/compose.migrate.preflight.yml` |
| Academic source proof | `h1j4z41841v4d8qx2cwmrbht` | `Sherydans12/edupay-academico` / `a75e8d7b...` | `/deploy/compose.migrate.preflight.yml` |

Coolify deployment logs proved private GitHub App authentication, source
import/clone, branch lookup, exact detached checkout, loading the Compose file
from that checkout, and `docker compose build --pull --no-cache`.  The source
build itself loaded the reviewed root `Dockerfile` for Identity and
`deploy/Dockerfile.api` for Academic.  BuildKit explicitly executed the
respective `migrate` stages; the generated source-built migration images were
`bgaqul218khdtq3se4pf8dnj_migrate:c511716f...` (container image ID
`sha256:d4bea300ee2eff6fd33d89287ba9145ffe0932052efe80d80d19eadc686130b9`)
and `h1j4z41841v4d8qx2cwmrbht_migrate:a75e8d7b...` (container image ID
`sha256:385164d3153317b80ed9b73e18bd1fbf59e5338daef12c90a6ffb565f69de720`).
No old migration image reference appears in either proof Compose file.

| Proof deployment | Deployment UUID | Command / exit | Disposable DB evidence | One-shot result |
| --- | --- | --- | --- | --- |
| Identity | `xx0dj6z0ro0bsqbvurad7b1p` | `pnpm prisma:migrate:deploy`; exit `0` | `_prisma_migrations` count `2` | no Docker healthcheck; `exclude_from_hc` effective; no restart loop |
| Academic | `ukhk3snkl2c2xo8ckd9mj1xa` | `pnpm --filter @edupay/api db:migrate:deploy`; exit `0` | `_prisma_migrations` count `6` | no Docker healthcheck; `exclude_from_hc` effective; no restart loop |

Both proof applications were stopped through the official Coolify API after
evidence collection.  Docker verification found zero remaining containers for
either Compose project, including their disposable PostgreSQL services.  The
proof resources were retained for review; their UI status can remain stale
after cleanup, but they have no running container or accessible proof
database.  The associated preview-only duplicate secret entries were removed,
leaving one non-preview disposable password entry per proof resource without
printing any value.

The manual authoritative stack was rechecked after the proof: Academic web and
live checks were HTTP 200, readiness was HTTP 200 three times, and Identity
health/JWKS were HTTP 200.  Manual ClamAV and both manual PostgreSQL resources
were healthy, with exactly one notification worker and one sync worker.  R2
authentication also passed.  Identity and Academic native API applications
remain permanently configured for Dockerfile target `runtime`; the native
Identity key-custody gate remains passed.  Native ClamAV retains its `4g`
limit and remains intentionally stopped after its bounded validation, so the
non-authoritative native Academic runtime can appear unhealthy while its
private scanner dependency is intentionally offline.

No production maintenance was entered.  No manual or native production data,
domains, routing, workers, email correction, password recovery, BL-002
resource, firewall, recovery point, dump, or restore was changed.  The native
databases remain stale and require a fresh, separately controlled cutover
window.  The temporary Coolify token was removed after final API work;
root-only R2 configuration, Identity ACL rollback metadata, and the local
Coolify pre-upgrade backup remain retained.

`IDENTITY_SOURCE_BACKED_MIGRATE_BUILD=PASS`

`ACADEMIC_SOURCE_BACKED_MIGRATE_BUILD=PASS`

`MIGRATION_COMPOSE_BUILD_PROOF=PASS`

`COOLIFY_STABLE_PREFLIGHT_GATE=PASS`

## Historical stable Coolify control-plane and native runtime preflight (2026-08-14)

The owner confirmed completion of their UI backup action.  Before the approved
control-plane upgrade, an additional root-only local recovery directory was
created at `/root/coolify-pre-4.1.2-20260814T052155Z` (mode `0700`).  It
contains a custom-format logical Coolify PostgreSQL dump, the Coolify source
environment and SSH-key recovery material, the proxy control configuration,
and `SHA256SUMS`.  The dump was structurally validated with `pg_restore
--list`; checksum verification passed.  Individual retained backup files are
root-only, the total backup size is 5,430,598 bytes, and no control-plane
secrets were exported to the EduPay R2 prefix.

Coolify was upgraded using the official version-pinned installer from
`4.0.0-beta.473` to `4.1.2`.  Docker Engine, Ubuntu, PostgreSQL major version,
Traefik, the manual EduPay stack, and the host firewall were not changed.  The
post-upgrade Coolify API authenticated successfully, and Coolify, its internal
PostgreSQL, Redis, and proxy were healthy.  The recorded resource UUIDs still
resolved.  The manually routed Academic web/API and Identity public checks
remained HTTP 200 (Academic readiness was checked three consecutive times),
manual ClamAV and both manual databases were healthy, and precisely one manual
notification and sync worker remained active.

The permanent API targets were re-pinned without target toggling:

| Runtime application | UUID | Reviewed SHA | Dockerfile target | Runtime evidence |
| --- | --- | --- | --- | --- |
| Identity API | `tbv6wqmv2h0u4flrufjzch4b` | `21a8cd9b10660bd4cb38679298393387a60b9eee` | `runtime` | image `sha256:7e485ee702564b02118fc180ce4969bf9d48136984bf168d2655816cb47763da`; `node dist/main.js`; HEALTHCHECK present; internal `3000/tcp` |
| Academic API | `d8dqmfqwp45hkk2hdqodohav` | `5b0ad1f5f8ab0552ed1c502f30840b4afcc13fd8` | `runtime` | image `sha256:ef09ee1c31e5dcf0b66ee82ac9798f754dd310fb630782d05c3960b4f30ea7aa`; `node dist/main.js`; HEALTHCHECK present; internal `3001/tcp` |

Both runtime applications accepted the supported forced rebuild operation.
Identity deployment `nlwctu5l5ag7yv0cv09peuhm` and Academic deployment
`csdp8x6ioi68sdlkfe62ig2u` built verified runtime images instead of reusing
the old migration-target images.  Identity private health and JWKS were HTTP
200, `/keys` was present, the runtime UID was `10001`, and a host/container
key-manifest fingerprint comparison passed without disclosing key material.
Academic private live and ready checks were HTTP 200, including private
scanner connectivity.  The previously passed `NATIVE_IDENTITY_KEY_GATE`
remains valid.

Stable Coolify's documented Compose one-shot model was tested only against the
stale/disposable native databases.  Application-style Compose resources could
not load an inline compose definition because their deployment path expects a
repository `docker-compose.yaml`; those stopped test applications were left
intact.  The supported Service Compose API with `connect_to_docker_network`
and `exclude_from_hc: true` then produced the required behavior:

| One-shot Service | UUID | Result |
| --- | --- | --- |
| Identity migration | `npp3f3xrpktvwvo33j4frhxi` | migrated image executed on the predefined Coolify network; exited `0`; no healthcheck required; two migrations found and none pending |
| Academic migration | `ayj9cwg9ycvy338gb7ehrzpf` | migrated image executed on the predefined Coolify network; exited `0`; no healthcheck required; six migrations found and none pending |

This proves that a successful one-shot exit is not treated as an HTTP runtime
failure on Coolify 4.1.2.  The service test used already-built reviewed
`migrate` target images, so it does **not** yet prove a source-backed Compose
`build.target: migrate` path under 4.1.2.  That final build-path proof remains
required before a future maintenance window.  The old experimental Dockerfile migration
applications `w14ok9mcfn0ntjsr443wkjrb` and `ax0c9tmr72i7qjnzg9o0tks1` were
explicitly labelled experimental/superseded and kept stopped; they were not
deleted.  Future controlled migrations must use the separate Service Compose
mechanism and must never toggle either API application's Dockerfile target.

The runtime rolling-deployment defect was further ruled out with two further
forced runtime redeployments per API: Identity deployments
`nkwrfu59kn5hpkra2x3l0f24` and `hmg1b0hbi5hjxrk8anql1m8x`, and Academic
deployments `extng6bnu8lp8u6spqey5e4i` and `zd8tylkkam0hatcetkq527bf`, each
retained the correct command and HEALTHCHECK and passed their private health
checks.  Identity also retained the key bind and valid JWKS on both fresh
containers.

Native ClamAV was configured through Coolify's supported limit setting to
`4g`.  A bounded native preflight found `clamav/clamav:1.4.3` healthy,
`OOMKilled=false`, `clamdscan --ping=1` passing, and private TCP `3310`
listening.  It was then stopped through the Coolify API to avoid unnecessary
duplicate scanner memory pressure while the manual scanner remains
authoritative.  Its signature persistence was not removed or changed.

R2 authentication was revalidated non-destructively with the retained
root-only runtime secret file.  No new maintenance window, recovery point,
production dump or restore, operator email correction, password-recovery
dispatch, domain/routing change, worker switch, BL-002 action, or firewall
change occurred.  The native databases are still stale and therefore require
a new write freeze, backup, final logical dumps, and restore in the next
separately authorized cutover window.

At this historical checkpoint,
`COOLIFY_STABLE_PREFLIGHT_GATE=HOLD_PENDING_MIGRATION_COMPOSE_BUILD_PROOF`.
The source-backed Compose build proof above supersedes that hold.


## Runtime/migration architecture preflight — blocked before maintenance (2026-08-14)

Authenticated Coolify API access was validated with the temporary owner-issued
token. The two existing API resources were explicitly re-pinned without a
deployment to their permanent runtime targets:

| Resource | UUID | SHA | Dockerfile target | Domain |
| --- | --- | --- | --- | --- |
| Identity API | `tbv6wqmv2h0u4flrufjzch4b` | `21a8cd9b10660bd4cb38679298393387a60b9eee` | `runtime` | none |
| Academic API | `d8dqmfqwp45hkk2hdqodohav` | `5b0ad1f5f8ab0552ed1c502f30840b4afcc13fd8` | `runtime` | none |

Two separate no-domain, no-auto-deploy migration applications were created.
Each has only a Coolify-managed `DATABASE_URL` runtime entry transferred
internally from its corresponding native API application; no value was
printed or recorded. No Identity signing-key storage was attached.

| Resource | UUID | Permanent target | Build/deployment UUID |
| --- | --- | --- | --- |
| Identity migration | `w14ok9mcfn0ntjsr443wkjrb` | `migrate` | `w5byai0xbeemlsjeg7fipool` |
| Academic migration | `ax0c9tmr72i7qjnzg9o0tks1` | `migrate` | `k7ou3c09zfsw9m2f4jhh0jig` |

Coolify accepted the official `POST /applications/{uuid}/start?force=true`
requests and both deployment logs proved a no-cache Docker build using the
requested `migrate` target. The resulting local migration image identities
were distinct:

| Migration image | Local image identity | Command | Dockerfile HEALTHCHECK |
| --- | --- | --- | --- |
| Identity | `sha256:ef1244474ea6a0c8b629a82dfdf945f8ee57dc2ab3527f3501f9bd935bcdf304` | `pnpm prisma:migrate:deploy` | absent |
| Academic | `sha256:4e72a733c6619b84eca12aac1ff850174be62249502d78c2fc32818d501b5917` | `pnpm --filter @edupay/api db:migrate:deploy` | absent |

Both one-shot deployments nevertheless failed before a successful migration
exit could be observed. In Coolify `4.0.0-beta.473`, the rolling-update job
inspected the full source Dockerfile, detected the runtime-stage
`HEALTHCHECK`, and attempted to inspect `.State.Health` on the actual
`migrate` target image. That image correctly has no healthcheck, so the
deployment failed with Docker's missing-`Health` template error and Coolify
removed the newly created one-shot container. This occurred even though the
application setting `health_check_enabled=false` was stored. It is a Coolify
one-shot deployment/orchestrator incompatibility, not a Prisma migration
failure. No fake HTTP healthcheck, custom Docker run option, internal database
change, product-code change, or production database was used to bypass it.

The old SHA-tagged API images remain evidence of the prior target collision:
they still contain the migration commands and no Dockerfile healthcheck
(`sha256:28edcd5f17bbf3974d892aa7854a0bb6a622ab3aa9d46f5200833fd4379c41c5`
for Identity and
`sha256:1ac6e3e18f18dad1250f61208b16c54bbc20d15f0486da77ef029d9318fdb3e9`
for Academic). Therefore a runtime force rebuild and its redeploy tests were
not attempted after the one-shot gate failed; the actual runtime target still
cannot be proven until the Coolify one-shot behavior is corrected through a
supported mechanism.

No maintenance window was opened. No new R2 recovery point, final dump,
database restore, migration, operator email correction, canonical routing
change, password recovery, worker cutover, BL-002 action, or firewall action
occurred. The manual authoritative public checks remained HTTP 200 for the
Academic web, Academic live/ready, Identity health, and JWKS endpoints;
manual ClamAV and both manual PostgreSQL instances remained healthy, and the
manual notification and sync workers remained active.

The R2 runtime secret file and ACL rollback metadata were retained root-owned
with mode `0600`. The temporary Coolify token file was removed after the API
work and its absence was verified. The required next action is an
owner-approved Coolify upgrade or a documented beta.473-supported one-shot
execution method that does not misapply a runtime Dockerfile healthcheck to a
`migrate` target. Until then:
**COOLIFY_RUNTIME_REBUILD_GATE=HOLD** and
**HOLD_PENDING_COOLIFY_RUNTIME_TARGET_REBUILD** remain in force.

Previous evidence base: `a6cbeb41ea1c80ed85c64f09cfd6f73711b02da3`

Recorded: 2026-08-13

## Authorized cutover attempt: recovered manual ClamAV, then rolled back before routing

The manual ClamAV failure was proven to be memory-cgroup exhaustion, not DNS
or an Academic configuration error. The container had `OOMKilled=true`, a
1 GiB memory limit, and kernel evidence of `clamd` being killed during
signature reloads. Host available memory was approximately 9.3 GiB. The
native private ClamAV resource (about 964 MiB resident with no explicit
limit) was stopped through the Coolify API to reduce concurrent pressure.

Only the manual `clamav` service was recreated from its existing Compose file.
Its `mem_limit` was changed from `1g` to `4g` after a preserved copy of the
Compose file was made. The image remained `clamav/clamav:1.4.3` and the
existing `clamav-signatures` volume remained attached. After recovery, manual
ClamAV was healthy, `clamdscan --ping=1` passed, TCP 3310 was listening,
Academic resolved and reached the private `clamav` service, and three
consecutive public Academic readiness checks returned HTTP 200. Scanner mode
remains `clamav`.

The pre-cutover recovery point `20260814T043815Z` was created through the
reviewed backup script with `BACKUP_REQUIRE_OFFHOST=1`. It includes both
logical database dumps, the Academic private-files archive, and SHA256SUMS;
local checksum verification, R2 upload, remote object existence, and remote
size verification all passed. The reviewed R2 runtime secret configuration
was verified without recording credential values.

After controlled maintenance began at `2026-08-14T04:37:44Z`, manual writers
and applications were stopped while manual PostgreSQL and ClamAV remained
running. Fresh final logical dumps were created in
`final-cutover-20260814T043847Z` and checksum-verified. Both dumps restored
successfully into the disposable native PostgreSQL resources using logical
`pg_restore --clean --if-exists`; all public-table record counts matched the
manual sources exactly. Migration histories also matched (Identity 2,
Academic 6), and the reviewed migration commands found no pending work.

Native private runtime validation then exposed a Coolify
`4.0.0-beta.473` deployment defect: after switching applications from the
reviewed `migrate` Dockerfile target to `runtime`, Coolify reused the same
SHA-tagged migrate image and skipped rebuilding the runtime target. The
generated containers therefore lacked the Dockerfile `HEALTHCHECK`; Coolify
failed its own rolling-update inspection and removed the new Identity and
Academic API containers. This is a platform deployment-target/rebuild issue,
not a product source or restored-data failure.

Per rollback policy, no canonical domains were assigned and no native service
became authoritative. Manual Identity, Academic API/Web, notification worker,
and sync worker were restarted against their untouched original volumes and
returned public HTTP 200 health/JWKS/readiness. Native ClamAV was stopped
again. Since the manual stack resumed writes, the restored native database
copies are now stale and must be refreshed from a new maintenance-window dump
before any future cutover attempt. No operator email correction, password
recovery, BL-002 change, or native worker activation occurred.

The temporary Coolify token file was removed after API operations. The R2
runtime secret file and root-only ACL rollback metadata remain retained.

## Cutover continuation: R2 gate passed; manual health gate failed

The owner-provided R2 runtime secret file was verified root-owned and mode
`0600`. Its five required variables were present without printing values, and
the approved endpoint, bucket, and prefix matched the reviewed configuration.
A non-destructive AWS CLI listing confirmed R2 authentication and bucket/prefix
access. The secret file remains retained at its owner-controlled location for
ongoing backups.

The production host was missing the reviewed backup script's PostgreSQL client
dependency. Only Ubuntu's `postgresql-client` package was installed; it
provides `pg_dump` and `pg_restore` version 16.14. No server, Docker, Coolify,
Traefik, or system upgrade was performed.

Before maintenance, the mandatory production health revalidation found a
regression in the authoritative manual stack:

- Academic Web and API liveness were HTTP 200, but Academic API readiness was
  HTTP 503;
- manual ClamAV was `unhealthy`;
- a direct non-destructive Academic API to manual ClamAV TCP PING check failed;
- Identity health/JWKS, both manual databases, and both manual workers
  remained healthy.

Manual ClamAV's container healthcheck reported a refused local clamd socket;
its update logs showed signature activity, but the actual Academic-to-ClamAV
connection failure means the manual production system is not eligible for a
database cutover. Per the cutover safety rule, no maintenance, worker stop,
backup artifact, database dump/restore, operator email correction, routing
change, password recovery, or worker cutover was performed.

The current required remediation is restoration of manual ClamAV reachability
and Academic readiness, followed by a new immediate pre-maintenance health
check. The temporary Coolify token file was removed after API use.

## Native Identity POSIX ACL key-custody gate: passed

The authorized Ubuntu `acl` package was installed without a system upgrade.
`getfacl` and `setfacl` are available. Before modification, ACL metadata was
saved at `/root/edupay-identity-keys-pre-native.acl`; it is non-empty,
root-owned, and mode `0600`. It is retained as the rollback source for
`setfacl --restore`.

The owner-configured Coolify Persistent Storage bind (UUID
`f66qy02pu6icsqhmzdzsazk3`) was validated in the actual native Identity
container: `/opt/edupay-pilot/keys` reaches `/keys`. Docker reports transport
`rw=true`, but the effective native runtime identity (UID 10001) is read-only
through POSIX ACLs. The key directory grants UID 10001 `r-x`; each static key
file grants UID 10001 `r--`. No write/default ACL was added.

The original key owners remain UID/GID `1000:1000`; no keys were regenerated,
replaced, copied, or read into output. POSIX ACL mask presentation changes the
displayed group-mode bits to `640`; this was not a `chmod` change and does not
grant the owning group access because the effective group entry remains
`group::---`. The owner permissions remain `rw-`, other users remain `---`,
and UID 10001 has no effective write permission.

Host and native-container tests passed without examining key content:

- both required files can be opened for read by UID 10001;
- write-open of a real private key is denied;
- native directory write is denied;
- a disposable UID-1000 mode-600 ACL-equivalent probe confirmed append,
  truncate, delete, rename, and chmod are all denied;
- the probe was removed by root after each test;
- host and container SHA256 fingerprints of both preserved files matched;
- native Identity health and structurally valid JWKS each returned HTTP 200;
- JWKS key ID matched the manual production keyset.

The Coolify application was redeployed a second time. The fresh container
again ran as UID 10001, retained the `/keys` bind, had matching fingerprints,
and passed read-only, health, and JWKS checks. Therefore:

`NATIVE_IDENTITY_KEY_GATE=PASS`

## Cutover continuation blocked before maintenance

After the key gate passed, pre-cutover health was revalidated: manual Academic
Web, Academic API live/ready, Identity health/JWKS, and exactly one manual
notification and sync worker were healthy. No maintenance mode was entered.

The reviewed off-host backup script requires five runtime-managed R2 variables
(`BACKUP_R2_ENDPOINT`, `BACKUP_R2_BUCKET`, `BACKUP_R2_PREFIX`,
`BACKUP_R2_ACCESS_KEY_ID`, and `BACKUP_R2_SECRET_ACCESS_KEY`). Their presence
was checked without printing values in the manual application environments,
approved backup locations, and root AWS configuration. They are unavailable,
so a required `BACKUP_REQUIRE_OFFHOST=1` recovery point cannot be created or
remotely verified. The cutover stopped before workers, applications, or
databases were stopped and before any dump, restore, email correction, domain
change, or password-recovery action.

The temporary Coolify API token file was removed after final API use; only its
absence was verified. The current external gate is provision of the reviewed
runtime R2 backup configuration, after which the sequence resumes at the
fresh pre-cutover off-host backup.

## Native Identity key-custody continuation: stopped at ACL prerequisite

The owner-configured native Coolify Persistent Storage record was confirmed
through the official API for `/opt/edupay-pilot/keys` to `/keys` (storage UUID
`f66qy02pu6icsqhmzdzsazk3`). The stale unsupported custom Docker run options
were removed. A private native Identity deployment then proved that the
generated container receives the directory at `/keys`; inspection showed the
actual Docker bind mount as read-write.

Host key metadata remains unchanged: the directory is owned by UID/GID
`1000:1000`, mode `755`, and the two keyset files are owned by UID/GID
`1000:1000`, mode `600`. The native runtime remains UID 10001.

The required POSIX ACL tooling (`getfacl` and `setfacl`) is not available on
the production host. Therefore a root-only ACL rollback record could not be
created and the minimum UID 10001 read-only ACL could not be expressed and
verified safely. No ACL, ownership, mode, or key contents were changed. No
key fingerprints or destructive permission probes were run, because the
required permission model was not in place.

The private native Identity instance was stopped through the official API.
The gate remains blocked: a supported, reviewable way to create and restore
the POSIX ACL is required before UID 10001 read access, write/delete/chmod
denial, key-byte equality, private JWKS, and redeploy-survival checks can be
performed. Cutover was not resumed; maintenance, backup, database migration,
domain routing, email correction, password recovery, and worker changes were
not entered. Manual production remained healthy throughout.

The temporary Coolify token file was removed after the API operations; only
its absence was verified.

## Authorized cutover attempt: stopped at private Identity validation

The merged Identity SHA `21a8cd9b10660bd4cb38679298393387a60b9eee`
was configured through the official Coolify API. Its reviewed `migrate` image
was built, and the reviewed migration command completed successfully against
the disposable native Identity PostgreSQL resource. The `runtime` image then
built and reached private health HTTP 200.

This attempt did **not** enter maintenance, take a pre-cutover backup, dump or
restore either manual database, run the operator email correction, dispatch a
password recovery message, start native workers, change a domain, or alter the
manual stack.

Private Identity JWKS validation returned HTTP 500. Container inspection found
the precise cause: Coolify API configuration retained the requested read-only
`/keys` bind and UID/GID override, but Coolify `4.0.0-beta.473` did not apply
either option to the generated native application container. That container
ran as the image UID 10001 and had no `/keys` mount, whereas the preserved key
files are mode `600` and owned by UID/GID `1000:1000`. The manual Identity
container continues to use the same key directory read-only as UID 1000.

No weaker key permissions, writable key mount, direct Coolify database change,
or product-code workaround was introduced. The failed private native Identity
instance was stopped through the Coolify API. This is the current cutover
blocker: native Identity must receive the existing signing keys through a
verified read-only mount and return private JWKS HTTP 200 before any
maintenance or database migration is authorized.

The temporary Coolify token file was removed after all authorized API work;
only its absence was verified.

## Authenticated continuation

The owner supplied SSH access to the production VPS. The temporary Coolify
token was loaded remotely from the owner-controlled root-only file without
printing its value. The official Coolify API returned `HTTP 200` for
authenticated server discovery. The earlier `HTTP 401` was caused by the
previous execution context being unable to reach the host and load the actual
token; no replacement token was created.

Discovered identifiers:

| Resource | Identifier | Result |
| --- | --- | --- |
| Server (`localhost`) | `h10grmpaqnhiissqexi1k4mu` | reachable |
| Project (`My first project`) | `p5gswqrr8ot1oaoxwytrpsho` | selected |
| Production environment | `oej046b1ozl6a1w329bx8zdd` | selected |
| Destination (`coolify`) | `iw45wt4voo7w0p9euhvt9t4v` | selected |
| Installed private GitHub App source | `vjr9t008k2g53wxr9zit7f0x` | discovered |

## Native resources prepared

| Resource | UUID | Preparation result |
| --- | --- | --- |
| `edupay-academico-web` | `qf65r4ltig6jhb6t8dmv2qyw` | built and `running:healthy`; no domain; port `3000/tcp` internal only |
| `edupay-academico-api` | `d8dqmfqwp45hkk2hdqodohav` | built and `running:healthy`; no domain; port `3001/tcp` internal only |
| `edupay-academico-notification-worker` | `upo2mfye6i58mtx9uch6vseq` | image build completed; stopped after validation; no native worker process running |
| `edupay-academico-sync-worker` | `pzqsdpn95gxuvgkt674qld08` | image build completed; stopped immediately after bounded validation; no native worker process running |
| `clamav` (`clamav/clamav:1.4.3`) | `ttrrmrkod9hmqo68er6q2ghs` | private and `running:healthy`; no public port; internal alias configured |
| `academico-db` (`postgres:15-alpine`) | `v5w9hacwtftulf4m46l1rn2g` | new native DB, private and `running:healthy` |
| `identity-db` (`postgres:15-alpine`) | `bluypktxta8uisbrfzu6p9pw` | new native DB, private and `running:healthy` |
| `edupay-identity-api` | `tbv6wqmv2h0u4flrufjzch4b` | reviewed runtime and migrate images built at `21a8cd9b...`; stopped after private JWKS mount failure; no domain |

Academic source-linked resources use `Sherydans12/edupay-academico`, branch
`main`, reviewed SHA `5b0ad1f5f8ab0552ed1c502f30840b4afcc13fd8`, with the
reviewed Dockerfile paths under `deploy/`. No canonical domain was assigned.
The Identity resource now uses reviewed SHA
`21a8cd9b10660bd4cb38679298393387a60b9eee`, its root `Dockerfile`, and its
reviewed `runtime` and `migrate` targets. Its runtime remains stopped pending
the verified signing-key mount and JWKS gate.

The bounded Identity email operation was prepared as disabled scheduled task
`identity-email-runner`, UUID `v11g6tkhxbb2ebhdrlw2uli9`, command
`node dist/email/worker-main.js`, hourly frequency, and no execution was
triggered. Final Identity cutover also waits for the separate reviewed
`fix/admin-email-change` merge.

## Storage, secrets, and private validation

- Academic API bind mounts are the accepted host directories mounted at the
  exact matching container paths, read-write, without copying or replacing
  live files. The host directories are owned by UID/GID `1000:1000`, mode
  `700`, matching the runtime user expectation.
- The existing Identity key directory is preserved at `/opt/edupay-pilot/keys`
  and the manual Identity mount remains read-only. No signing keys were
  regenerated. Native Coolify application configuration alone did not create
  the required runtime mount; this is the blocking validation failure.
- Known manual runtime configuration was transferred into native resources
  in memory through Coolify-managed environment entries; values were not
  printed or committed. Preview duplicates were removed; final checks found
  no preview entries or duplicate runtime keys.
- Native Academic API migration completed successfully against the new native
  database: six migrations were found and no migrations remained pending.
- Native Academic readiness returned HTTP 200 with database, storage, and
  malware scanner checks all `ok`.
- Native workers were not left running. The manual notification and sync
  workers remain the only active worker pair.

## Remaining cutover procedure

1. Provide the reviewed runtime R2 backup configuration required to create and
   remotely verify the mandatory pre-cutover recovery point.
2. Verify all native resources and
   configuration again.
3. Enter maintenance/no-write mode and stop the manual singleton workers.
4. Create and verify a fresh off-host R2 backup, then take final logical dumps
   of both manual PostgreSQL databases.
5. Restore with `pg_restore` into the two native databases and verify schema,
   migrations, and record counts.
6. Start native ClamAV, Identity, Academic API, and Academic Web; validate
   privately before routing changes.
7. Disable the handwritten routes in a controlled order, assign the canonical
   domains to native resources, and validate TLS, browser, API, and auth.
8. Start exactly one native notification worker and one native sync worker;
   validate the bounded Identity email task without unnecessary mail delivery.
9. Keep the manual stack stopped but intact for rollback. Remove the
   handwritten routing only after sustained native validation.

Rollback is to stop native writers/workers, restore the old manual proxy
routes, restart the manual stack against its untouched volumes, validate the
canonical origins, and avoid concurrent writes to both database copies.

BL-002 remains unchanged; its backend origin is recorded as
`https://api-edupay.baselogic.cl`, and no synchronization was run.

## Scope and safety boundary

The continuation records only authorized native-resource preparation. The
manual stack, its PostgreSQL volumes, private Academic storage, handwritten
proxy configuration, BL-002 resources, and all canonical production domains
were left unchanged. No database restore, live synchronization, domain
assignment, or final Identity cutover was performed.

## Read-only checks

| Check | Result |
| --- | --- |
| Worktree/branch | `ops/pilot-production-deployment`, clean at the evidence base |
| Coolify health endpoint | `HTTP 200` from the recorded Coolify host on port `8000` |
| Unauthenticated Coolify API discovery | `HTTP 401` for `/api/v1/servers`; authenticated discovery was not possible from this execution context |
| Academic Web | `HTTP 200`, `/api/health` returned `status: ok` |
| Academic API liveness | `HTTP 200`, `/api/v1/health/live` returned `status: ok` |
| Academic API readiness | `HTTP 200`, database, storage, and malware scanner checks returned `ok` |
| Identity liveness | `HTTP 200`, `/api/v1/identity/health` returned `status: ok` |
| BL-002 frontend | `HTTP 200` at `https://edupay.baselogic.cl` |
| BL-002 backend origin | Recorded as `https://api-edupay.baselogic.cl`; no synchronization run |
| Canonical domain changes | None |

## Historical blocked state (superseded by the authenticated continuation)

The owner-provided `/root/coolify-agent.env` was not present in this
execution environment, and the available SSH credentials were rejected by the
recorded production host. The token was therefore not loaded, printed, or
used. The temporary token file was not removed because it could not be reached;
the owner/operator must remove it after the authorized Coolify API session and
record `COOLIFY_TEMP_TOKEN_FILE_REMOVED`.

Because authenticated API access was unavailable, no Coolify UUIDs were
invented and no native resources were created or configured. The following
remain pending authenticated discovery and preparation:

- server, project, production environment, destination, and GitHub App UUIDs;
- native Academic Web/API and singleton worker applications;
- private ClamAV resource;
- empty native Academic and Identity PostgreSQL 15 resources;
- Identity API and bounded email-runner preparation;
- bind-mount ownership/permission verification on the production host.

## Required continuation gate

Resume only when the operator provides an approved execution path that can
read `/root/coolify-agent.env` without exposing its contents, or makes the
token file available to the authorized deployment runner. Then perform
authenticated Coolify API discovery and preparation, verify every created
resource, remove the temporary token file, and keep the operational state on
HOLD until the Identity email-change fix SHA and all database/storage/build
gates are green.

## Cutover remains blocked

The final sequence is unchanged: maintenance/no-write state; stop singleton
workers; fresh verified R2 backup; final logical dumps; restore and verify both
native databases; validate native services privately; controlled proxy/domain
switch; browser/API/auth validation; and manual-stack stop-with-rollback
retention. Do not run two active worker sets or delete the manual rollback
resources before successful validation.
