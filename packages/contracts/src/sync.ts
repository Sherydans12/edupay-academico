import { z } from 'zod';

const timestampSchema = z.iso.datetime({ offset: true });
const countSchema = z.number().int().min(0);

export const syncRunCountsSchema = z
  .object({
    seen: countSchema,
    created: countSchema,
    updated: countSchema,
    unchanged: countSchema,
    deactivated: countSchema,
    conflicted: countSchema,
    failed: countSchema,
  })
  .strict();

export const syncStatusSchema = z
  .object({
    source: z.literal('EDUPAY'),
    configured: z.boolean(),
    configuration: z
      .object({
        sourceTenantId: z.string().min(1).max(200),
        academicYearId: z.string().uuid(),
        academicYearLabel: z.string().min(1).max(160),
        enabled: z.boolean(),
      })
      .strict()
      .nullable(),
    lastIncrementalSuccessAt: timestampSchema.nullable(),
    lastFullSuccessAt: timestampSchema.nullable(),
    lastRun: z
      .object({
        id: z.string().uuid(),
        mode: z.enum(['INCREMENTAL', 'FULL']),
        status: z.enum([
          'RUNNING',
          'SUCCEEDED',
          'PARTIAL',
          'FAILED',
          'SOURCE_UNAVAILABLE',
        ]),
        startedAt: timestampSchema,
        finishedAt: timestampSchema.nullable(),
        counts: syncRunCountsSchema,
        errorCode: z.string().min(1).max(80).nullable(),
      })
      .strict()
      .nullable(),
    currentConflictCount: countSchema,
  })
  .strict();

export type SyncStatus = z.infer<typeof syncStatusSchema>;
