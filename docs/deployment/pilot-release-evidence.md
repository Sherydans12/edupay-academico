# Colegio Conquistadores pilot release evidence

Status: `READY_FOR_PRODUCTION_DEPLOYMENT_VALIDATION`. Technical and disposable
gates are green, and D-15 is owner-approved for the controlled pilot. All
technical results below remain AUTOMATED CI / DISPOSABLE evidence; no
production deployment has occurred and this file is not production acceptance.
Replace only the marked fields with non-secret evidence;
never paste credentials, tokens, activation codes, private keys, database URLs,
or EICAR bytes into this file.

## Evidence classification

- `AUTOMATED CI`: GitHub Actions Linux workflow result, linked by run ID.
- `DISPOSABLE`: synthetic databases/files/services created and removed by a
  validation harness.
- `PRODUCTION`: evidence collected from the owner-approved pilot host after
  D-15 acceptance.
- `OWNER-APPROVED`: an operational fact or decision explicitly supplied by the
  named owner.

## Reviewed source baseline

| Repository       | Observed commit SHA                        | Worktree status                                         | Classification                     |
| ---------------- | ------------------------------------------ | ------------------------------------------------------- | ---------------------------------- |
| EduPay Académico | `ae944e09cd03fc4740c4ee35189682ecfc0a0e85` | clean release/pilot-validation worktree at latest green validation | DISPOSABLE / AUTOMATED CI baseline |
| EduPay Identity  | `16838f526a4ee48fbb518b840fe0c19e766395cf` | clean `main`, matched `origin/main`; PR #1 email-worker fix verified | DISPOSABLE / AUTOMATED CI baseline |
| BL-002 EduPay    | `abc3776631d5940759d1a45ad949413174f2acf9` | clean `main`, matched `origin/main` at validation start | DISPOSABLE / AUTOMATED CI baseline |

## Current-main Identity verification

- Verified `origin/main` and local `main`: `16838f526a4ee48fbb518b840fe0c19e766395cf`.
- PR #1 is merged and contains the reviewed fix: `EmailModule` is imported by
  `AppModule`, and the compiled worker resolves `EmailOutboxService` from the
  selected module with strict Nest DI before calling `deliverPending()`.
- Fresh Académico PR #3 validation against this Identity SHA: **PASS**.

## Validated release heads

- Académico validation SHA: `ae944e09cd03fc4740c4ee35189682ecfc0a0e85`
- Identity `main`: `16838f526a4ee48fbb518b840fe0c19e766395cf`
- BL-002 `main`: `abc3776631d5940759d1a45ad949413174f2acf9`

## Gate results

