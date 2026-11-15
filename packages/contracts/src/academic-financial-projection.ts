import { z } from 'zod';

/**
 * Academic Financial Projection v2 is the outbound Académico -> Payments
 * contract (ADR-0021, ADR-0025). It is not the legacy EduPay -> Academic sync
 * feed. v2 replaces v1 before any production activation: besides identifiers it
 * carries the minimum Payments needs to create and update its own records
 * without double entry: student names and RUN/IPE, course label and the
 * academic year. It never carries credentials, guardians, grades, submissions,
 * DIE records or pedagogical data. RUN/IPE is sensitive in every service: it
 * must not be logged, audited or echoed outside the records that need it.
 */
export const ACADEMIC_FINANCIAL_PROJECTION_SCHEMA_VERSION = '2' as const;

const canonicalTenantIdSchema = z.string().uuid();
const academicEntityIdSchema = z.string().uuid();
const timestampSchema = z.iso.datetime({ offset: true });
const opaqueTokenSchema = z.string().min(1).max(4096);
const positiveVersionSchema = z.number().int().positive();

export const academicFinancialProjectionEnrollmentStatusSchema = z.enum([
  'ACTIVE',
  'INACTIVE',
]);

export const academicFinancialProjectionOperationSchema = z.enum([
  'UPSERT',
  'TOMBSTONE',
]);

const personNameSchema = z.string().trim().min(1).max(120);
/**
 * Reference of a record that originated in the legacy EduPay/BL feed (its BL
 * integrationId, kept as Académico externalReference). Payments links its
 * existing records by this value, never by name, course or email.
 */
const legacyIntegrationIdSchema = z.string().min(1).max(200).nullable();

export const academicFinancialProjectionStudentSchema = z
  .object({
    firstName: personNameSchema,
    lastName: personNameSchema,
    nationalIdType: z.enum(['RUN', 'IPE']).nullable(),
    nationalId: z.string().min(1).max(20).nullable(),
    legacyIntegrationId: legacyIntegrationIdSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.nationalIdType === null) !== (value.nationalId === null)) {
      context.addIssue({
        code: 'custom',
        message:
          'nationalIdType and nationalId must be both present or both null.',
        path: ['nationalId'],
      });
    }
  });

export const academicFinancialProjectionCourseSchema = z
  .object({
    label: z.string().trim().min(1).max(160),
    legacyIntegrationId: legacyIntegrationIdSchema,
  })
  .strict();

export const academicFinancialProjectionAcademicYearSchema = z
  .object({
    label: z.string().trim().min(1).max(160),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    status: z.enum(['DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED']),
  })
  .strict();

/**
 * A financial read model of one academic CourseEnrollment. The current
 * Academic Course already belongs to its AcademicYear; no CourseOffering is
 * introduced by this contract.
 */
export const academicFinancialProjectionEnrollmentSchema = z
  .object({
    canonicalTenantId: canonicalTenantIdSchema,
    academicYearId: academicEntityIdSchema,
    academicStudentId: academicEntityIdSchema,
    academicCourseId: academicEntityIdSchema,
    academicEnrollmentId: academicEntityIdSchema,
    enrollmentStatus: academicFinancialProjectionEnrollmentStatusSchema,
    effectiveFrom: timestampSchema,
    effectiveTo: timestampSchema.nullable(),
    version: positiveVersionSchema,
    updatedAt: timestampSchema,
    operation: academicFinancialProjectionOperationSchema,
    student: academicFinancialProjectionStudentSchema,
    course: academicFinancialProjectionCourseSchema,
    academicYear: academicFinancialProjectionAcademicYearSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.effectiveTo && value.effectiveTo < value.effectiveFrom) {
      context.addIssue({
        code: 'custom',
        message: 'effectiveTo must not be before effectiveFrom.',
        path: ['effectiveTo'],
      });
    }
    if (value.operation === 'TOMBSTONE' && value.effectiveTo === null) {
      context.addIssue({
        code: 'custom',
        message: 'A tombstone requires an effectiveTo timestamp.',
        path: ['effectiveTo'],
      });
    }
    if (
      value.operation === 'TOMBSTONE' &&
      value.enrollmentStatus !== 'INACTIVE'
    ) {
      context.addIssue({
        code: 'custom',
        message: 'A tombstone must have INACTIVE enrollmentStatus.',
        path: ['enrollmentStatus'],
      });
    }
  });

