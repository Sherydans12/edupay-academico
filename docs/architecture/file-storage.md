# File storage architecture

Status: accepted storage baseline; MVP implementation uses the provider abstraction with a private local filesystem adapter

This document is governed by [ADR-0005](../decisions/ADR-0005-private-object-storage-abstraction.md). It refines the existing private, provider-agnostic object-storage boundary without changing the service, database, identity, tenant, learning, or submission architectures.

The MVP implementation keeps provider operations behind `PrivateStorageProvider`.
The local adapter stores server-generated keys below a private configured root,
stages bytes, promotes validated bytes to immutable blob keys, and streams
authorized downloads through the API. It never returns a public path. An
S3-compatible adapter can replace it without changing domain records or
authorization. Filesystem uploads fail closed unless both physical free-space
guard settings are configured; their numerical production values remain an
operations decision.

## 1. Scope and responsibility split

- PostgreSQL stores logical file metadata, blob metadata, tenant ownership, parent references, quota policy, accounted usage, upload reservations, lifecycle state, and audit correlation.
- Private S3-compatible object storage stores immutable bytes behind an application-owned adapter.
- The API is the authorization decision point for every upload, completion, download, reference change, and future deletion operation.
- A browser may receive a short-lived signed transfer URL only after API authorization. Possession of a storage key or URL is never durable permission.
- Original filenames are display metadata only. Server-generated identifiers and keys address stored objects.
- Logical files are separate from physical blobs so tenant-local deduplication, immutable evidence, references, and storage accounting do not collapse into one record.

The application code is not authorized in the current Phase 0 baseline. Storage implementation begins only when the tenant-context and authorization foundations it depends on are available and the relevant Phase 3/4 work is authorized. For the controlled pilot, [ADR-0018](../decisions/ADR-0018-file-security-retention-and-malware-policy.md) adds a mandatory fail-closed malware-scanning gate before availability.

## 2. Initial policy and configuration

All limits are stored and compared as integer bytes. In this policy, `MB` and `GB` use decimal units:

- maximum file size: `25,000,000` bytes (25 MB);
- initial global application quota: `20,000,000,000` bytes (20 GB);
- initial Colegio Conquistadores tenant quota: `20,000,000,000` bytes (20 GB).

Global and tenant quotas are independent hard limits. An upload must fit both. The initial tenant quota being equal to the global quota does not reserve the global capacity for that tenant; it means Colegio Conquistadores may consume up to the global ceiling while no other tenant has consumed it. Adding tenants requires an explicit global-capacity review.

Policy values are configurable through validated, audited server-side configuration. A tenant administrator can view policy and usage but cannot increase a quota unless a later authorization decision explicitly grants that capability. Configuration changes never delete existing files. Lowering a quota below current usage puts the scope in `FULL` and blocks new uploads until usage or quota changes.

### Allowed originals

| Extension | Canonical declared MIME | Required content evidence |
| --- | --- | --- |
| `.pdf` | `application/pdf` | PDF signature and successful bounded structural identification |
| `.doc` | `application/msword` | OLE Compound File signature and Word-specific structure where the detector supports it |
| `.docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | Valid ZIP package with Word Open XML content types/parts |
| `.xls` | `application/vnd.ms-excel` | OLE Compound File signature and Excel-specific structure where the detector supports it |
| `.xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | Valid ZIP package with Spreadsheet Open XML content types/parts |
| `.ppt` | `application/vnd.ms-powerpoint` | OLE Compound File signature and PowerPoint-specific structure where the detector supports it |
| `.pptx` | `application/vnd.openxmlformats-officedocument.presentationml.presentation` | Valid ZIP package with Presentation Open XML content types/parts |
| `.txt` | `text/plain` | Bounded text/encoding inspection; reject binary/NUL-heavy content |
| `.jpg`, `.jpeg` | `image/jpeg` | JPEG signature and successful image decode/header inspection |
| `.png` | `image/png` | PNG signature and successful image decode/header inspection |
| `.webp` | `image/webp` | RIFF/WEBP signature and successful image decode/header inspection |
| `.zip` | `application/zip` | Valid bounded ZIP structure and central directory |

