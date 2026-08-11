# EduPay roster synchronization consumer

Status: implemented production-oriented consumer for the schema-v1 source API
accepted by ADR-0015 and ADR-0016.

## Scope and ownership

The consumer reads only the dedicated EduPay endpoints under
`/api/v1/integrations/academico`: snapshot start/completion, Courses, and
Students. It never reads the EduPay database or ordinary administrator APIs.
Guardian, RUT, email, payments, Teacher, Subject, AcademicYear, Learning, and
Submission data are not requested or synchronized.

`EDUPAY` is the one centralized supported source identifier. Existing Course,
Student, and CourseEnrollment rows remain `MANUAL`. Source rows are identified
only by `(canonicalTenantId, EDUPAY, integrationId)`; labels, names, email, RUT,
legacy integer IDs, and target UUIDs are never matching keys.

Course and Student source identity is immutable after creation. An EduPay
Course keeps its configured target AcademicYear. A later configuration that
points an existing source Course at another AcademicYear produces
`SOURCE_COURSE_ACADEMIC_YEAR_CONFLICT`; the consumer never moves pedagogical
content between years.

## Tenant configuration

`SyncConfiguration` is the server-owned mapping:

```text
(EDUPAY, sourceTenantId) -> canonical Académico tenantId + AcademicYearId
```

There is at most one EduPay mapping per canonical tenant and at most one
canonical mapping per EduPay source tenant. The selected Tenant and
AcademicYear must already exist in Académico, belong to each other, and the
AcademicYear must be `ACTIVE`. No AcademicYear is inferred or created.

Configure or safely rerun the same configuration with:

```sh
pnpm sync:configure -- \
  --tenant-id <canonical-uuid> \
  --source-tenant-id colegio-conquistadores \
  --academic-year-id <active-academic-year-uuid>
```

Add `--disable` to stop scheduled/manual execution or rerun the compatible
command with `--enable`. An incompatible tenant, source tenant, or AcademicYear
change fails loudly. The source token is not a command option and is not stored
in this table.

## Transport contract and security

`EduPayIntegrationClient` uses the configured origin plus four fixed relative
paths. It sends the dedicated bearer token, `X-Source-Tenant-ID`, and a safe
correlation ID. Requests have a bounded abort timeout, reject redirects, make
no automatic page retry, limit response size, and validate exact Zod schemas.

The client validates schema version `1`, response/page/item tenant scope,
entity/mode, counts, terminal state, Course/Student items, source conflicts,
snapshot descriptors, and stable source errors. Malformed bodies, unknown
fields, inconsistent counts, missing terminal watermarks, source-run changes,
and tenant mismatches fail closed. Tokens and raw bodies are never logged or
persisted.

Production requires HTTPS unless the deployment explicitly sets
`EDUPAY_INTEGRATION_ALLOW_PRIVATE_HTTP=true` for an approved private topology.
That exception is operationally sensitive and must not be used for a public
route.

## Incremental algorithm and checkpoints

For one enabled tenant, the runner:

1. validates the mapping and active AcademicYear;
2. creates a `SyncRun` and obtains the PostgreSQL `SyncLease` for
   `(tenantId, EDUPAY)`;
3. drains all Course pages from the persisted Course watermark;
4. applies Courses by source identity;
5. stores only the terminal `watermark.next` if Course application is safe;
6. drains and applies Students from the independent Student watermark;
7. stores only the terminal Student watermark if Student application is safe;
8. finalizes safe counts/evidence and releases the lease.

`page.nextCursor` is used only in memory for the current source run and is never
stored as a watermark. A request/page failure occurs before the drained entity
is applied. An application failure prevents that entity checkpoint from
advancing, so replay starts from the prior terminal watermark.

Course and Student checkpoints are intentionally independent. A safely
completed Course entity can advance even if Student later fails. Course upsert
is idempotent by external identity and is processed first, so retrying the old
Student watermark is safe. Such a run is `PARTIAL`, never whole-run success.
Source-declared conflicts occupy scanned cursor positions, are recorded, and do
not by themselves hold the entity watermark forever; nightly full
reconciliation is the repair backstop.

`SUCCEEDED` means the synchronization protocol and all safe checkpoint rules
completed successfully; it does not mean every source record is free of data
quality issues. A run may therefore be `SUCCEEDED` with `conflictedCount > 0`
when every conflict was declared by the source and its scanned/presence
position is safe. Consumer-detected conflicts or target failures that make an
entity unsafe to checkpoint continue to produce `PARTIAL` or `FAILED` and do
not advance that entity's watermark.

## Full reconciliation and absence

The runner uses the source protocol exactly:

1. `GET /snapshot`;
2. drain Course with `mode=full` and the returned snapshot token;
3. drain Student with the same token;
4. retain both terminal entity watermarks;
5. call `/snapshot/complete` with the token and both watermarks;
6. require the matching source run ID and `complete=true`.

Full watermarks, generation, and absence changes are committed together only
when the source snapshot is complete and target item application has no
failure or consumer-detected identity conflict. Source-declared conflict rows
are already part of the source's scanned position, count as present, and do not
block a source-confirmed full generation; the successful run retains its
non-zero conflict count and bounded evidence. A target-partial, failed,
malformed, timed-out, or source-incomplete full run does not advance either
watermark or absence evidence.

