# Risk register

Status: baseline risk register

| Risk | Impact | Likelihood | Mitigation / evidence |
| --- | --- | --- | --- |
| Cross-tenant authorization defect | Critical data/privacy breach | Medium | Request-scoped tenant context, scoped repositories, compound constraints, negative tests, security review |
| Identity contract is not available or changes late | Blocks authentication and membership behavior | High | Approve Identity contract in Phase 0/1; use contract fakes; isolate adapter |
| Existing EduPay data lacks a reliable integration contract | Manual setup burden or inconsistent records | High | Make manual creation first-class; explicit external references; reconciliation runbook |
| Sync overwrites school-maintained changes | Data loss and operational distrust | Medium | Field ownership matrix, inactive-not-delete behavior, dry-run/reconciliation |
| File uploads introduce malware or excessive storage cost | Security incident or availability/cost issue | Medium | Accepted private storage boundary; extension/MIME/signature checks; 25 MB limit; independent global/tenant quotas; tenant-local deduplication; physical guard; scanning and retention decisions still required |
| Storage accounting drifts from physical objects | Uploads may be accepted beyond quota or valid capacity may be blocked | Medium | Atomic reservations and counters, idempotent transitions, object inventory reconciliation, drift alerts, and tenant/global repair evidence |
| Ambiguous submission/revision semantics | Rework and loss of teacher/student history | High | Resolve ADR-0006 before submission implementation; acceptance scenarios |
| Deadline timezone mismatch | Incorrect late flags and disputes | Medium | Tenant timezone decision, server clock, boundary tests, visible effective deadline |
| Notification provider outage hides important feedback | Users miss corrections/deadlines | Medium | In-app source of truth, outbox/retries, delivery monitoring, email failure state |
| Over-broad tenant-admin or system-admin permissions | Unauthorized access | Medium | Explicit policy matrix, elevated-action audit, negative tests |
| UI becomes school-specific | Future tenant onboarding requires forks | Medium | Semantic tenant tokens, default theme, no hard-coded business components |
| MVP expands toward a Moodle clone | Delayed pilot and higher complexity | High | Scope gate, capability acceptance boundary, ADR for additions |
| Production topology is under-specified | Fragile release and recovery | Medium | Decide hosting/worker/backup/RTO before pilot; operational rehearsal |
| Student privacy requirements are discovered late | Compliance/rework | Medium | Data minimization, retention decision, sanitized fixtures, security/privacy review |
| Empty repository causes parallel agents to create incompatible foundations | Merge/rework risk | High | Phase 0 conventions, bounded agent ownership, contract-first handoffs |

## Risk review cadence

Review risks at each phase exit. A risk is not closed because code exists; it is closed only when mitigation evidence is recorded and the owner accepts the residual exposure.
