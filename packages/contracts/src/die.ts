import { z } from 'zod';

const uuid = z.string().uuid();
const timestamp = z.iso.datetime({ offset: true });
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const trimmed = (max: number) => z.string().trim().min(1).max(max);
const timeZone = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
      return true;
    } catch {
      return false;
    }
  }, 'Must be a valid IANA time zone.');

export const dieMemberRoleSchema = z.enum(['MEMBER', 'COORDINATOR']);
export const dieAccessSchema = z.object({ allowed: z.literal(true) }).strict();
export const dieStudentCandidateSchema = z
  .object({
    studentId: uuid,
    displayName: z.string(),
    courseLabel: z.string().nullable(),
  })
  .strict();
export const dieJournalCategorySchema = z.enum([
  'BEHAVIOR_SITUATION',
  'OBSERVATION',
  'INTERVENTION_OR_ATTENTION',
  'INTERVIEW_OR_MEETING',
  'AGREEMENT',
  'PROGRESS_OR_RECOGNITION',
  'OTHER',
]);
export const dieInformationSourceSchema = z.enum([
  'WITNESSED',
  'REPORTED_BY_THIRD_PARTY',
]);
export const dieActionStatusSchema = z.enum([
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
]);

export const dieMemberSchema = z
  .object({
    id: uuid,
    teacherId: uuid.nullable(),
    identityMembershipId: z.string().min(1).max(128),
    identityUserId: z.string().min(1).max(128),
    displayName: z.string().min(1).max(241),
    role: dieMemberRoleSchema,
    addedAt: timestamp,
  })
  .strict();

export const addDieMemberSchema = z
  .object({ institutionalUsername: trimmed(128) })
  .strict();
export const updateDieMemberRoleSchema = z
  .object({ role: dieMemberRoleSchema })
  .strict();
export const removeDieMemberSchema = z
  .object({
    reason: trimmed(500),
    reassignToMemberAssignmentId: uuid.optional(),
  })
  .strict();

const academicContextSchema = z
  .object({
    academicYearId: uuid.nullable(),
    academicYearLabel: z.string().max(160).nullable(),
    courseId: uuid.nullable(),
    courseLabel: z.string().max(160).nullable(),
  })
  .strict();

export const dieSupportEpisodeSchema = z
  .object({
    id: uuid,
    studentId: uuid,
    startDate: date,
    reason: z.string().min(1),
    responsibleMemberAssignmentId: uuid.nullable(),
    status: z.enum(['ACTIVE', 'FINISHED']),
    endDate: date.nullable(),
    endReason: z.string().nullable(),
    academicContext: academicContextSchema,
    createdAt: timestamp,
  })
  .strict();

export const dieStudentSummarySchema = z
  .object({
    studentId: uuid,
    displayName: z.string().min(1).max(241),
    activeEpisode: dieSupportEpisodeSchema.nullable(),
    latestEpisode: dieSupportEpisodeSchema,
  })
  .strict();

export const startDieSupportSchema = z
  .object({
    studentId: uuid,
    startDate: date,
    reason: trimmed(4000),
    responsibleMemberAssignmentId: uuid.optional(),
  })
  .strict();
export const finishDieSupportSchema = z
  .object({ endDate: date, reason: trimmed(4000) })
  .strict();

export const dieJournalContentSchema = z
  .object({
    category: dieJournalCategorySchema,
    eventDate: date,
    eventTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable(),
    eventTimeApproximate: z.boolean(),
    eventTimeZone: timeZone.nullable(),
    place: z.string().max(240).nullable(),
    title: z.string().min(1).max(240),
    description: z.string().min(1).max(20_000),
    immediateAction: z.string().max(10_000).nullable(),
    informationSource: dieInformationSourceSchema,
    thirdPartySource: z.string().max(240).nullable(),
    academicContext: academicContextSchema,
  })
  .strict();

const dieJournalInputSchema = dieJournalContentSchema
  .omit({ academicContext: true, eventTimeZone: true })
  .extend({ studentId: uuid, supportEpisodeId: uuid });

const validateJournalInput = (
  value: z.infer<typeof dieJournalInputSchema>,
  context: z.RefinementCtx,
) => {
  if (value.eventTime === null && value.eventTimeApproximate) {
    context.addIssue({
      code: 'custom',
      path: ['eventTimeApproximate'],
      message: 'Approximation requires a known time.',
    });
  }
  if (
    value.informationSource === 'REPORTED_BY_THIRD_PARTY' &&
    !value.thirdPartySource?.trim()
  ) {
    context.addIssue({
      code: 'custom',
      path: ['thirdPartySource'],
      message: 'A third-party source description is required.',
    });
  }
  if (
    value.informationSource === 'WITNESSED' &&
    value.thirdPartySource !== null
  ) {
    context.addIssue({
      code: 'custom',
      path: ['thirdPartySource'],
      message: 'A witnessed fact cannot name a third-party source.',
    });
  }
};

export const createDieJournalEntrySchema = dieJournalInputSchema.superRefine(
  (value, context) => {
    validateJournalInput(value, context);
  },
);

