import { z } from 'zod';

const opaqueIdSchema = z.string().uuid();
const timestampSchema = z.iso.datetime({ offset: true });

export const storageCategorySchema = z.enum([
  'LEARNING_MATERIAL',
  'ASSIGNMENT_SOURCE',
  'ASSESSMENT_SOURCE',
  'STUDENT_SUBMISSION',
  'GENERATED_DERIVATIVE',
  'OTHER_SYSTEM',
]);

export const storageUploadCategorySchema = z.enum([
  'LEARNING_MATERIAL',
  'ASSIGNMENT_SOURCE',
  'ASSESSMENT_SOURCE',
  'STUDENT_SUBMISSION',
]);

export const storageQuotaStateSchema = z.enum([
  'NORMAL',
  'INFO',
  'WARNING',
  'CRITICAL',
  'FULL',
]);

/**
 * CONSISTENT: the incrementally-maintained usage counter agrees with a fresh
 * database recomputation. DRIFT_DETECTED: they disagree by more than a small
 * rounding tolerance (a reconciliation pass should be run to find why).
 * REPAIR_REQUIRED: a reconciliation pass already found and recorded specific
 * DB-vs-filesystem discrepancies that need an explicit, audited repair.
 */
export const storageReconciliationStatusSchema = z.enum([
  'CONSISTENT',
  'DRIFT_DETECTED',
  'REPAIR_REQUIRED',
]);

export const uploadIntentStatusSchema = z.enum([
  'RESERVED',
  'STAGED',
  'FINALIZED',
  'FAILED',
  'EXPIRED',
]);

/**
 * Control-plane metadata for an upload. File bytes are intentionally absent;
 * they are transferred through the dedicated multipart content endpoint.
 */
export const createUploadIntentSchema = z
  .object({
    parentType: z.literal('LEARNING_ITEM'),
    parentId: opaqueIdSchema,
    category: storageUploadCategorySchema,
    filename: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().min(1).max(160),
    sizeBytes: z.number().int().nonnegative().max(25_000_000),
  })
  .strict();

export const uploadIntentSchema = z
  .object({
    id: opaqueIdSchema,
    parentType: z.literal('LEARNING_ITEM'),
    parentId: opaqueIdSchema,
    category: storageUploadCategorySchema,
    filename: z.string().min(1).max(255),
    mimeType: z.string().min(1).max(160),
    sizeBytes: z.number().int().nonnegative(),
    status: uploadIntentStatusSchema,
    expiresAt: timestampSchema,
    upload: z
      .object({
        method: z.literal('POST'),
        path: z.string().min(1).max(300),
        fieldName: z.literal('file'),
        maxSizeBytes: z.literal(25_000_000),
      })
      .strict(),
  })
  .strict();

export const storageFileSchema = z
  .object({
    id: opaqueIdSchema,
    originalFilename: z.string().min(1).max(255),
    sizeBytes: z.number().int().nonnegative(),
    declaredMime: z.string().min(1).max(160),
    detectedMime: z.string().min(1).max(160),
    extension: z.string().min(1).max(16),
    category: storageCategorySchema,
    createdAt: timestampSchema,
  })
  .strict();

export const storageCategoryUsageSchema = z
  .object({
    category: storageCategorySchema,
    logicalBytes: z.number().int().nonnegative(),
    fileCount: z.number().int().nonnegative(),
  })
  .strict();

export const storageUsageSchema = z
  .object({
    tenantId: z.string().min(1).max(128),
    quotaBytes: z.number().int().nonnegative(),
    usedBytes: z.number().int().nonnegative(),
    reservedBytes: z.number().int().nonnegative(),
    availableBytes: z.number().int().nonnegative(),
    usagePercentage: z.number().min(0).max(100),
    allocationPercentage: z.number().min(0).max(100),
    remainingPercentage: z.number().min(0).max(100),
    state: storageQuotaStateSchema,
    fileCount: z.number().int().nonnegative(),
    blobCount: z.number().int().nonnegative(),
    byCategory: z.array(storageCategoryUsageSchema),
    // Distinct accounting metrics: dedup means these can legitimately differ
    // from usedBytes/from each other. See ADR/file-storage.md.
    logicalUsedBytes: z.number().int().nonnegative(),
    physicalBlobBytes: z.number().int().nonnegative(),
    temporaryOrStagedBytes: z.number().int().nonnegative(),
    physicalStorageTotalBytes: z.number().int().nonnegative().nullable(),
    physicalStorageFreeBytes: z.number().int().nonnegative().nullable(),
    reconciliationStatus: storageReconciliationStatusSchema,
  })
  .strict();

export const storagePolicySchema = z
  .object({
    maxFileSizeBytes: z.number().int().positive(),
    allowedExtensions: z.array(z.string()),
    globalQuotaBytes: z.number().int().nonnegative(),
    tenantQuotaBytes: z.number().int().nonnegative(),
    initialOperationalTimezone: z.literal('America/Santiago'),
  })
  .strict();

export const storageReconciliationDiscrepancyTypeSchema = z.enum([
  'MISSING_PHYSICAL_BLOB',
  'ORPHAN_PHYSICAL_BLOB',
  'FILE_OBJECT_INCONSISTENCY',
  'QUOTA_COUNTER_DRIFT',
  'STALE_RESERVED_INTENT',
  'STALE_STAGED_INTENT',
  'STAGING_RESIDUE',
]);

export const storageReconciliationDiscrepancySchema = z
  .object({
    type: storageReconciliationDiscrepancyTypeSchema,
    description: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const storageReconciliationReportSchema = z
  .object({
    tenantId: z.string().min(1).max(128),
    reconciledAt: timestampSchema,
    status: storageReconciliationStatusSchema,
    discrepancies: z.array(storageReconciliationDiscrepancySchema),
    accountedUsedBytes: z.number().int().nonnegative(),
    computedBlobBytes: z.number().int().nonnegative(),
    driftBytes: z.number().int(),
    staleIntentsCount: z.number().int().nonnegative(),
    totalBlobsChecked: z.number().int().nonnegative(),
    repaired: z.boolean(),
  })
  .strict();

export const storageReconciliationOptionsSchema = z
  .object({
    dryRun: z.boolean().default(true),
  })
  .strict();

export type CreateUploadIntent = z.infer<typeof createUploadIntentSchema>;
export type UploadIntent = z.infer<typeof uploadIntentSchema>;
export type StorageFile = z.infer<typeof storageFileSchema>;
export type StorageUsage = z.infer<typeof storageUsageSchema>;
export type StoragePolicy = z.infer<typeof storagePolicySchema>;
export type StorageReconciliationReport = z.infer<
  typeof storageReconciliationReportSchema
>;
export type StorageReconciliationOptions = z.infer<
  typeof storageReconciliationOptionsSchema
>;