export const academicFinancialProjectionSnapshotQuerySchema = z
  .object({
    cursor: opaqueTokenSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

const snapshotDescriptorSchema = z
  .object({
    snapshotId: z.string().uuid(),
    canonicalTenantId: canonicalTenantIdSchema,
    capturedAt: timestampSchema,
    entity: z.literal('ACADEMIC_ENROLLMENT'),
    complete: z.boolean(),
  })
  .strict();

export const academicFinancialProjectionSnapshotStartSchema = z
  .object({
    schemaVersion: z.literal(ACADEMIC_FINANCIAL_PROJECTION_SCHEMA_VERSION),
    snapshotToken: opaqueTokenSchema,
    snapshot: snapshotDescriptorSchema.extend({ complete: z.literal(false) }),
  })
  .strict();

export const academicFinancialProjectionSnapshotPageSchema = z
  .object({
    schemaVersion: z.literal(ACADEMIC_FINANCIAL_PROJECTION_SCHEMA_VERSION),
    snapshot: snapshotDescriptorSchema,
    items: z.array(academicFinancialProjectionEnrollmentSchema).max(100),
    page: z
      .object({
        limit: z.number().int().min(1).max(100),
        itemCount: z.number().int().min(0).max(100),
        nextCursor: opaqueTokenSchema.nullable(),
        complete: z.boolean(),
      })
      .strict(),
    watermark: z
      .object({
        value: opaqueTokenSchema.nullable(),
        available: z.boolean(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    const terminal = value.page.complete && value.page.nextCursor === null;
    if (value.items.length !== value.page.itemCount) {
      context.addIssue({
        code: 'custom',
        message: 'itemCount must equal the number of items.',
        path: ['page', 'itemCount'],
      });
    }
    if (value.page.complete !== (value.page.nextCursor === null)) {
      context.addIssue({
        code: 'custom',
        message: 'complete and nextCursor are inconsistent.',
        path: ['page'],
      });
    }
    if (
      value.watermark.available !== terminal ||
      (terminal
        ? value.watermark.value === null
        : value.watermark.value !== null)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'The watermark is only available on the terminal page.',
        path: ['watermark'],
      });
    }
    if (value.snapshot.complete !== terminal) {
      context.addIssue({
        code: 'custom',
        message: 'Snapshot completion must match terminal pagination.',
        path: ['snapshot', 'complete'],
      });
    }
    for (const [index, item] of value.items.entries()) {
      if (item.canonicalTenantId !== value.snapshot.canonicalTenantId) {
        context.addIssue({
          code: 'custom',
          message: 'All items must belong to the snapshot tenant.',
          path: ['items', index, 'canonicalTenantId'],
        });
      }
    }
  });

export const academicFinancialProjectionSnapshotCompleteSchema = z
  .object({
    schemaVersion: z.literal(ACADEMIC_FINANCIAL_PROJECTION_SCHEMA_VERSION),
    snapshot: snapshotDescriptorSchema.extend({ complete: z.literal(true) }),
    watermark: opaqueTokenSchema,
    completedAt: timestampSchema,
  })
  .strict();

export const ACADEMIC_FINANCIAL_PROJECTION_UPSERTED_EVENT =
  'academic.financial-projection.enrollment.upserted.v2' as const;
export const ACADEMIC_FINANCIAL_PROJECTION_TOMBSTONED_EVENT =
  'academic.financial-projection.enrollment.tombstoned.v2' as const;

export const academicFinancialProjectionEventTypeSchema = z.enum([
  ACADEMIC_FINANCIAL_PROJECTION_UPSERTED_EVENT,
  ACADEMIC_FINANCIAL_PROJECTION_TOMBSTONED_EVENT,
]);

export const academicFinancialProjectionEventSchema = z
  .object({
    eventId: z.string().uuid(),
    eventType: academicFinancialProjectionEventTypeSchema,
    schemaVersion: z.literal(ACADEMIC_FINANCIAL_PROJECTION_SCHEMA_VERSION),
    canonicalTenantId: canonicalTenantIdSchema,
    aggregateType: z.literal('ACADEMIC_ENROLLMENT'),
    aggregateId: academicEntityIdSchema,
    entityVersion: positiveVersionSchema,
    occurredAt: timestampSchema,
    correlationId: z.string().min(1).max(128).nullable(),
    payload: academicFinancialProjectionEnrollmentSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.aggregateId !== value.payload.academicEnrollmentId) {
      context.addIssue({
        code: 'custom',
        message: 'aggregateId must equal payload.academicEnrollmentId.',
        path: ['aggregateId'],
      });
    }
    if (value.entityVersion !== value.payload.version) {
      context.addIssue({
        code: 'custom',
        message: 'entityVersion must equal payload.version.',
        path: ['entityVersion'],
      });
    }
    if (value.canonicalTenantId !== value.payload.canonicalTenantId) {
      context.addIssue({
        code: 'custom',
        message: 'canonicalTenantId must equal payload.canonicalTenantId.',
        path: ['canonicalTenantId'],
      });
    }
    const expectedOperation =
      value.eventType === ACADEMIC_FINANCIAL_PROJECTION_TOMBSTONED_EVENT
        ? 'TOMBSTONE'
        : 'UPSERT';
    if (value.payload.operation !== expectedOperation) {
      context.addIssue({
        code: 'custom',
        message: 'eventType and payload.operation are inconsistent.',
        path: ['payload', 'operation'],
      });
    }
  });

export type AcademicFinancialProjectionEnrollment = z.infer<
  typeof academicFinancialProjectionEnrollmentSchema
>;
export type AcademicFinancialProjectionStudent = z.infer<
  typeof academicFinancialProjectionStudentSchema
>;
export type AcademicFinancialProjectionCourse = z.infer<
  typeof academicFinancialProjectionCourseSchema
>;
export type AcademicFinancialProjectionAcademicYear = z.infer<
  typeof academicFinancialProjectionAcademicYearSchema
>;
export type AcademicFinancialProjectionSnapshotQuery = z.infer<
  typeof academicFinancialProjectionSnapshotQuerySchema
>;
export type AcademicFinancialProjectionSnapshotStart = z.infer<
  typeof academicFinancialProjectionSnapshotStartSchema
>;
export type AcademicFinancialProjectionSnapshotPage = z.infer<
  typeof academicFinancialProjectionSnapshotPageSchema
>;
export type AcademicFinancialProjectionSnapshotComplete = z.infer<
  typeof academicFinancialProjectionSnapshotCompleteSchema
>;
export type AcademicFinancialProjectionEvent = z.infer<
  typeof academicFinancialProjectionEventSchema
>;