The extension, declared MIME, and detected type must agree with one allowed row. Approved MIME aliases, if operationally required, are an explicit policy list rather than a permissive fallback. Open XML documents are identified by package contents, not accepted merely because they have a ZIP signature. Legacy Office formats share an OLE signature, so subtype inspection is used where supported; a file that cannot be identified with sufficient confidence fails closed. Parsers must bound decompression, entry count, dimensions, and processing time to resist archive and parser abuse.

Malware scanning remains unresolved. The lifecycle includes a validation/scanning gate so a later scanning decision does not require changing file identity or authorization semantics.

## 3. Quota model

### Scopes and accounting

Each upload is evaluated against two quota scopes:

1. the singleton global application scope;
2. the trusted current tenant scope.

`usedBytes` represents application-managed bytes that physically remain in object storage: available blobs and derivatives, staged/pending objects, quarantined objects if scanning is adopted, and deletion-pending objects until absence is confirmed. Provider-managed replicas, backups, version history, and multipart overhead are operational capacity/cost concerns rather than application quota usage because the application cannot account for them transactionally.

`reservedBytes` represents capacity held for authorized uploads that have not yet become stored bytes. As staged bytes become observable, the reservation is reduced so the same bytes are not counted twice. Enforcement uses:

```text
projectedBytes = usedBytes + reservedBytes + requestedAdditionalBytes
```

An upload reservation succeeds only when `projectedBytes <= quotaBytes` for both scopes and the physical safety guard passes. Checks and reservation increments are atomic, with the global and tenant rows locked or conditionally updated in a consistent order. This prevents concurrent uploads from oversubscribing either quota.

Deduplicated bytes are charged once per tenant because only one `StoredBlob` is persisted. Distinct `FileObject` rows still count as distinct logical files. Every derivative is a separate stored blob and consumes quota. Orphans, failed uploads, and deletion-pending bytes remain charged until the object is verified absent.

### Usage fields

- `quotaBytes`: configured hard limit.
- `usedBytes`: actual application-managed persistent bytes.
- `reservedBytes`: non-expired capacity reservations.
- `availableBytes`: `max(0, quotaBytes - usedBytes - reservedBytes)`.
- `usagePercentage`: `usedBytes / quotaBytes * 100`, capped at 100 for display.
- `allocationPercentage`: `(usedBytes + reservedBytes) / quotaBytes * 100`, capped at 100 for display and used for quota state.
- `remainingPercentage`: `availableBytes / quotaBytes * 100`; this is upload capacity remaining after active reservations.
- `fileCount`: count of active/available logical `FileObject` records, not unique blobs.
- `blobCount`: available physical blob count, useful operationally.

Initial logical categories are `LEARNING_MATERIAL`, `ASSIGNMENT_SOURCE`, `ASSESSMENT_SOURCE`, `STUDENT_SUBMISSION`, `GENERATED_DERIVATIVE`, and `OTHER_SYSTEM`. Category values are stable strings and additions require a contract/documentation change rather than ad hoc labels.

Usage by category is reported from `FileObject.category` as logical bytes and file count. Because one tenant-local blob can back files in multiple categories, category logical bytes are not summed to claim physical usage; the overall `usedBytes` remains the authoritative quota value. This distinction must be labeled in admin UI and API responses.

### State thresholds

Default thresholds are configurable and ordered as follows:

| State | Allocated percentage (`usedBytes + reservedBytes`) | Upload behavior |
| --- | ---: | --- |
| `NORMAL` | `< 75%` | Allowed when all checks pass |
| `INFO` | `>= 75%` and `< 90%` | Allowed; informational notice |
| `WARNING` | `>= 90%` and `< 95%` | Allowed; prominent warning |
| `CRITICAL` | `>= 95%` and `< 100%` | Allowed only while projected usage fits; urgent warning |
| `FULL` | `>= 100%` or quota is already exceeded | Reject new uploads |

At `FULL`, existing metadata, previews, originals, and downloads remain available subject to normal authorization. A scope can be temporarily `FULL` because active reservations have allocated its remaining capacity. Quota failure never hides or deletes existing academic evidence.

`TENANT_ADMIN` receives quota, used bytes, reserved bytes, available bytes, usage/allocation percentages, state, file/blob count, and logical usage by category where available. `TEACHER` receives at minimum tenant used bytes, total quota, remaining percentage, and state. Teacher visibility is tenant aggregate visibility only and grants no file-list or cross-resource access. Global usage is restricted to an explicit audited platform-support/system-admin path.

