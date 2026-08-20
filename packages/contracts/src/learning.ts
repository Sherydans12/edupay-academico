import { z } from 'zod';

const opaqueIdSchema = z.string().uuid();
const labelSchema = z.string().trim().min(1).max(160);
const textSchema = z.string().trim().max(20_000);
const timestampSchema = z.iso.datetime({ offset: true });

export const learningUnitStatusSchema = z.enum([
  'DRAFT',
  'ACTIVE',
  'ARCHIVED',
]);
export const learningItemTypeSchema = z.enum([
  'MATERIAL',
  'ASSIGNMENT',
  'ASSESSMENT',
  'ANNOUNCEMENT',
]);
export const learningItemPublicationStatusSchema = z.enum([
  'DRAFT',
  'SCHEDULED',
  'PUBLISHED',
  'ARCHIVED',
]);

const validateDateRange = <
  T extends { startAt?: string | undefined; endAt?: string | undefined },
>(
  value: T,
  context: z.RefinementCtx,
): void => {
  if (
    value.startAt &&
    value.endAt &&
    new Date(value.startAt).getTime() > new Date(value.endAt).getTime()
  ) {
    context.addIssue({
      code: 'custom',
      message: 'startAt must be on or before endAt',
      path: ['endAt'],
    });
  }
};

const expectedRevisionSchema = z.number().int().min(1);

