# Colegio Conquistadores pilot release evidence

Status: safe generated template. Disposable or automated results are not
production acceptance. Replace only the marked fields with non-secret evidence;
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
| EduPay Identity  | `020d22f8eefde35d255ea9c5fe5b44aa848045e2` | clean `main`, matched `origin/main` at validation start | DISPOSABLE / AUTOMATED CI baseline |
| BL-002 EduPay    | `abc3776631d5940759d1a45ad949413174f2acf9` | clean `main`, matched `origin/main` at validation start | DISPOSABLE / AUTOMATED CI baseline |

## Gate results

| Gate                                     | Result                 | Classification                 | Safe evidence / link |
| ---------------------------------------- | ---------------------- | ------------------------------ | -------------------- |
| GitHub/Linux workflow run                | `<run id / URL>`       | AUTOMATED CI                   | `<link>`             |
| Prisma validation/generation             | `<PASS/FAIL>`          | AUTOMATED CI                   | `<details>`          |
| lint/typecheck/normal tests/build        | `<PASS/FAIL>`          | AUTOMATED CI                   | `<details>`          |
| PostgreSQL-backed tests                  | `<PASS/FAIL>`          | AUTOMATED CI / DISPOSABLE      | `<details>`          |
| API image build                          | `<PASS/FAIL; digest>`  | AUTOMATED CI                   | `<digest>`           |
| Web image build                          | `<PASS/FAIL; digest>`  | AUTOMATED CI                   | `<digest>`           |
| Compose syntax/runtime/health            | `<PASS/FAIL>`          | AUTOMATED CI / DISPOSABLE      | `<details>`          |
| Academic migration status/deploy         | `<PASS/FAIL>`          | DISPOSABLE; production pending | `<details>`          |
| `pilot:e2e`                              | `<PASS/FAIL>`          | AUTOMATED CI / DISPOSABLE      | `<details>`          |
| ClamAV image/version/signature timestamp | `<version; timestamp>` | DISPOSABLE; production pending | `<details>`          |
| Clean synthetic upload/download          | `<PASS/FAIL>`          | DISPOSABLE / PRODUCTION        | `<details>`          |
| EICAR rejection/download denial          | `<PASS/FAIL>`          | DISPOSABLE / PRODUCTION        | `<details>`          |
| Staging/quota cleanup                    | `<PASS/FAIL>`          | DISPOSABLE / PRODUCTION        | `<details>`          |
| Backup/checksum                          | `<PASS/FAIL>`          | AUTOMATED CI / DISPOSABLE      | `<details>`          |
| Restore/database/file-byte verification  | `<PASS/FAIL>`          | AUTOMATED CI / DISPOSABLE      | `<details>`          |
| Identity tenant-admin bootstrap          | `<PASS/FAIL>`          | DISPOSABLE / PRODUCTION        | `<details>`          |
| Academic tenant bootstrap                | `<PASS/FAIL>`          | DISPOSABLE / PRODUCTION        | `<details>`          |
| Activation/login                         | `<PASS/FAIL>`          | DISPOSABLE / PRODUCTION        | `<details>`          |
| BL-002 incremental sync                  | `<PASS/FAIL>`          | AUTOMATED CI / DISPOSABLE      | `<details>`          |
| BL-002 full sync                         | `<PASS/FAIL>`          | AUTOMATED CI / DISPOSABLE      | `<details>`          |
| Notification/sync/Identity worker checks | `<PASS/FAIL>`          | DISPOSABLE / PRODUCTION        | `<details>`          |

## Migration and image evidence

- Academic migration result: `<status and migration revision>`
- Identity migration result: `<status and migration revision>`
- BL-002 migration result, if same host: `<status and migration revision>`
- API image digest: `<sha256>`
- Web image digest: `<sha256>`
- ClamAV image digest/version: `<value>`
- ClamAV signature database timestamp: `<value>`

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
- Production release decision: `<OWNER-APPROVED / HOLD>`
- Named approver/date: `<non-secret name/date>`
- Production-only gates still open: `<list>`