| Gate                                     | Result                 | Classification                 | Safe evidence / link |
| ---------------------------------------- | ---------------------- | ------------------------------ | -------------------- |
| GitHub/Linux workflow run                | `PASS; 31544926237`    | AUTOMATED CI                   | [green run](https://github.com/Sherydans12/edupay-academico/actions/runs/31544926237) |
| Prisma validation/generation             | `PASS`                 | AUTOMATED CI                   | Repository release gate |
| lint/typecheck/normal tests/build        | `PASS`                 | AUTOMATED CI                   | Repository release gate |
| PostgreSQL-backed tests                  | `PASS`                 | AUTOMATED CI / DISPOSABLE      | PostgreSQL release gate |
| API image build                          | `PASS; c8404f87cf1ba2e767699f16308ef26cfd275b90f3fb6336f1b9b9c5fc674b12` | AUTOMATED CI | Linux topology gate |
| Web image build                          | `PASS; 74db71a1001d4b6dc229b699f502b07ba8c6bfc1f5f0c3e7d47e7b79031306c6` | AUTOMATED CI | Linux topology gate |
| Compose syntax/runtime/health            | `PASS`                 | AUTOMATED CI / DISPOSABLE      | API/Web/DB/ClamAV health routes passed |
| Academic migration status/deploy         | `PASS`                 | DISPOSABLE; production pending | PostgreSQL, Compose, and smoke gates |
| `pilot:e2e`                              | `PASS`                 | AUTOMATED CI / DISPOSABLE      | Full pilot with real ClamAV |
| ClamAV image/version/signature timestamp | `clamav/clamav:1.4.3; signature timestamp not emitted` | DISPOSABLE; production pending | Private topology; production timestamp pending |
| Clean synthetic upload/download          | `PASS`                 | AUTOMATED CI / DISPOSABLE      | Full pilot with real ClamAV |
| EICAR rejection/download denial          | `PASS`                 | AUTOMATED CI / DISPOSABLE      | Rejected; never AVAILABLE/downloadable |
| Staging/quota cleanup                    | `PASS`                 | AUTOMATED CI / DISPOSABLE      | Failed reservation released; staging clean |
| Backup/checksum                          | `PASS`                 | AUTOMATED CI / DISPOSABLE      | Separate disposable target; SHA256 verified |
| Restore/database/file-byte verification  | `PASS`                 | AUTOMATED CI / DISPOSABLE      | Both DBs and retained file bytes verified |
| Identity tenant-admin bootstrap          | `PASS`                 | AUTOMATED CI / DISPOSABLE      | Actual command; same UUID; idempotent and incompatible rerun checks |
| Identity email outbox lifecycle          | `PASS`                 | AUTOMATED CI / DISPOSABLE      | Normal email activation created one intent; Resend not called |
| Academic tenant bootstrap                | `PASS`                 | AUTOMATED CI / DISPOSABLE      | Same canonical UUID; quota/accounting present |
| Activation/login                         | `PASS`                 | AUTOMATED CI / DISPOSABLE      | Normal one-time activation and TENANT_ADMIN login |
| BL-002 incremental sync                  | `PASS`                 | AUTOMATED CI / DISPOSABLE      | Current BL-002 main; source identities/enrollments/watermark |
| BL-002 full sync                         | `PASS`                 | AUTOMATED CI / DISPOSABLE      | Snapshot completion and watermark verified |
| Notification/sync/Identity worker checks | `PASS`                 | AUTOMATED CI / DISPOSABLE      | Academic checks plus built Identity `email:deliver` |

## Migration and image evidence

- Academic migration result: `PASS in disposable PostgreSQL/Compose/consumer gates; production revision pending`
- Identity migration result: `PASS in disposable bootstrap/backup gates; production revision pending`
- BL-002 migration result, if same host: `PASS in disposable source smoke; same-host deployment not approved`
- API image digest: `sha256:c8404f87cf1ba2e767699f16308ef26cfd275b90f3fb6336f1b9b9c5fc674b12`
- Web image digest: `sha256:74db71a1001d4b6dc229b699f502b07ba8c6bfc1f5f0c3e7d47e7b79031306c6`
- ClamAV image digest/version: `clamav/clamav:1.4.3; CI image digest not recorded`
- ClamAV signature database timestamp: `not emitted by disposable gate; production evidence required`

## OWNER-APPROVED / D-15

Accepted 2026-08-11 by the owner for the **CONTROLLED COLEGIO
CONQUISTADORES PILOT**. This decision is not permanent production
architecture for all future tenants.

- Provider: **Hostinger**.
- Product: **Hostinger VPS KVM 4**.
- Operating system: **Ubuntu 24.04 LTS**.
- Provider-displayed location: **Brazil - Campinas**.
- Topology/residual risk: single-node VPS, single-node Academic private
  filesystem, no HA/failover, horizontal scale-out deferred, and future
  object-storage architecture review required before multi-node scaling.
  These risks are accepted only for this controlled pilot.
- Off-host backup: **Cloudflare R2**. The live Hostinger filesystem is not the
  authoritative backup destination; R2 endpoint/account, bucket, and
  credentials remain runtime/secret-managed.
- Backup policy: at least every 6 hours; at least 14 daily recovery points and
  at least 4 weekly recovery points while operational evidence is required;
  checksums required; one disposable restore before real pilot data.
- RPO: **<= 6 hours**, internal operational target, not a contractual SLA.
- RTO: **<= 8 hours**, internal operational target, not a contractual SLA.
- Support: no 24x7 contractual SLA; **Nicolás Sena** is the primary technical
  owner. Critical incidents receive immediate/manual escalation when noticed;
  ordinary issues use the operator's available support window. No
  impersonation; support is explicit, tenant-scoped, and audited.
- TLS/reverse proxy: Coolify/deployment reverse-proxy layer with automated
  ACME/public-CA renewal; owner **pilot infrastructure / Nicolás Sena**.
  Actual proxy implementation and certificate evidence remain production-only.
- Firewall/SSH: TCP 80 only where needed for HTTP-to-HTTPS/ACME, TCP 443, and
  SSH administrative access publicly; databases, ClamAV, storage, workers,
  and internal service ports private. SSH keys, password authentication
  disabled after access confirmation, direct root login disabled after sudo
  confirmation, and source-IP restriction where practical.

## D-16 technical status

The configurable theme does not technically block deployment. Missing exact
Colegio logos/assets/colors, if still missing, are UX release polish and not an
infrastructure blocker.

## Final owner decision

- ADR-0017 status: `Accepted for controlled pilot` on `2026-08-11`.
- Technical release status: `READY_FOR_PRODUCTION_DEPLOYMENT_VALIDATION`.
- Production deployment status: **not deployed; production evidence pending**.

## Production-only gates still open

These are deployment execution gates, not unresolved architecture decisions:

- Connect to the actual Hostinger VPS; verify Ubuntu version/resources and the
  provider-visible `Brazil - Campinas` placement where operational evidence
  requires it.
- Apply host updates; confirm DNS; verify Coolify/reverse proxy and real
  TLS/ACME issuance.
- Apply the firewall and SSH hardening baseline without locking out the
  operator.
- Load production secrets; create private networks/volumes; start separate
  production PostgreSQL services; run production migrations.
- Verify production ClamAV health and signature state.
- Configure Cloudflare R2 credentials/bucket; perform an actual off-host
  backup upload and actual R2 restore verification.
- Run tenant bootstrap, activation/login, production AcademicYear creation,
  source SyncConfig, initial full synchronization, and roster review.
- Run clean-file and controlled EICAR storage smoke tests.
- Run notification/email smoke, final backup, and final release sign-off.