export const learningUnitSchema = z
  .object({
    id: opaqueIdSchema,
    courseSubjectId: opaqueIdSchema,
    title: labelSchema,
    description: textSchema.nullable(),
    sortOrder: z.number().int().min(0),
    startAt: timestampSchema.nullable(),
    endAt: timestampSchema.nullable(),
    status: learningUnitStatusSchema,
    version: expectedRevisionSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const createLearningUnitSchema = z
  .object({
    courseSubjectId: opaqueIdSchema,
    title: labelSchema,
    description: textSchema.optional(),
    sortOrder: z.number().int().min(0).max(10_000).default(0),
    startAt: timestampSchema.optional(),
    endAt: timestampSchema.optional(),
  })
  .strict()
  .superRefine(validateDateRange);

export const updateLearningUnitSchema = z
  .object({
    title: labelSchema.optional(),
    description: textSchema.nullable().optional(),
    sortOrder: z.number().int().min(0).max(10_000).optional(),
    startAt: timestampSchema.nullable().optional(),
    endAt: timestampSchema.nullable().optional(),
    status: learningUnitStatusSchema.optional(),
    expectedRevision: expectedRevisionSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      Object.keys(value).some((key) => key !== 'expectedRevision'),
    { message: 'At least one field is required' },
  );

export const expectedRevisionBodySchema = z
  .object({ expectedRevision: expectedRevisionSchema.optional() })
  .strict();

const itemTextField = textSchema.nullable().optional();

export const learningItemSchema = z
  .object({
    id: opaqueIdSchema,
    courseSubjectId: opaqueIdSchema,
    learningUnitId: opaqueIdSchema,
    type: learningItemTypeSchema,
    title: labelSchema,
    description: textSchema.nullable(),
    content: textSchema.nullable(),
    instructions: textSchema.nullable(),
    body: textSchema.nullable(),
    sortOrder: z.number().int().min(0),
    publicationStatus: learningItemPublicationStatusSchema,
    publishAt: timestampSchema.nullable(),
    publishedAt: timestampSchema.nullable(),
    publishedByIdentityUserId: z.string().min(1).max(128).nullable(),
    dueAt: timestampSchema.nullable(),
    createdByIdentityUserId: z.string().min(1).max(128),
    updatedByIdentityUserId: z.string().min(1).max(128).nullable(),
    version: expectedRevisionSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const createLearningItemSchema = z
  .object({
    type: learningItemTypeSchema,
    title: labelSchema,
    description: itemTextField,
    content: itemTextField,
    instructions: itemTextField,
    body: itemTextField,
    sortOrder: z.number().int().min(0).max(10_000).default(0),
    dueAt: timestampSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.type === 'ASSIGNMENT' || value.type === 'ASSESSMENT') &&
      !value.instructions?.trim()
    ) {
      context.addIssue({
        code: 'custom',
        message: 'instructions are required for deliverable items',
        path: ['instructions'],
      });
    }
    if (
      (value.type === 'ASSIGNMENT' || value.type === 'ASSESSMENT') &&
      !value.dueAt
    ) {
      context.addIssue({
        code: 'custom',
        message: 'dueAt is required for deliverable items',
        path: ['dueAt'],
      });
    }
    if (value.type === 'ANNOUNCEMENT' && !value.body?.trim()) {
      context.addIssue({
        code: 'custom',
        message: 'body is required for announcements',
        path: ['body'],
      });
    }
    if (
      (value.type === 'MATERIAL' || value.type === 'ANNOUNCEMENT') &&
      value.dueAt
    ) {
      context.addIssue({
        code: 'custom',
        message: 'dueAt is only valid for deliverable items',
        path: ['dueAt'],
      });
    }
  });

export const updateLearningItemSchema = z
  .object({
    type: learningItemTypeSchema.optional(),
    title: labelSchema.optional(),
    description: itemTextField,
    content: itemTextField,
    instructions: itemTextField,
    body: itemTextField,
    sortOrder: z.number().int().min(0).max(10_000).optional(),
    dueAt: timestampSchema.nullable().optional(),
    confirmSensitiveChange: z.boolean().default(false),
    expectedRevision: expectedRevisionSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      Object.keys(value).some(
        (key) => key !== 'confirmSensitiveChange' && key !== 'expectedRevision',
      ),
    { message: 'At least one field is required' },
  );

const learningItemContentFieldsSchema = z.object({
  title: labelSchema.optional(),
  description: itemTextField,
  content: itemTextField,
  instructions: itemTextField,
  body: itemTextField,
  dueAt: timestampSchema.nullable().optional(),
});

export const saveLearningItemDraftSchema = learningItemContentFieldsSchema
  .extend({ expectedRevision: expectedRevisionSchema.optional() })
  .strict()
  .refine(
    (value) =>
      Object.keys(value).some((key) => key !== 'expectedRevision'),
    { message: 'At least one field is required' },
  );

export const learningItemDraftSchema = learningItemContentFieldsSchema
  .extend({
    learningItemId: opaqueIdSchema,
    basedOnVersion: expectedRevisionSchema,
    updatedByIdentityUserId: z.string().min(1).max(128),
    updatedAt: timestampSchema,
  })
  .strict();

export const contentEntityTypeSchema = z.enum(['LEARNING_UNIT', 'LEARNING_ITEM']);

export const contentRevisionOperationSchema = z.enum([
  'CREATED',
  'UPDATED',
  'SENSITIVE_CHANGE_CONFIRMED',
  'SCHEDULED',
  'PUBLISHED',
  'UNPUBLISHED',
  'ARCHIVED',
  'REORDERED',
  'MOVED',
  'DUPLICATED',
  'DRAFT_SAVED',
  'DRAFT_DISCARDED',
  'DRAFT_PUBLISHED',
  'RESTORED',
]);

export const contentRevisionSchema = z
  .object({
    id: opaqueIdSchema,
    entityType: contentEntityTypeSchema,
    entityId: opaqueIdSchema,
    revisionNumber: expectedRevisionSchema,
    operation: contentRevisionOperationSchema,
    snapshot: z.record(z.string(), z.unknown()),
    actorIdentityUserId: z.string().min(1).max(128),
    requestId: z.string().min(1).max(128).nullable(),
    restoredFromRevision: expectedRevisionSchema.nullable(),
    createdAt: timestampSchema,
  })
  .strict();

export const restoreRevisionSchema = z
  .object({ expectedRevision: expectedRevisionSchema.optional() })
  .strict();

export const publishLearningItemDraftSchema = z
  .object({ confirmSensitiveChange: z.boolean().default(false) })
  .strict();

export const scheduleLearningItemSchema = z
  .object({
    publishAt: timestampSchema,
    confirmSensitiveChange: z.boolean().default(false),
    expectedRevision: expectedRevisionSchema.optional(),
  })
  .strict();

export const reorderLearningSchema = z
  .object({ orderedIds: z.array(opaqueIdSchema).min(1).max(500) })
  .strict()
  .refine((value) => new Set(value.orderedIds).size === value.orderedIds.length, {
    message: 'orderedIds must not contain duplicates',
    path: ['orderedIds'],
  });

export const learningUnitWithItemsSchema = learningUnitSchema
  .extend({ items: z.array(learningItemSchema) })
  .strict();

export const courseSubjectLearningRouteSchema = z
  .object({
    courseSubjectId: opaqueIdSchema,
    units: z.array(learningUnitWithItemsSchema),
  })
  .strict();

export const moveLearningItemSchema = z
  .object({
    targetLearningUnitId: opaqueIdSchema,
    expectedRevision: expectedRevisionSchema.optional(),
  })
  .strict();

export const duplicateLearningItemSchema = z
  .object({
    targetLearningUnitId: opaqueIdSchema.optional(),
    title: labelSchema.optional(),
  })
  .strict();

export const duplicateLearningUnitSchema = z
  .object({
    title: labelSchema.optional(),
    duplicateItems: z.boolean().default(true),
  })
  .strict();

export type CreateLearningUnit = z.infer<typeof createLearningUnitSchema>;
export type UpdateLearningUnit = z.infer<typeof updateLearningUnitSchema>;
export type CreateLearningItem = z.infer<typeof createLearningItemSchema>;
export type UpdateLearningItem = z.infer<typeof updateLearningItemSchema>;
export type ScheduleLearningItem = z.infer<typeof scheduleLearningItemSchema>;
export type ReorderLearning = z.infer<typeof reorderLearningSchema>;
export type LearningUnit = z.infer<typeof learningUnitSchema>;
export type LearningItem = z.infer<typeof learningItemSchema>;
export type LearningUnitWithItems = z.infer<typeof learningUnitWithItemsSchema>;
export type CourseSubjectLearningRoute = z.infer<
  typeof courseSubjectLearningRouteSchema
>;
export type SaveLearningItemDraft = z.infer<typeof saveLearningItemDraftSchema>;
export type LearningItemDraft = z.infer<typeof learningItemDraftSchema>;
export type ContentRevision = z.infer<typeof contentRevisionSchema>;
export type RestoreRevision = z.infer<typeof restoreRevisionSchema>;
export type PublishLearningItemDraft = z.infer<typeof publishLearningItemDraftSchema>;
export type MoveLearningItem = z.infer<typeof moveLearningItemSchema>;
export type DuplicateLearningItem = z.infer<typeof duplicateLearningItemSchema>;
export type DuplicateLearningUnit = z.infer<typeof duplicateLearningUnitSchema>;
