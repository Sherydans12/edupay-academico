# ADR-0005: private provider-agnostic object storage

Status: Accepted  
Date: 2026-08-08  
Decision authority: project storage directive dated 2026-08-08

## Context

Learning materials and submissions include files in a multi-tenant educational SaaS. Provider-specific URLs, public buckets, browser-owned authorization, filesystem scans on request paths, and reliance on physical free space alone would create security, integrity, availability, and migration risk. Student submission originals and document-based assessment sources are academic evidence whose uploaded bytes must be preserved.

## Decision

1. Store immutable bytes in private S3-compatible object storage through an application-owned, provider-agnostic abstraction. Store logical file metadata, physical blob metadata, references, tenant ownership, lifecycle, and accounted usage in EduPay Académico PostgreSQL.
2. Separate `StoredBlob`, `FileObject`, and `FileReference` concepts. Generate storage keys server-side and issue short-lived transfer URLs only after API authorization.
3. Resolve tenant context only from authenticated Identity membership/session context. Every file action rechecks resource authorization; a request payload `tenantId` is never authorization evidence.
4. Enforce a configurable 25 MB (`25,000,000` byte) per-file limit and the extension, declared-MIME, and detected-content allow list defined in [file storage architecture](../architecture/file-storage.md).
5. Enforce independent configurable global and per-tenant hard quotas using atomic cached accounting and reservations, not request-time storage scans. Initial values are 20 GB (`20,000,000,000` bytes) globally and 20 GB for Colegio Conquistadores.
6. Enforce an independent configured physical-capacity safety guard in addition to application quotas.
7. Account for actual application-managed persistent bytes. Tenant-local deduplication uses server-calculated SHA-256 and authoritative size; no deduplication or blob reuse occurs across tenants.
8. Preserve every accepted blob immutably. Student submission originals and assessment source originals are never silently recompressed, transformed, or overwritten. Optimized previews/derivatives are separately stored, authorized, and charged.
9. At 100% usage, reject new uploads while preserving authorized access to and download of existing files.
10. Reconcile cached accounting with bounded, resumable storage inventory jobs and audit important storage operations.

The complete quota semantics, data model, flows, role-visible usage, optimization rules, API proposal, and test requirements are normative in the linked storage architecture document.

## Rationale

- Keeps storage provider choice replaceable and buckets private.
- Makes tenant and resource authorization explicit for every operation.
- Preserves original academic evidence and revision history.
- Prevents concurrent uploads from bypassing global or tenant limits.
- Makes physical usage efficient within a tenant without creating cross-tenant existence or privacy channels.
- Avoids expensive and unreliable full-storage scans in request paths while retaining a repair mechanism.

## Consequences

- Uploads use pending intents, reservations, authoritative completion validation, and cleanup/reconciliation.
- PostgreSQL and object storage cannot commit atomically, so file lifecycle transitions and retries must be idempotent and compensating.
- Identical files in one tenant may share a blob but retain distinct logical metadata and audit history.
- Identical files in different tenants consume separate physical storage and separate quota.
- Derivatives consume quota and require their own lifecycle/authorization metadata.
- Adding another tenant without increasing the initial global quota reduces capacity available to Colegio Conquistadores even though its tenant limit remains 20 GB.

## Unresolved follow-up decisions

These items are intentionally not decided by this ADR:

- production provider, region, bucket layout details, replication/versioning, backup, RTO/RPO, and support ownership;
- malware scanning provider and quarantine/failure behavior;
- retention, deletion, legal hold, export, and cleanup durations;
- streamed downloads versus signed URLs as the default;
- numerical physical guard thresholds per environment;
- exact role/workflow for quota changes and individual-download audit retention.

These follow-ups must preserve the accepted tenant isolation, immutability, dual-quota, validation, and private-storage properties.
