# Full pilot cross-service smoke

Status: test/development-only pilot acceptance harness

> Warning: this is not a production seed or migration script. It creates only
> synthetic disposable data, databases, signing material, credentials, and
> private files, then removes them.

## Purpose

The smoke runs the approved tenant-admin → Teacher → Student pilot workflow
against real EduPay Identity and EduPay Académico service processes. Identity
and Académico use separate disposable PostgreSQL 15 containers. The Academic
API obtains Identity signing keys from the running JWKS endpoint and performs
high-risk checks through the real restricted internal HTTP bridge.

The workflow covers provisioning, pending-activation linking, activation,
login, academic setup, assignment publication, notifications, multipart file
uploads, two immutable revisions, change requests, final review, quota
accounting, authorized downloads, and the required negative authorization
checks. Academic email delivery uses the built-in fake adapter. No Resend
credential is configured or contacted.

## Prerequisites

- Windows, macOS, or Linux with Docker running and able to pull
  `postgres:15-alpine` (override with `PILOT_POSTGRES_IMAGE`).
- Node.js 22.12 or newer and pnpm 10.19.0.
- Dependencies installed in both repositories.
- The EduPay Identity repository checked out on a clean, current `main` whose
  `HEAD` matches `origin/main`.
- This Académico worktree on a feature branch.

By default, the script looks for Identity at `../../EduPayIdentity` relative to
this worktree. Set `EDUPAY_IDENTITY_DIR` to an absolute path when the sibling
repository is elsewhere.

## Command

From the Académico repository/worktree:

```sh
pnpm pilot:e2e
```

The release gate runs the same smoke with the private scanner topology and
fail-closed outage check enabled:

```sh
PILOT_MALWARE_SCANNER=clamav PILOT_CLAMAV_FAILURE_GATE=true pnpm pilot:e2e
```

That release mode starts disposable `clamav/clamav:1.4.3` without publishing
port 3310, verifies readiness, accepts a synthetic clean file, dynamically
generates the EICAR test string only in memory, verifies rejection and cleanup,
and verifies that scanner unavailability fails closed. It does not persist the
EICAR string or any binary payload.

The harness intentionally performs its own Prisma generation, migration
deployment, and service builds so it does not depend on stale generated code.
It may need to pull the PostgreSQL image on the first run.

## Disposable topology

- one PostgreSQL 15 container and database owned by Identity;
- one separate PostgreSQL 15 container and database owned by Académico;
- one Identity process with an ephemeral asymmetric private key and public
  JWKS file;
- one Academic API process configured only with the Identity JWKS URL and a
  temporary server-only bridge credential;
- one Academic notification worker using `ACADEMIC_EMAIL_MODE=fake`;
- one private temporary storage root with a separate multipart staging path.

The only bootstrap writes are the prerequisites that have no public creation
route: independently owned canonical tenant records in both services, the
Identity role catalog, the active tenant-admin principal, and a context-free
test `SYSTEM_ADMIN` session. Teacher and Student memberships, activation
challenges, academic records, links, content, submissions, reviews, and
notification reads all use real HTTP routes.

## Expected checkpoints

The command prints checkpoint names only; it never prints generated passwords,
tokens, activation codes, database credentials, signing material, or the
service credential. A successful run ends with:

```text
CHECKPOINT PASS full real-service pilot cross-service smoke
```

Earlier checkpoints confirm:

- separate PostgreSQL containers and real service processes;
- independently owned tenant records with the same canonical tenant ID;
- pending Teacher/Student Identity links followed by activation and login;
- effective CourseSubject access and exactly one assignment notification for
  the target Student;
- multipart-only file transfer, immutable revisions, server late-state
  calculation, private authorized downloads, and quota accounting;
- teacher notifications, change request, resubmission, final review, and fake
  email delivery without duplicate domain events;
- no grade/score/rubric field in the persisted or returned workflow;
- other-Student, outside-Teacher, cross-tenant resource/file,
  context-free `SYSTEM_ADMIN`, revoked-session, and wrong-service-credential
  denials;
- empty multipart staging and physical blob/accounting agreement.

## Cleanup

Cleanup runs after success or failure. The script terminates its three service
processes, removes only container names that it created with the
`edupay-pilot-*` prefix, and deletes its uniquely named directory beneath the
operating-system temporary directory. Existing local containers and repository
files are not reused or removed.

If the host is terminated before cleanup runs, list containers whose names
start with `edupay-pilot-`, confirm that they belong to the interrupted run,
and remove only those exact containers. Temporary directories start with
`edupay-pilot-cross-service-` under the operating-system temporary directory.

## Troubleshooting

- **Identity repository rejected:** fetch Identity `main`, verify it matches
  `origin/main`, and remove or commit only your own intended changes. The smoke
  never edits Identity source files.
- **Docker pull/start failure:** confirm Docker Desktop/daemon is running and
  that the PostgreSQL image is available.
- **Service readiness failure:** the harness prints a redacted tail from the
  affected disposable service log before cleanup.
- **Port conflict:** service and PostgreSQL host ports are selected
  dynamically; a repeated conflict usually indicates host security software or
  a Docker networking problem.
- **Migration failure:** run each repository's normal Prisma validation and
  migration checks. Do not point the smoke at a shared or production database.
- **Email concern:** the Academic worker is hard-configured to the fake adapter
  and Identity uses the no-email activation flow. No Resend API key is supplied.

After changing Académico code, also run the normal gates:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The web production build requires the two public base URLs declared in
`apps/web/.env.example`. For a local validation build, use non-secret local
values such as `http://localhost:3001/api/v1` for the Academic API and
`http://localhost:3000` for the Identity origin.