export const correctDieJournalEntrySchema = dieJournalInputSchema
  .omit({ studentId: true, supportEpisodeId: true })
  .extend({ reason: z.string().trim().max(1000).nullable() })
  .superRefine((value, context) => {
    validateJournalInput(
      { ...value, studentId: '', supportEpisodeId: '' },
      context,
    );
  });

export const voidDieJournalEntrySchema = z
  .object({ reason: trimmed(1000) })
  .strict();

export const dieJournalRevisionSchema = dieJournalContentSchema.extend({
  revisionNumber: z.number().int().positive(),
  correctedByIdentityUserId: z.string().min(1).max(128),
  correctedByDisplayLabel: z.string().min(1).max(241),
  correctionReason: z.string().nullable(),
  createdAt: timestamp,
});

export const dieAttachmentSchema = z
  .object({
    id: uuid,
    fileObjectId: uuid,
    filename: z.string().min(1).max(255),
    sizeBytes: z.number().int().nonnegative(),
    detectedMime: z.string().min(1).max(160),
    createdAt: timestamp,
  })
  .strict();

export const dieJournalEntrySchema = z
  .object({
    id: uuid,
    studentId: uuid,
    supportEpisodeId: uuid,
    originalAuthorIdentityUserId: z.string().min(1).max(128),
    originalAuthorDisplayLabel: z.string().min(1).max(241),
    status: z.enum(['CURRENT', 'VOIDED']),
    voidReason: z.string().nullable(),
    voidedByIdentityUserId: z.string().nullable(),
    voidedAt: timestamp.nullable(),
    createdAt: timestamp,
    current: dieJournalRevisionSchema,
    revisions: z.array(dieJournalRevisionSchema),
    attachments: z.array(dieAttachmentSchema),
  })
  .strict();

export const createDieActionSchema = z
  .object({
    studentId: uuid,
    journalEntryId: uuid.optional(),
    title: trimmed(240),
    description: z.string().trim().max(10_000).optional(),
    assigneeMemberAssignmentId: uuid,
    dueDate: date.optional(),
  })
  .strict();

export const updateDieActionSchema = z
  .object({
    title: trimmed(240).optional(),
    description: z.string().trim().max(10_000).nullable().optional(),
    dueDate: date.nullable().optional(),
    status: dieActionStatusSchema.optional(),
    result: z.string().trim().max(10_000).optional(),
    cancellationReason: z.string().trim().max(10_000).optional(),
  })
  .strict();

export const reassignDieActionSchema = z
  .object({ assigneeMemberAssignmentId: uuid, reason: trimmed(1000) })
  .strict();

export const dieActionSchema = z
  .object({
    id: uuid,
    studentId: uuid,
    journalEntryId: uuid.nullable(),
    title: z.string(),
    description: z.string().nullable(),
    assigneeMemberAssignmentId: uuid,
    dueDate: date.nullable(),
    status: dieActionStatusSchema,
    result: z.string().nullable(),
    cancellationReason: z.string().nullable(),
    overdue: z.boolean().nullable(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();

export const createDieUploadIntentSchema = z
  .object({
    filename: trimmed(255),
    mimeType: trimmed(160),
    sizeBytes: z.number().int().nonnegative().max(25_000_000),
  })
  .strict();

export const dieUploadIntentSchema = z
  .object({
    id: uuid,
    journalEntryId: uuid,
    filename: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number().int().nonnegative(),
    expiresAt: timestamp,
    upload: z
      .object({
        method: z.literal('POST'),
        path: z.string(),
        fieldName: z.literal('file'),
        maxSizeBytes: z.literal(25_000_000),
      })
      .strict(),
  })
  .strict();

export type AddDieMember = z.infer<typeof addDieMemberSchema>;
export type RemoveDieMember = z.infer<typeof removeDieMemberSchema>;
export type StartDieSupport = z.infer<typeof startDieSupportSchema>;
export type FinishDieSupport = z.infer<typeof finishDieSupportSchema>;
export type CreateDieJournalEntry = z.infer<typeof createDieJournalEntrySchema>;
export type CorrectDieJournalEntry = z.infer<
  typeof correctDieJournalEntrySchema
>;
export type CreateDieAction = z.infer<typeof createDieActionSchema>;
export type UpdateDieAction = z.infer<typeof updateDieActionSchema>;
export type ReassignDieAction = z.infer<typeof reassignDieActionSchema>;
export type CreateDieUploadIntent = z.infer<typeof createDieUploadIntentSchema>;
export type DieUploadIntent = z.infer<typeof dieUploadIntentSchema>;
export type DieMember = z.infer<typeof dieMemberSchema>;
export type DieSupportEpisode = z.infer<typeof dieSupportEpisodeSchema>;
export type DieStudentSummary = z.infer<typeof dieStudentSummarySchema>;
export type DieJournalEntry = z.infer<typeof dieJournalEntrySchema>;
export type DieAction = z.infer<typeof dieActionSchema>;
