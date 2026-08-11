# ADR-0017: single-VPS pilot deployment topology

Status: Accepted for controlled pilot

Date: 2026-08-10
Accepted: 2026-08-11

Decision authority: Platform and operations owner

## Context

The functionally complete Académico and Identity services need a controlled
Colegio Conquistadores pilot deployment. The pilot should be operable on one
Docker/Coolify-style VPS without coupling the two services' databases or
silently turning the local Academic filesystem adapter into a multi-node store.
The owner-approved deployment facts are recorded below for the controlled
Colegio Conquistadores pilot. This ADR is not a permanent production
architecture decision for all future tenants.
The controlled-pilot malware, retention, deletion, and legal-hold gate is
resolved by [ADR-0018](ADR-0018-file-security-retention-and-malware-policy.md);
permanent statutory/contractual policy remains future work.

## Accepted controlled-pilot topology

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

## D-15 owner acceptance — controlled Colegio Conquistadores pilot

Accepted by the owner on **2026-08-11**. The decision scope is **CONTROLLED
COLEGIO CONQUISTADORES PILOT**, not permanent production architecture for all
future tenants.

- Provider/product: **Hostinger / Hostinger VPS KVM 4**.
- Operating system: **Ubuntu 24.04 LTS**.
- Actual provider-displayed location: **Brazil - Campinas**.
- Topology: one public reverse proxy and one single-node VPS. Public routes are
  Academic web, Academic API, and Identity API. Academic and Identity
  PostgreSQL, Academic notification and sync workers, Identity email worker,
  ClamAV, and Academic final/staging storage remain private. The databases
  remain separate.
- TLS: the Coolify/deployment reverse-proxy layer owns automated ACME/public-CA
  issuance and renewal, such as Let's Encrypt. Owner: **pilot infrastructure /
  Nicolás Sena**. The actual proxy implementation and successful certificate
  issuance remain production evidence to capture after deployment.
- Off-host backup: **Cloudflare R2** is the durable recovery destination for
  completed checksum-verified backup sets. R2 is for off-host backups only; the
  Academic runtime filesystem remains the private single-node pilot adapter.
  Credentials and bucket details are runtime/secret-managed and are not stored
  in this repository.
- Backup policy: PostgreSQL and finalized private file evidence leave the live
  volumes at least every six hours; retain at least 14 daily recovery points
  during/around the pilot and at least four weekly recovery points while pilot
  evidence remains operationally required. Every backup is checksum-verified,
  and at least one disposable restore is required before accepting real pilot
  data. A local staging copy is not a successful production backup until its
  R2 transfer and remote presence checks pass.
- Operational targets: **RPO <= 6 hours** and **RTO <= 8 hours**. These are
  internal pilot targets, not contractual SLAs.
- Support: no 24x7 contractual SLA. **Nicolás Sena** is the primary technical
  owner. Critical incidents receive immediate/manual escalation when noticed;
  ordinary non-critical issues use the operator's available support window.
  Support remains explicit, tenant-scoped, audited, and non-impersonating; no
  implicit `SYSTEM_ADMIN` tenant access exists.
- Firewall: public ingress is limited to TCP 80 where needed for HTTP-to-HTTPS
  and ACME, TCP 443, and SSH administrative access. PostgreSQL, ClamAV,
  storage, worker, and other internal service ports remain private.
- SSH: key authentication is required; password authentication is disabled and
  direct remote root login is disabled only after operator access and sudo are
  confirmed. Administrative SSH is source-IP restricted where practical, and
  no application service runs as root for convenience.
- Accepted residual risk: concentrated single-VPS failure domain, single-node
  Academic private filesystem, no HA/failover, horizontal scale-out deferred,
  and a future object-storage architecture review required before multi-node
  scaling. These risks are accepted only for this controlled pilot baseline.
