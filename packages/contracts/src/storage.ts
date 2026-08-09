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

export type CreateUploadIntent = z.infer<typeof createUploadIntentSchema>;
export type UploadIntent = z.infer<typeof uploadIntentSchema>;