### Physical capacity safety guard

Application quotas are never inferred from free disk space. A second, independent physical capacity guard rejects new writes when the projected write would cross either a configured minimum-free-byte reserve or minimum-free-percentage reserve on an application-managed storage volume. Both settings are required for a filesystem-backed adapter and validated at startup; their deployment values remain an operations decision.

For managed S3-compatible services that do not expose physical disk free space, the adapter enforces any provider capacity limit it can query and operations must monitor provider capacity/billing alarms. The global application quota remains mandatory regardless of provider capacity. Temporary upload locations and local processing scratch space are also covered by disk guards and bounded per-operation limits.

## 4. Data model proposal

All tenant-owned rows have an immutable `tenantId`. Foreign keys and unique constraints include tenant scope where needed to prevent cross-tenant references.

### `StoredBlob`

Represents immutable physical bytes:

- internal opaque ID;
- immutable tenant ownership;
- server-generated `storageKey`;
- SHA-256 digest;
- authoritative `storedSizeBytes`;
- detected MIME/type;
- lifecycle state such as `PENDING`, `VALIDATING`, `AVAILABLE`, `REJECTED`, or `DELETION_PENDING`;
- validation/scanning status seam;
- created and verified timestamps;
- audit/correlation metadata.

The tenant-local uniqueness constraint is `(tenantId, sha256, storedSizeBytes)` for available blobs. SHA-256 remains the canonical identity signal; matching size is included as an integrity check. Storage keys do not contain original filenames, and a blob is never overwritten in place.

### `FileObject`

Represents one logical uploaded file:

- internal opaque ID and immutable tenant ownership;
- `storedBlobId` referencing a blob in the same tenant;
- original filename and normalized safe display filename;
- original client-reported size and authoritative stored size;
- declared MIME, detected MIME, and extension;
- uploader Identity subject and actor type;
- logical category;
- immutable-original/evidence classification;
- lifecycle state;
- created, validated, and availability timestamps.

A deduplication hit creates a new `FileObject` while reusing the existing same-tenant `StoredBlob`. This preserves uploader, filename, category, lifecycle, and audit history without storing duplicate bytes.

### `FileReference`

Associates a logical file with an authorized domain parent:

- internal opaque ID and immutable tenant ownership;
- `fileObjectId` in the same tenant;
- parent resource type and internal parent ID;
- purpose/category and optional display order;
- revision/version context where applicable;
- created-by and timestamps;
- lifecycle state rather than an untracked hard delete.

The application validates that the parent resource is in the trusted tenant and that the actor may attach the file. A submission revision snapshot refers to fixed file references; replacement creates new logical objects/references and never rewrites reviewed history. Parent-specific referential integrity should use explicit typed tables where practical rather than relying only on an unchecked polymorphic identifier.

### Supporting records

- `StorageQuotaPolicy`: scope, quota bytes, thresholds, version, effective time, changer, and audit reason.
- `StorageUsageAccount`: scope, used/reserved bytes, file/blob counts, version, and last reconciled time.
- `UploadIntent`: tenant, actor, authorized parent/purpose, expected metadata/size, reservation, expiry, state, and idempotency seam.
- `BlobDerivative`: original blob, derivative blob, transformation profile/version, and timestamps; both blobs remain tenant-scoped.

No physical object becomes downloadable through a domain resource until an available `FileObject` and authorized `FileReference` exist.

## 5. Upload flow

