# Colegio Conquistadores pilot release evidence

Status: safe generated evidence record awaiting a fresh current-main rerun.
Disposable or automated results are not production acceptance.
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
| EduPay Académico | `fb2a462f60ba5884e4a2a60eb34ec5169317da87` | clean at validation start                               | DISPOSABLE / AUTOMATED CI baseline |
| EduPay Identity  | `16838f526a4ee48fbb518b840fe0c19e766395cf` | clean `main`, matched `origin/main`; PR #1 email-worker fix verified | DISPOSABLE / AUTOMATED CI baseline |
| BL-002 EduPay    | `abc3776631d5940759d1a45ad949413174f2acf9` | clean `main`, matched `origin/main` at validation start | DISPOSABLE / AUTOMATED CI baseline |

## Current-main Identity verification

- Verified `origin/main` and local `main`: `16838f526a4ee48fbb518b840fe0c19e766395cf`.
- PR #1 is merged and contains the reviewed fix: `EmailModule` is imported by
  `AppModule`, and the compiled worker resolves `EmailOutboxService` from the
  selected module with strict Nest DI before calling `deliverPending()`.
- Fresh Académico PR #3 validation against this Identity SHA: **PENDING**.

## Gate results

| Gate                                     | Result                 | Classification                 | Safe evidence / link |
| ---------------------------------------- | ---------------------- | ------------------------------ | -------------------- |
| GitHub/Linux workflow run                | `RERUN PENDING; previous run 31528621315 failed only at pre-fix Identity worker` | AUTOMATED CI | [previous run](https://github.com/Sherydans12/edupay-academico/actions/runs/31528621315) |
| Prisma validation/generation             | `PASS`                 | AUTOMATED CI                   | Repository release gate |
| lint/typecheck/normal tests/build        | `PASS`                 | AUTOMATED CI                   | Repository release gate |
| PostgreSQL-backed tests                  | `PASS`                 | AUTOMATED CI / DISPOSABLE      | PostgreSQL release gate |
| API image build                          | `PASS; b96e1d357b3c2f59894419f89e0dd6491c7668492173e4f2af92957d1f3481df` | AUTOMATED CI | Linux topology gate |
| Web image build                          | `PASS; b2f06c9dd3f060316b5646d6a2cdd8611ab770f2bb038c38f0e902b95c0d79cf` | AUTOMATED CI | Linux topology gate |
| Compose syntax/runtime/health            | `PASS`                 | AUTOMATED CI / DISPOSABLE      | API/Web/DB/ClamAV health routes passed |
| Academic migration status/deploy         | `PASS`                 | DISPOSABLE; production pending | PostgreSQL, Compose, and smoke gates |
| `pilot:e2e`                              | `PASS`                 | AUTOMATED CI / DISPOSABLE      | Full pilot with real ClamAV |
| ClamAV image/version/signature timestamp | `clamav/clamav:1.4.3; signature timestamp not emitted` | DISPOSABLE; production pending | Private topology; production timestamp pending |
| Clean synthetic upload/download          | `PASS`                 | DISPOSABLE / PRODUCTION        | Full pilot with real ClamAV |
| EICAR rejection/download denial          | `PASS`                 | DISPOSABLE / PRODUCTION        | Rejected; never AVAILABLE/downloadable |
| Staging/quota cleanup                    | `PASS`                 | DISPOSABLE / PRODUCTION        | Failed reservation released; staging clean |
| Backup/checksum                          | `PASS`                 | AUTOMATED CI / DISPOSABLE      | Separate disposable target; SHA256 verified |
| Restore/database/file-byte verification  | `PASS`                 | AUTOMATED CI / DISPOSABLE      | Both DBs and retained file bytes verified |
| Identity tenant-admin bootstrap          | `RERUN PENDING against Identity 16838f5` | DISPOSABLE / PRODUCTION | Previous blocker is the reviewed PR #1 fix |
| Academic tenant bootstrap                | `PASS`                 | DISPOSABLE / PRODUCTION        | Same canonical UUID; quota/accounting present |
| Activation/login                         | `NOT REACHED`          | DISPOSABLE / PRODUCTION        | Blocked before activation by Identity worker |
| BL-002 incremental sync                  | `PASS`                 | AUTOMATED CI / DISPOSABLE      | Current BL-002 main; source identities/enrollments/watermark |
| BL-002 full sync                         | `PASS`                 | AUTOMATED CI / DISPOSABLE      | Snapshot completion and watermark verified |
| Notification/sync/Identity worker checks | `PARTIAL; Academic notification/sync PASS; Identity email FAIL` | DISPOSABLE / PRODUCTION | Compiled `--check` plus actual Identity runner |

## Migration and image evidence

- Academic migration result: `PASS in disposable PostgreSQL/Compose/consumer gates; production revision pending`
- Identity migration result: `PASS in disposable bootstrap/backup gates; production revision pending`
- BL-002 migration result, if same host: `PASS in disposable source smoke; same-host deployment not approved`
- API image digest: `sha256:b96e1d357b3c2f59894419f89e0dd6491c7668492173e4f2af92957d1f3481df`
- Web image digest: `sha256:b2f06c9dd3f060316b5646d6a2cdd8611ab770f2bb038c38f0e902b95c0d79cf`
- ClamAV image digest/version: `clamav/clamav:1.4.3; CI image digest not recorded`
- ClamAV signature database timestamp: `not emitted by disposable gate; production evidence required`

## D-15 facts

- Provider/product: **OWNER INPUT REQUIRED**
- Actual VPS region: **OWNER INPUT REQUIRED**
- Off-host backup destination/custody: **OWNER INPUT REQUIRED**
- Reverse-proxy/certificate owner: **OWNER INPUT REQUIRED**
- Named support owner/window: **OWNER INPUT REQUIRED**
- RPO <= 6 hours accepted: **OWNER INPUT REQUIRED**
- RTO <= 8 hours accepted: **OWNER INPUT REQUIRED**
- Firewall/SSH policy: **OWNER INPUT REQUIRED**
- Restore evidence and single-node file-adapter risk accepted: **OWNER INPUT REQUIRED**

## D-16 technical status

The configurable theme does not technically block deployment. Missing exact
Colegio logos/assets/colors, if still missing, are UX release polish and not an
infrastructure blocker.

## Final owner decision

- ADR-0017 status: `Proposed` until the D-15 owner record above is complete.
- Production release decision: `HOLD pending current-main rerun`
- Named approver/date: `<non-secret name/date>`
- Production-only gates still open: `current-main Identity rerun; D-15 owner facts; production migration/image/ClamAV signature/backup/restore evidence`
