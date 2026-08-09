import { z } from 'zod';

const opaqueIdSchema = z.string().uuid();
const timestampSchema = z.iso.datetime({ offset: true });

export const submissionStatusSchema = z.enum([
  'PENDING',
  'SUBMITTED',
  'REVIEWED',
  'CHANGES_REQUESTED',
]);

export const reviewActionSchema = z.enum([
  'COMMENTED',
  'REVIEWED',
  'CHANGES_REQUESTED',
]);

export const submissionReviewSchema = z
  .object({
    id: opaqueIdSchema,
    action: reviewActionSchema,
    comment: z.string().nullable(),
    reviewerIdentityUserId: z.string().min(1).max(128),
    createdAt: timestampSchema,
  })
  .strict();

export const submissionRevisionSchema = z
  .object({
    id: opaqueIdSchema,
    revisionNumber: z.number().int().positive(),
    studentComment: z.string().nullable(),
    submittedAt: timestampSchema,
    effectiveDueAt: timestampSchema,
    isLate: z.boolean(),
    createdByIdentityUserId: z.string().min(1).max(128),
    createdAt: timestampSchema,
    files: z.array(
      z.object({
        id: opaqueIdSchema,
        originalFilename: z.string().min(1).max(255),
        sizeBytes: z.number().int().nonnegative(),
        declaredMime: z.string().min(1).max(160),
        detectedMime: z.string().min(1).max(160),
        extension: z.string().min(1).max(16),
        category: z.literal('STUDENT_SUBMISSION'),
        createdAt: timestampSchema,
      }).strict(),
    ).min(1),
    reviews: z.array(submissionReviewSchema),
  })
  .strict();

export const submissionSchema = z
  .object({
    id: opaqueIdSchema,
    studentId: opaqueIdSchema,
    learningItemId: opaqueIdSchema,
    status: submissionStatusSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    revisions: z.array(submissionRevisionSchema),
  })
  .strict();

const finalizedFileIdsSchema = z
  .array(opaqueIdSchema)
  .min(1)
  .max(20)
  .superRefine((ids, context) => {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: 'custom',
        message: 'fileObjectIds must not contain duplicates.',
      });
    }
  });

export const createSubmissionSchema = z
  .object({
    fileObjectIds: finalizedFileIdsSchema,
    studentComment: z.string().trim().max(20_000).optional(),
  })
  .strict();

export const createSubmissionRevisionSchema = createSubmissionSchema;

export const createReviewSchema = z
  .object({
    action: reviewActionSchema,
    comment: z.string().trim().max(20_000).optional(),
  })
  .strict();

export type CreateSubmission = z.infer<typeof createSubmissionSchema>;
export type CreateSubmissionRevision = z.infer<
  typeof createSubmissionRevisionSchema
>;
export type CreateReview = z.infer<typeof createReviewSchema>;