1. Authenticate the user through EduPay Identity.
2. Resolve the effective tenant from trusted membership/session context; ignore a payload `tenantId` as authorization evidence.
3. Authorize the actor, target parent resource, purpose/category, lifecycle action, and file-count rules.
4. Validate filename/extension, declared MIME, declared size, and policy version. Reject a declared size above 25 MB.
5. Atomically reserve the declared bytes against both tenant and global scopes and create an expiring `UploadIntent` bound to actor, tenant, parent, and purpose.
6. Return an opaque `uploadIntentId` and safe upload instructions. The control plane is JSON metadata only; it contains no file bytes.
7. Transfer exactly one file through `POST /api/v1/file-upload-intents/{intentId}/content` as `multipart/form-data` with the `file` field. The initial local adapter uses bounded disk staging, not an in-memory multipart buffer.
8. Finalize server-side: obtain authoritative size, stream SHA-256 calculation, detect actual type/signature/structure, enforce the 25 MB limit again, and scan the staged bytes. The object is unavailable during validation and scanning; type/signature validation is not malware scanning.
9. On `CLEAR`, recheck both quotas using authoritative bytes. Within a transaction, find or create the tenant-local `StoredBlob` only from a `CLEAR` blob, handle the unique-key race, create `FileObject` and any parent `FileReference`, convert/release the reservation, and update usage/file counts.
10. If the blob already exists in the tenant, reuse it only when its authoritative bytes have `scanStatus=CLEAR` under the active scanner policy, then remove the staged duplicate; physical `usedBytes` does not increase. Never search or deduplicate across tenants. `INFECTED`, `FAILED`, unavailable, or timeout outcomes release the reservation and remove staging without creating an available blob/reference.
11. Promote a clear staged object to its immutable final key and mark it available using an idempotent state transition. Because PostgreSQL and object storage do not share a transaction, retries and reconciliation complete or compensate partial states without exposing an unvalidated or uncleared file.
12. Audit intent creation outcome, validation rejection, quota rejection, scan start/outcome/duration, successful availability, deduplication outcome at a non-sensitive level, and important failure/cleanup operations.

Expired reservations are released idempotently. Abandoned staged objects remain accounted while present and are cleaned according to an operational cleanup interval; retention/deletion rules for valid domain files remain unresolved.

## 6. Download authorization flow

1. Authenticate the user.
2. Resolve trusted tenant context.
3. Load the `FileReference`, `FileObject`, parent resource, and available blob through tenant-scoped access; return non-enumerating not-found/forbidden behavior.
4. Authorize the actor against the parent resource and its current relationship/lifecycle rules. A teacher must still be assigned appropriately; a student must still be entitled to the parent or their own submission.
5. Verify that file/blob states permit download: `FileObject.lifecycle=AVAILABLE`, `StoredBlob.lifecycle=AVAILABLE`, and `StoredBlob.scanStatus=CLEAR`; no security hold may block access.
6. Either stream through the API or issue a short-lived, response-bound signed URL from the private adapter. The final choice remains open under ADR-0005; both modes use the same authorization service.
7. Use a sanitized `Content-Disposition` filename, `nosniff` behavior where applicable, safe content type, and no public/cache-shared URL.
8. Record the audit event when the approved audit policy requires individual download logging.

Quota state never blocks authorized downloads.

## 7. Immutability and optimization policy

- Every accepted `StoredBlob` is immutable. Replacement always creates a new logical file/blob relationship.
- Student submission originals preserve exact uploaded bytes for every revision.
- Assignment and document-based assessment source originals preserve exact uploaded bytes by default.
- Metadata removal, resizing, recompression, format conversion, and preview generation create separately identified derivatives; they never overwrite originals.
- Derivatives record their source blob and versioned transformation profile, receive the same tenant isolation, authorization, validation, quota accounting, and reconciliation treatment, and may be regenerated only when policy permits.
- Sharp may produce image previews, strip unnecessary metadata from derivatives, bound extreme dimensions, and optimize JPEG/WebP derivatives. Resource limits protect against decompression bombs and oversized pixel counts.
- DOCX, XLSX, PPTX, ZIP, and other already-compressed originals are not recompressed as an optimization job.
- PDF optimization or preview generation may be investigated, but the source remains immutable and any output is a distinct derivative. Academic evidence is never silently mutated.

Derivative generation is asynchronous/retryable when a worker exists. Failure to create an optional preview does not make an otherwise safe original disappear; the UI exposes the original download path and preview status.

## 8. Deduplication policy

- Deduplication scope is exactly one tenant.
- SHA-256 is calculated from authoritative uploaded bytes, not trusted client metadata.
- Lookup requires tenant ID, SHA-256, stored size, an `AVAILABLE` blob, and `scanStatus=CLEAR` under the active scanner policy.
- A database unique constraint and transactional retry resolve concurrent identical uploads.
- Each upload retains a distinct `FileObject` and audit trail even when it shares a blob.
- Blob deletion cannot occur while any live logical object/reference or unresolved retention hold depends on it. The final retention/deletion policy is still open.
- No hash, existence response, timing shortcut, storage key, or API permits one tenant to discover or reuse another tenant's blob.
- Reconciliation verifies checksum/size samples and metadata-object agreement without changing original bytes.

