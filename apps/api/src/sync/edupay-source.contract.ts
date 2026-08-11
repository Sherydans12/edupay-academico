import { z } from 'zod';

import { EDUPAY_SCHEMA_VERSION } from './sync.constants';

const opaqueTokenSchema = z.string().min(1).max(4096);
const sourceTenantIdSchema = z.string().min(1).max(200);
const timestampSchema = z.iso.datetime({ offset: true });
const integrationIdSchema = z.string().uuid();
const nonBlankSourceString = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine((value) => value.trim().length > 0, {
      message: 'Source text must contain a non-whitespace character.',
    });
const requiredEntitiesSchema = z.tuple([
  z.literal('COURSE'),
  z.literal('STUDENT'),
]);

export const edupayCourseItemSchema = z
  .object({
    integrationId: integrationIdSchema,
    sourceTenantId: sourceTenantIdSchema,
    name: nonBlankSourceString(160),
    updatedAt: timestampSchema,
    deletedAt: timestampSchema.nullable(),
  })
  .strict();

export const edupayStudentItemSchema = z
  .object({
    integrationId: integrationIdSchema,
    sourceTenantId: sourceTenantIdSchema,
    firstName: nonBlankSourceString(120),
    lastName: nonBlankSourceString(120),
    status: z.enum(['ACTIVE', 'INACTIVE', 'GRADUATED']),
    courseIntegrationId: integrationIdSchema,
    updatedAt: timestampSchema,
    deletedAt: timestampSchema.nullable(),
  })
  .strict();

const conflictBaseSchema = z
  .object({
    integrationId: integrationIdSchema,
    sourceTenantId: sourceTenantIdSchema,
    updatedAt: timestampSchema,
    deletedAt: timestampSchema.nullable(),
  })
  .strict();

export const edupayCourseConflictSchema = conflictBaseSchema.extend({
  code: z.literal('COURSE_NAME_MISSING'),
  entity: z.literal('COURSE'),
});

export const edupayStudentConflictSchema = conflictBaseSchema.extend({
  code: z.literal('STUDENT_STRUCTURED_NAME_MISSING'),
  entity: z.literal('STUDENT'),
});

const pageSchema = z
  .object({
    limit: z.number().int().min(1).max(500),
    scannedCount: z.number().int().min(0).max(500),
    itemCount: z.number().int().min(0).max(500),
    conflictCount: z.number().int().min(0).max(500),
    nextCursor: opaqueTokenSchema.nullable(),
    complete: z.boolean(),
  })
  .strict();

const watermarkSchema = z
  .object({
    next: opaqueTokenSchema.nullable(),
    available: z.boolean(),
  })
  .strict();

const incrementalDescriptorSchema = z
  .object({
    runId: z.string().uuid(),
    capturedAt: timestampSchema,
  })
  .strict();

const fullDescriptor = (entity: 'COURSE' | 'STUDENT') =>
  z
    .object({
      runId: z.string().uuid(),
      capturedAt: timestampSchema,
      entity: z.literal(entity),
      entityComplete: z.boolean(),
      tenantSnapshotComplete: z.literal(false),
      requiredEntities: requiredEntitiesSchema,
    })
    .strict();

function feedConsistency<T extends z.ZodType>(schema: T) {
  return schema.superRefine((value, context) => {
    const feed = value as {
      items: unknown[];
      conflicts: unknown[];
      page: z.infer<typeof pageSchema>;
      watermark: z.infer<typeof watermarkSchema>;
      snapshot?: { entityComplete: boolean };
    };
    if (
      feed.page.scannedCount !==
        feed.page.itemCount + feed.page.conflictCount ||
      feed.page.itemCount !== feed.items.length ||
      feed.page.conflictCount !== feed.conflicts.length
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Feed counts are inconsistent.',
        path: ['page'],
      });
    }
    const terminal = feed.page.complete && feed.page.nextCursor === null;
    if (
      feed.page.complete !== (feed.page.nextCursor === null) ||
      feed.watermark.available !== terminal ||
      (terminal ? feed.watermark.next === null : feed.watermark.next !== null)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Feed terminal watermark state is inconsistent.',
        path: ['watermark'],
      });
    }
    if (feed.snapshot && feed.snapshot.entityComplete !== terminal) {
      context.addIssue({
        code: 'custom',
        message: 'Full feed entity completion is inconsistent.',
        path: ['snapshot', 'entityComplete'],
      });
    }
  });
}

