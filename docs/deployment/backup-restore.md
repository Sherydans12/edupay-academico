# Pilot backup and restore

Status: owner-approved controlled-pilot operational baseline. Cloudflare R2 is
the approved durable off-host backup custody under ADR-0017. RPO/RTO targets,
cadence, retention, and support policy are accepted for the pilot; actual R2
credentials, bucket configuration, upload, and restore remain production
execution evidence. The pilot audit/support policy is defined by ADR-0019.

## Backup contents

Create one dated restore point every day containing:

1. an Academic PostgreSQL custom-format dump;
2. an Identity PostgreSQL custom-format dump;
3. a tarball of the private Academic final-file volume;
4. a non-secret deployment inventory containing secret names, owners,
   secret-manager references, key IDs, environment versions, and rotation dates.

The Academic dump includes EduPay sync configuration, terminal watermarks,
absence generations, leases, runs, and bounded conflict evidence. It must not
contain `EDUPAY_INTEGRATION_TOKEN`; that credential remains in managed runtime
secret custody and is represented in the inventory by reference only. A
restored worker may safely replay source pages from the last committed terminal
watermark.

Do not include the ClamAV signature database as application evidence unless an
operator explicitly chooses to preserve it as an operational cache. It can be
recreated and updated after restore. Do not include secret values, JWT private
keys, refresh cookies, database URLs, activation codes, or developer credentials. Do not place dumps in the live
database or application volume. The recommended destination is an encrypted
off-host object/filesystem location mounted only for the backup job. If that
The production destination is Cloudflare R2 using its S3-compatible API. R2 is
for off-host backups only, not runtime application object storage. The
endpoint/account, bucket, and credentials are runtime/secret-managed and are
represented only by `deploy/env/backup-r2.env.example`. If R2 transfer or
remote verification fails, the job must exit non-zero and the local staging
copy must not be reported as a successful production backup.

The pilot baseline is at least one checksum-verified backup every six hours,
with at least 14 daily recovery points during/around the pilot and at least 4
weekly recovery points while pilot evidence remains operationally required.
Keep the final file volume and its PostgreSQL metadata from the same dated
point. The staging/temp volume is intentionally separate scratch space and is
not a source of authoritative file evidence; confirm it is empty or separately
disposable. RPO <= 6 hours and RTO <= 8 hours are internal operational targets,
not contractual SLAs.

## Runnable backup command

From a Linux deployment host with `pg_dump`, `tar`, and `sha256sum`:

```sh
export ACADEMIC_DATABASE_URL='managed-secret-reference-injected-at-runtime'
export IDENTITY_DATABASE_URL='managed-secret-reference-injected-at-runtime'
export ACADEMIC_STORAGE_ROOT=/var/lib/edupay-academico/files
export ACADEMIC_STORAGE_TEMP_ROOT=/var/lib/edupay-academico/tmp
export BACKUP_ROOT=/var/lib/edupay-backup-staging
export DEPLOYMENT_INVENTORY_PATH=/etc/edupay/deployment-inventory.example
set -a
. /etc/edupay/backup-r2.env
set +a
export BACKUP_REQUIRE_OFFHOST=1
./ops/backup/backup-pilot.sh
```

The example values above are placeholders for secret injection; never paste
real credentials into shell history. Use the deployment platform's secret
environment injection or a protected `.pgpass`/credential mechanism. With
`BACKUP_REQUIRE_OFFHOST=1`, the script uses restrictive file permissions,
atomic partial-file renames, writes `SHA256SUMS`, invokes
`ops/backup/upload-to-r2.sh`, and reports success only after every uploaded
object is found remotely with the expected size. The upload helper never
prints credentials and does not prune local staging.

Schedule exactly one job at least every six hours, alert on non-zero exit, and
retain the approved daily/weekly recovery points in R2. The job must not run
inside every API or worker replica. A local staging directory is not the
authoritative recovery destination and may be pruned only after R2 verification
and according to retention policy.

## R2 transfer and remote verification