## 9. Security rules

Every operation follows this order: authenticate; resolve tenant from identity context; authorize the resource action; validate the file/action; verify tenant quota, global quota, and physical guard for writes; store through the private adapter; persist metadata/accounting safely; audit important outcomes.

Additional controls:

- Never trust `tenantId`, uploader identity, parent ownership, checksum, MIME, size, or storage key from a request payload.
- Keep buckets private and provider credentials out of clients, logs, tenant configuration, and source control.
- Generate keys from internal IDs under a tenant namespace, for example `tenants/{tenantId}/blobs/{blobId}` and `tenants/{tenantId}/pending/{uploadIntentId}`.
- Apply upload rate limits, bounded scanner concurrency, scanner timeouts, intent expiry, parser time/memory limits, archive-entry/decompression limits, and image pixel limits.
- Validate completion from provider facts rather than a client success claim.
- Sanitize filenames for display and response headers; never interpolate them into paths.
- Do not render active content inline by default. Download headers and any preview sandbox policy are selected by detected type and reviewed separately.
- Reauthorize background work from server-created tenant/resource context and make retries idempotent.
- Avoid logging file contents, signed URLs, checksums exposed as cross-tenant identifiers, or unnecessary student data.
- Preserve existing access at quota exhaustion, but apply normal authorization, lifecycle, and any future security hold.

## 10. API proposal

These routes follow the accepted `/api/v1` convention from ADR-0011. The MVP
does not expose JSON or base64 upload bodies. File bytes use only the dedicated
one-file multipart content endpoint; provider-specific paths and presigned URLs
remain outside the contract:

| Method and route | Purpose | Minimum authorization |
| --- | --- | --- |
| `POST /api/v1/file-upload-intents` | Preflight validation, authorization, and dual-scope reservation | Actor may attach to the referenced parent |
| `POST /api/v1/file-upload-intents/{intentId}/content` | One-file multipart transfer followed by authoritative validation, deduplication, metadata/reference creation, and accounting | Intent actor or explicit authorized server workflow |
| `GET /api/v1/files/{fileObjectId}` | Authorized logical metadata | Parent-resource read permission |
| `GET /api/v1/files/{fileObjectId}/download` | Authorized stream or short-lived redirect | Parent-resource download permission |
| `POST /api/v1/learning-items/{learningItemId}/attachments` | Validate and attach a LearningItem source/material file | Assigned teacher or `TENANT_ADMIN` |
| `GET /api/v1/learning-items/{learningItemId}/attachments` | List authorized LearningItem attachments | Parent-resource read permission |
| `POST /api/v1/learning-items/{learningItemId}/submission` | Create first revision or permitted resubmission | Entitled student |
| `GET /api/v1/submissions/{submissionId}` | View one submission and revision/review history | Owner, assigned teacher, or `TENANT_ADMIN` |
| `POST /api/v1/submission-revisions/{revisionId}/reviews` | Comment, review, or request changes | Assigned teacher |
| `GET /api/v1/storage/usage` | Current tenant usage view shaped to role | `TENANT_ADMIN` detailed; `TEACHER` summary |
| `GET /api/v1/platform/storage/usage` | Global and per-tenant operational usage | Explicit audited `SYSTEM_ADMIN` support context |
| `PATCH /api/v1/platform/storage/quotas/{scope}` | Change a configured quota/threshold policy | Explicit audited platform policy authority; exact role policy remains open |

No upload contract accepts `tenantId`, storage key, detected type, or trusted checksum from the client. A parent selector is authorization input only and is resolved inside trusted tenant context.

The upload-intent creation request is JSON metadata (`parentType`, `parentId`, `category`, `filename`, `mimeType`, and `sizeBytes`). The content endpoint is documented in OpenAPI as `multipart/form-data` with one binary `file` field and no JSON/base64 representation. Submission mutations accept only finalized opaque `fileObjectIds`.

Expected safe error codes include `FILE_TOO_LARGE`, `FILE_TYPE_NOT_ALLOWED`, `FILE_CONTENT_MISMATCH`, `MALWARE_DETECTED`, `MALWARE_SCANNER_UNAVAILABLE`, `MALWARE_SCAN_TIMEOUT`, `MALWARE_SCAN_FAILED`, `UPLOAD_INTENT_EXPIRED`, `TENANT_STORAGE_QUOTA_EXCEEDED`, `GLOBAL_STORAGE_QUOTA_EXCEEDED`, `PHYSICAL_STORAGE_SAFETY_GUARD`, `FILE_NOT_AVAILABLE`, and a non-enumerating authorization/not-found result. Responses include the request ID but not provider details, local paths, raw scanner responses, or another scope's remaining capacity.

