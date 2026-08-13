# Native Coolify pilot preparation evidence

Status: **HOLD_PENDING_NATIVE_IDENTITY_KEY_MOUNT**

Previous evidence base: `a6cbeb41ea1c80ed85c64f09cfd6f73711b02da3`

Recorded: 2026-08-13

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

1. Resolve the Coolify native Identity read-only key-mount propagation issue
   and revalidate private Identity health and JWKS.
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