Run-scoped `SyncFullPresence` rows store external IDs only and are deleted when
the run finishes. Valid items and source conflict identities both count as
present. On a complete successful generation, present records reset to zero
absence; missing records increment one durable counter. The first consecutive
absence leaves lifecycle unchanged. The second archives a Course or inactivates
a Student and inactivates only EduPay-owned active enrollments. Reappearance
with the same integration ID reuses and restores the existing target row.

## Item behavior

- Course maps `name -> label`; live rows are `ACTIVE`, tombstones are
  `ARCHIVED`. Renames and lifecycle changes preserve target ID,
  CourseSubject, Learning, and Submission relationships. Course tombstones
  inactivate EduPay-owned enrollments only.
- Student maps `ACTIVE -> ACTIVE`, `INACTIVE/GRADUATED/deleted -> INACTIVE`.
  Source owns first/last name, raw administrative status evidence, and target
  status. Local email, `identityUserId`, target UUID, Learning, and Submission
  history are preserved. No Identity unlink occurs.
- An active Student resolves Course only by the Course integration ID. Missing
  or inactive mapping is bounded failure evidence; no Course is inferred from
  Student data.
- EduPay CourseEnrollment external identity is the unambiguous source key
  `student:<Student.integrationId>|course:<Course.integrationId>`. A move
  inactivates the prior source row and creates/reactivates the desired row.
  History is never deleted.
- Existing active manual enrollment creates `MANUAL_ENROLLMENT_CONFLICT`.
  Manual data is not deactivated. Normal administration also cannot create a
  manual active course enrollment while a source-owned active enrollment
  exists.
- Duplicate source integration IDs are quarantined without choosing a winner.
  Source conflicts such as `COURSE_NAME_MISSING` and
  `STUDENT_STRUCTURED_NAME_MISSING` store no names or raw source payload.

Normal Course label/lifecycle and Student name/status mutation returns the
stable `SOURCE_MANAGED_FIELD_CONFLICT` for EduPay rows. Source enrollment
deactivation returns `SOURCE_MANAGED_ENROLLMENT_CONFLICT`. Identity linking,
Student email, CourseSubject, Learning, and other target-owned pedagogical
operations remain available.

## Evidence, status, and retention

`SyncRun` stores mode, trigger, status, correlation, schema/source tenant,
timing, page count, safe aggregate counts, watermark/snapshot completion flags,
and a safe error code. `SyncItemResult` stores only bounded unresolved
failure/conflict evidence: entity, external integration ID when available,
target ID, code, retryability, and timestamps. It never stores names, email,
RUT, Guardian/financial data, source payloads, or credentials.

Per-run item evidence is capped by `EDUPAY_SYNC_ITEM_EVIDENCE_LIMIT`; old rows
are pruned by `EDUPAY_SYNC_EVIDENCE_RETENTION_DAYS`. A later successful item
resolves prior evidence for that external identity.

`GET /api/v1/sync/status` is authenticated and requires
`TENANT_ADMIN` academic-structure capability. It returns the safe mapping,
AcademicYear, enabled state, last successful incremental/full timestamps, last
run status/counts, and unresolved conflict count. It does not return tokens,
watermarks, raw payloads, or personal data. The administration overview and
roster selectors show a small EduPay/source-managed indication.

## Worker and manual operation

Run the independent worker with:

```sh
pnpm sync:worker
pnpm --filter @edupay/api sync:worker:check
```

The pilot uses one worker process. It queries due enabled configurations, gives
full reconciliation priority, relies on PostgreSQL leases across processes,
and performs bounded orchestration-level retry only for retryable source
failures. Incremental cadence is a UTC duration (default 60 minutes); full
cadence is the next configured UTC hour (default 02:00 UTC), never OS local
timezone.

The runner awaits a time-aware lease heartbeat while applying buffered target
items, renewing after one third of the configured lease duration has elapsed.
It also verifies ownership around source requests, immediately before every
watermark commit, and inside the final full-generation transaction. There is no
detached timer. A failed renewal aborts the run as `SYNC_LEASE_LOST`; no later
watermark or absence generation is committed.

An operator can run a validated enabled tenant without supplying a token on the
command line:

```sh
pnpm sync:run -- --tenant-id <canonical-uuid> --mode incremental
pnpm sync:run -- --tenant-id <canonical-uuid> --mode full
```

## Backup and recovery

Configuration, leases, terminal watermarks, run evidence, conflict evidence,
and absence generations live in Académico PostgreSQL and are included in the
ordinary database backup. The EduPay service token remains only in managed
runtime secret custody and is absent from database dumps. After restore, the
worker resumes from the last committed terminal watermark; page and item replay
is idempotent.

## Test profiles

Normal tests use a deterministic schema-v1 HTTP fixture and do not require the
sibling repository. PostgreSQL integration tests run when
`TEST_DATABASE_URL` points to a migrated disposable PostgreSQL 15 database.
They cover configuration, multipage checkpointing, replay, Course/Student and
enrollment lifecycle, manual conflicts, full absence, source completion,
leases, status authorization, and preservation of pedagogical history.

The real cross-repository smoke remains optional and operator-controlled. Boot
the read-only BL-002 main revision with disposable PostgreSQL 15 and ephemeral
integration secrets, migrate and configure the disposable Académico database,
then set `REAL_EDUPAY_SYNC_TENANT_ID` together with the normal server-only
EduPay environment and run:

```sh
pnpm sync:smoke:real
```

The profile executes one incremental and one full consumer run without placing
the source token on the command line. No ordinary CI depends on the sibling
repository.
