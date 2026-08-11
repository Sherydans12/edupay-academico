# ADR-0017: single-VPS pilot deployment topology

Status: Proposed; does not resolve D-15

Date: 2026-08-10

Decision authority: Platform and operations owner approval required

## Context

The functionally complete Académico and Identity services need a controlled
Colegio Conquistadores pilot deployment. The pilot should be operable on one
Docker/Coolify-style VPS without coupling the two services' databases or
silently turning the local Academic filesystem adapter into a multi-node store.
Provider, region, backup destination, RTO/RPO, and support decisions remain
open in D-15.
The controlled-pilot malware, retention, deletion, and legal-hold gate is
resolved by [ADR-0018](ADR-0018-file-security-retention-and-malware-policy.md);
permanent statutory/contractual policy remains future work.

## Proposed topology

- Public: one Academic web service, one Academic API service, and one Identity API service, all behind HTTPS.
- Private: one Academic notification worker and one Identity email worker/scheduled runner.
- Data: separate private Academic and Identity PostgreSQL services and a private persistent Academic final-files volume plus separate staging volume.
- Network: browser-to-web, browser-to-Identity API, web-to-Academic API, Academic API-to-private/HTTPS Identity internal API, and service-to-own-database paths only.
- No PostgreSQL port, private file path, Identity service token, refresh cookie, or JWT private key is public.
- Migrations run as explicit one-shot jobs before application/worker startup.
- One Academic notification worker and one Identity email runner operate during the pilot; scale-out remains an operational follow-up.

## Configuration and security constraints

- Browser-facing URLs are HTTPS and exact-origin allowlisted; no wildcard CORS is permitted.
- Identity's `__Host-edupay-refresh` Secure/HttpOnly cookie remains enabled in production.
- The same server-only service credential is configured as Identity current token and Académico internal token; Identity's previous-token overlap is used for rotation.
- Academic local storage validates both persistent paths and physical free-space guards at production startup/readiness. The adapter remains explicitly single-node.
- Logs correlate `X-Request-Id`, Identity session/internal calls, notification delivery, upload, and submission actions without logging secrets or file bytes.

## Consequences

This topology is inexpensive and suitable for a controlled single-school pilot,
but the VPS is a concentrated failure domain. Backups must leave the live host
where possible, restoration must be tested on a disposable target, and
horizontal Academic API scaling must wait for a reviewed shared object-storage
decision. Identity readiness remains liveness plus deployment-level database
and smoke evidence until Identity adds a dependency-aware endpoint.

## Acceptance required before marking D-15 resolved

The platform/operations owner must approve the provider/region, private network
and firewall rules, backup destination and retention, RTO/RPO, certificate
ownership, on-call/support path, worker scheduling/locking, restore evidence,
and the residual single-node storage risk. This proposed ADR intentionally does
not make those choices on the owner's behalf.

## Recommended controlled-pilot baseline for owner acceptance

The recommended D-15 baseline is one Ubuntu 24.04 single-node VPS with one
public HTTPS reverse proxy. Public routes are Academic web, Academic API, and
Identity API. Academic and Identity PostgreSQL, the Academic notification and
sync workers, the Identity email worker, ClamAV, and Academic final/staging
storage remain private. The two databases remain separate. TLS is managed by
the reverse proxy through an automated public CA renewal mechanism such as
Let's Encrypt; manually copied long-lived certificate files are not the
baseline. Public ingress is limited to required HTTP/HTTPS and SSH management
paths; PostgreSQL, ClamAV, storage, and worker ports are not public.

For the controlled pilot, the recommended backup target is outside the live
application volumes, with PostgreSQL and finalized private file evidence copied
at least every six hours, at least 14 daily recovery points during/around the
pilot, at least four weekly recovery points while evidence is operationally
required, and a checksum on every backup. The internal operational targets are
RPO <= 6 hours and RTO <= 8 hours; they are not contractual SLAs. A disposable
restore must pass before real pilot data is accepted.

The single-node Academic file adapter risk is explicitly accepted only for this
small controlled pilot. The residual risks are a concentrated VPS failure
domain, no HA/failover, and future horizontal-scaling work if shared object
storage is required. Support has no 24x7 contractual SLA: one named technical
owner handles immediate escalation for data loss, cross-tenant exposure,
credential exposure, or complete outage; ordinary issues use the available
support window; impersonation remains out of scope and support context is
explicit, tenant-bounded, and audited.

## D-15 owner-acceptance record — open

Leave this ADR Proposed until every entry below is completed with an actual
owner-approved fact. This release-validation branch must not infer values from
the operator's location, provider defaults, or an example deployment.

- Provider and product: **OWNER INPUT REQUIRED**
- Actual VPS region: **OWNER INPUT REQUIRED**
- Off-host backup destination and custody/access owner: **OWNER INPUT REQUIRED**
- Reverse-proxy and certificate renewal owner: **OWNER INPUT REQUIRED**
- Named technical/support owner and escalation window: **OWNER INPUT REQUIRED**
- Acceptance of RPO <= 6 hours and RTO <= 8 hours for the controlled pilot: **OWNER INPUT REQUIRED**
- Firewall/SSH management policy and private-network confirmation: **OWNER INPUT REQUIRED**
- Restore evidence and residual single-node file-adapter risk acceptance: **OWNER INPUT REQUIRED**
