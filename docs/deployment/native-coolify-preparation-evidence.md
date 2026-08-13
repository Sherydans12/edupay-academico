# Native Coolify pilot preparation evidence

Status: **HOLD_PENDING_EXTERNAL_PRODUCTION_GATES**

Evidence base: `36721e1cd33f97bca34c0f870cfefa99cdf6de22`

Recorded: 2026-08-13

## Scope and safety boundary

This record covers only read-only validation from the deployment worktree. The
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

## External access blocker

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