## 11. Cached accounting and reconciliation

Request-path enforcement uses `StorageUsageAccount`; it does not scan the bucket or filesystem. All usage mutations are transactional with metadata state changes and use compare-and-set/versioning or row locks. Storage-side actions carry an operation ID so retries do not double-charge.

A scheduled reconciliation process:

1. walks bounded pages of application-owned object prefixes and metadata rather than blocking requests;
2. compares object existence and authoritative size to blob, staging, derivative, and deletion-pending records;
3. identifies missing objects, untracked objects, stale multipart uploads/intents, checksum mismatches, and usage-counter drift;
4. repairs only safe derived counters automatically; destructive cleanup and evidence-affecting changes require the unresolved retention policy and audit;
5. records per-tenant and global drift, run cursor, outcome, and correlation ID;
6. alerts on unexplained drift, integrity failure, quota oversubscription, or repeated incomplete operations.

Reconciliation is idempotent and resumable. It never makes a cross-tenant inference from a filename or caller-supplied value.

## 12. Testing plan

### Unit and policy tests

- exact boundary values at 25 MB and each 75/90/95/100 percent state;
- independent global and tenant quota failures, quota decreases below usage, reservation expiry, and zero available bytes;
- accounting formulas, derivative charging, dedup charge-once behavior, and category reporting labels;
- extension/MIME/signature agreement for every allowed type and rejection of mismatches, disguised executables, malformed packages, archive bombs, and oversized images;
- immutable-original and replacement/revision rules;
- filename/header sanitization and safe errors.

### Integration and concurrency tests

- atomic dual-scope reservations under concurrent uploads near both limits;
- same-tenant identical concurrent uploads produce one blob and multiple file objects;
- identical cross-tenant uploads produce separate blobs and independent charges;
- failed upload, failed finalize, database failure after object write, object-store failure after metadata transition, retry, and cleanup accounting;
- object metadata, SHA-256, actual size, and database constraints;
- reconciliation detects and safely reports missing, orphaned, stale, and drifted states;
- physical guard rejects writes independently of otherwise available application quota.

### Authorization and end-to-end tests

- each upload/download step uses trusted tenant context and rejects payload tenant tampering;
- tenant A cannot discover, attach, download, deduplicate against, or inspect usage for tenant B;
- teacher/student parent-resource policies are rechecked on download and after membership/assignment changes;
- `TENANT_ADMIN` sees detailed tenant usage, `TEACHER` sees only the required summary, and neither sees global/other-tenant usage;
- `FULL` rejects new uploads with existing authorized downloads still working;
- signed URLs are private, short-lived, scoped, and unusable for another key/action;
- background validation, derivative, cleanup, and reconciliation jobs preserve tenant scope across retries.

### Contract, resilience, and operational tests

- run the same adapter contract against local/fake and selected S3-compatible implementations;
- validate authoritative size/type behavior for signed and streamed upload variants;
- exercise scanner timeout/unavailability/infection, partial multipart upload, retry budget, bounded concurrency, and idempotent completion;
- verify metrics/alerts for usage, reservations, quota rejection by scope, physical guard, validation failures, reconciliation drift, and provider health;
- restore database metadata with object storage in a staging recovery exercise before pilot, once backup/RTO/RPO decisions are accepted.

## 13. Explicitly unresolved storage decisions

The following remain open and must not be silently implemented:

- permanent statutory/contractual retention, future finalized-evidence deletion, legal hold, export, and any historical scanner re-scan policy; the controlled pilot behavior is fixed by [ADR-0018](../decisions/ADR-0018-file-security-retention-and-malware-policy.md);
- streamed downloads versus signed URLs as the default;
- production object-storage provider, bucket layout details, region, replication, versioning, backup, restore, RTO/RPO, and support ownership;
- numerical minimum-free-byte and minimum-free-percentage guard values per environment;
- exact platform role/workflow permitted to change quotas;
- individual file-download audit retention policy.