const courseFeedBaseSchema = z
  .object({
    schemaVersion: z.literal(EDUPAY_SCHEMA_VERSION),
    sourceTenantId: sourceTenantIdSchema,
    entity: z.literal('COURSE'),
    items: z.array(edupayCourseItemSchema).max(500),
    conflicts: z.array(edupayCourseConflictSchema).max(500),
    page: pageSchema,
    watermark: watermarkSchema,
  })
  .strict();

const studentFeedBaseSchema = z
  .object({
    schemaVersion: z.literal(EDUPAY_SCHEMA_VERSION),
    sourceTenantId: sourceTenantIdSchema,
    entity: z.literal('STUDENT'),
    items: z.array(edupayStudentItemSchema).max(500),
    conflicts: z.array(edupayStudentConflictSchema).max(500),
    page: pageSchema,
    watermark: watermarkSchema,
  })
  .strict();

export const edupayIncrementalCourseFeedSchema = feedConsistency(
  courseFeedBaseSchema.extend({
    mode: z.literal('incremental'),
    run: incrementalDescriptorSchema,
  }),
);

export const edupayIncrementalStudentFeedSchema = feedConsistency(
  studentFeedBaseSchema.extend({
    mode: z.literal('incremental'),
    run: incrementalDescriptorSchema,
  }),
);

export const edupayFullCourseFeedSchema = feedConsistency(
  courseFeedBaseSchema.extend({
    mode: z.literal('full'),
    snapshot: fullDescriptor('COURSE'),
  }),
);

export const edupayFullStudentFeedSchema = feedConsistency(
  studentFeedBaseSchema.extend({
    mode: z.literal('full'),
    snapshot: fullDescriptor('STUDENT'),
  }),
);

export const edupaySnapshotStartSchema = z
  .object({
    schemaVersion: z.literal(EDUPAY_SCHEMA_VERSION),
    sourceTenantId: sourceTenantIdSchema,
    snapshotToken: opaqueTokenSchema,
    snapshot: z
      .object({
        runId: z.string().uuid(),
        capturedAt: timestampSchema,
        requiredEntities: requiredEntitiesSchema,
        complete: z.literal(false),
      })
      .strict(),
  })
  .strict();

export const edupaySnapshotCompletionSchema = z
  .object({
    schemaVersion: z.literal(EDUPAY_SCHEMA_VERSION),
    sourceTenantId: sourceTenantIdSchema,
    snapshot: z
      .object({
        runId: z.string().uuid(),
        capturedAt: timestampSchema,
        completedAt: timestampSchema,
        requiredEntities: requiredEntitiesSchema,
        complete: z.literal(true),
      })
      .strict(),
  })
  .strict();

export const edupaySourceErrorSchema = z
  .object({
    statusCode: z.number().int().min(400).max(599),
    code: z.enum([
      'INTEGRATION_AUTHENTICATION_FAILED',
      'SOURCE_TENANT_REQUIRED',
      'INTEGRATION_TENANT_FORBIDDEN',
      'INTEGRATION_NOT_CONFIGURED',
      'INTEGRATION_RATE_LIMITED',
      'INVALID_PAGE_SIZE',
      'INVALID_CURSOR',
      'INVALID_WATERMARK',
      'INVALID_SNAPSHOT',
      'FULL_SNAPSHOT_TOKEN_REQUIRED',
      'INCOMPLETE_SNAPSHOT',
      'UNSUPPORTED_SCHEMA_VERSION',
      'UNSUPPORTED_INTEGRATION_MODE',
    ]),
    message: z.string().min(1).max(500),
    timestamp: timestampSchema,
    path: z.string().min(1).max(500),
    correlationId: z.string().min(1).max(128).optional(),
  })
  .strict();

export type EduPayCourseItem = z.infer<typeof edupayCourseItemSchema>;
export type EduPayStudentItem = z.infer<typeof edupayStudentItemSchema>;
export type EduPayIncrementalCourseFeed = z.infer<
  typeof edupayIncrementalCourseFeedSchema
>;
export type EduPayIncrementalStudentFeed = z.infer<
  typeof edupayIncrementalStudentFeedSchema
>;
export type EduPayFullCourseFeed = z.infer<typeof edupayFullCourseFeedSchema>;
export type EduPayFullStudentFeed = z.infer<typeof edupayFullStudentFeedSchema>;
export type EduPaySnapshotStart = z.infer<typeof edupaySnapshotStartSchema>;
export type EduPaySnapshotCompletion = z.infer<
  typeof edupaySnapshotCompletionSchema
>;
