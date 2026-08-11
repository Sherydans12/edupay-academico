# ADR-0020: Colegio Conquistadores pilot scope and success targets

Status: Accepted; resolves D-18 for the controlled pilot baseline

Date: 2026-08-10

Decision authority: Product and Colegio Conquistadores pilot owner approval

## Decision

The initial controlled pilot is Colegio Conquistadores and lasts 14 days.

### Initial operational cohort

- 1 `TENANT_ADMIN`;
- at least 2 `TEACHER` accounts;
- an initial Student cohort that may begin with one real Student and expand
  after smoke validation; and
- at least 2 CourseSubjects represented.

### Functional success

The pilot must demonstrate at least:

- 5 real published Assignment/Assessment activities;
- successful Student visibility and access;
- successful private file upload and submission;
- at least 3 completed teacher review cycles;
- at least one `CHANGES_REQUESTED` -> resubmission -> `REVIEWED` cycle;
- in-app notifications delivered to the correct recipients; and
- Identity activation/login/logout functioning without operator password
  knowledge.

### Security and data-integrity exit criteria

- zero known cross-tenant authorization failures;
- zero known unauthorized file access;
- zero lost submitted revisions;
- zero mutable historical `SubmissionRevision` evidence;
- zero critical unresolved authentication/session vulnerabilities; and
- no plaintext credentials or tokens in logs or storage.

### Operational exit criteria

- `release:check` passes;
- `pilot:e2e` passes;
- backup jobs execute successfully;
- at least one disposable restore verification passes before pilot;
- no storage quota `FULL` condition;
- workers demonstrate retry and recovery; and
- production HTTPS, CORS, and cookie configuration is verified.

### Reliability target

No unresolved P0/P1 defect may remain at pilot launch. A single isolated pilot
incident does not automatically invalidate the pilot, but data loss,
cross-tenant access, credential exposure, or a repeatable core-workflow failure
blocks rollout expansion.

This ADR does not invent a contractual uptime SLA for the pilot.

## Scope boundaries

This baseline does not resolve D-11 malware/retention/legal-hold implementation
or D-15 final deployment/provider/RTO/RPO acceptance.