The transfer seam is intentionally small and uses the standard AWS CLI against
the Cloudflare R2 S3-compatible endpoint:

1. `backup-pilot.sh` writes one dated set to the local staging root.
2. It verifies `SHA256SUMS` before transfer.
3. `upload-to-r2.sh` copies the whole set to
   `s3://<bucket>/<prefix>/<dated-set>/` using runtime environment credentials.
4. It checks every remote object's presence and byte size with `head-object`.
5. Only a successful exit permits the operator to prune that local temporary
   set. Any transfer or verification failure is non-zero/fail-closed.

Do not place R2 credentials in command-line arguments, repository files,
application environment images, logs, or backup contents. Do not claim
off-host production custody from the disposable CI gate; that gate validates
the local backup/restore procedure only.

## Restore verification runbook

Use a disposable/staging PostgreSQL target and a storage path below a clearly
labelled restore work directory. Never restore pilot data into a developer
machine or live production database casually.

1. Verify the dated backup directory, checksums, dump timestamps, and file archive before opening the restore target.
2. Restore the Identity PostgreSQL dump into a disposable Identity database.
3. Restore the Academic PostgreSQL dump into a separate disposable Academic database.
4. Extract the private Academic files archive into the disposable final-files root; keep staging separate and empty.
5. Boot the private ClamAV service, Identity API, Identity email worker/scheduler, Academic API, web, and Academic notification worker with restore-target configuration only.
6. Check ClamAV health, Identity liveness, JWKS retrieval, Academic liveness/readiness including `malwareScanner`, web health, and both worker `--check`/scheduled-run paths.
7. Verify the representative canonical tenant exists independently in both databases with the same opaque ID.
8. Verify a representative restored Student has its opaque `identityUserId` link, a Submission and immutable SubmissionRevision exist for the same Academic tenant, and each FileReference points to an available FileObject/StoredBlob whose private blob exists in the restored volume.
9. Verify an authorized download through the Academic API and a cross-tenant/unauthorized download denial; do not inspect or expose file bytes in logs.
10. Record restore duration, missing/orphaned files, notification/email terminal failures, and any schema/data mismatch. Destroy the disposable target only after the evidence is captured.

After restore, repeat the controlled malware release gate with a known clean
synthetic file and an isolated EICAR test file. Confirm that the clean file is
accepted only after `CLEAR`, the EICAR file is rejected and cannot be
downloaded, and staging is empty. Do not use actual malware payloads or retain
the EICAR artifact as pilot evidence.

The guarded helper is:

```sh
export RESTORE_CONFIRM=I_UNDERSTAND_DISPOSABLE_RESTORE
export RESTORE_TARGET_LABEL=conquistadores-disposable-restore
export RESTORE_WORKDIR=/var/tmp/edupay-disposable-restore
export IDENTITY_DATABASE_URL='disposable-identity-url'
export ACADEMIC_DATABASE_URL='disposable-academico-url'
export ACADEMIC_STORAGE_ROOT=/var/tmp/edupay-disposable-restore/files
export IDENTITY_DB_DUMP=/mnt/off-host-edupay-backups/<stamp>/identity.postgres.dump
export ACADEMIC_DB_DUMP=/mnt/off-host-edupay-backups/<stamp>/academico.postgres.dump
export ACADEMIC_FILES_ARCHIVE=/mnt/off-host-edupay-backups/<stamp>/academico-private-files.tar.gz
export IDENTITY_HEALTH_URL=https://<restore-identity-host>/api/v1/identity/health
export ACADEMIC_READY_URL=https://<restore-academico-host>/api/v1/health/ready
export RESTORE_TENANT_ID=<approved-synthetic-or-pilot-tenant-id>
./ops/backup/restore-verify-pilot.sh
```

The helper refuses absent disposable confirmation, a non-disposable target
label, and a storage path outside the restore work directory. The release
owner must still validate the application-level linked Student/submission/file
evidence described above; a successful `pg_restore` alone is not a restore test.
