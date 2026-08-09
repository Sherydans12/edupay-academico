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

export const storageQuotaStateSchema = z.enum([
  'NORMAL',
  'INFO',
  'WARNING',
  'CRITICAL',
  'FULL',
]);

export const storageUploadFileSchema = z
  .object({
    filename: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().min(1).max(160),
    sizeBytes: z.number().int().nonnegative().max(25_000_000),
    contentBase64: z.string().min(1).max(34_000_000),
  })
  .strict();

export const learningAttachmentUploadSchema = storageUploadFileSchema
  .extend({
    purpose: z.enum([
      'LEARNING_MATERIAL',
      'ASSIGNMENT_SOURCE',
      'ASSESSMENT_SOURCE',
    ]),
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

export type StorageUploadFile = z.infer<typeof storageUploadFileSchema>;
export type LearningAttachmentUpload = z.infer<
  typeof learningAttachmentUploadSchema
>;
