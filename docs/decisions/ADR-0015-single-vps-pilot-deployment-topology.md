# ADR-0015: single-VPS pilot deployment topology

Status: Proposed; does not resolve D-15

Date: 2026-08-10

Decision authority: Platform and operations owner approval required

## Context

The functionally complete Académico and Identity services need a controlled
Colegio Conquistadores pilot deployment. The pilot should be operable on one
Docker/Coolify-style VPS without coupling the two services' databases or
silently turning the local Academic filesystem adapter into a multi-node store.
Provider, region, backup destination, RTO/RPO, support, audit retention, and
pilot-success decisions remain open in D-15, D-17, and D-18. Malware scanning,
retention, deletion, and legal hold remain open in D-11.

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
