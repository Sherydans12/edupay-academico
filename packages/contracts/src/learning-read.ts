import { z } from 'zod';

import {
  learningBodyDocumentSchema,
  learningItemPublicationStatusSchema,
  learningItemTypeSchema,
  learningUnitStatusSchema,
} from './learning.js';

const opaqueIdSchema = z.string().uuid();
const labelSchema = z.string().trim().min(1).max(160);
const textSchema = z.string().trim().max(20_000);
const timestampSchema = z.iso.datetime({ offset: true });

export const learningReadAudienceSchema = z.enum([
  'STUDENT',
  'TEACHER_AUTHORING',
  'TEACHER_PREVIEW',
]);

export const learningReadErrorCodeSchema = z.enum([
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_FAILED',
]);

export const courseSubjectReadBaseSchema = z
  .object({
    id: opaqueIdSchema,
    courseId: opaqueIdSchema,
    subjectId: opaqueIdSchema,
  })
  .strict();

export const studentLearningItemReadSchema = z
  .object({
    id: opaqueIdSchema,
    learningUnitId: opaqueIdSchema,
    type: learningItemTypeSchema,
    title: labelSchema,
    description: textSchema.nullable(),
    content: textSchema.nullable(),
    instructions: textSchema.nullable(),
    body: textSchema.nullable(),
    bodyDocument: learningBodyDocumentSchema.nullable().optional(),
    sortOrder: z.number().int().min(0),
    dueAt: timestampSchema.nullable(),
  })
  .strict();

export const studentLearningUnitReadSchema = z
  .object({
    id: opaqueIdSchema,
    title: labelSchema,
    description: textSchema.nullable(),
    sortOrder: z.number().int().min(0),
    startAt: timestampSchema.nullable(),
    endAt: timestampSchema.nullable(),
    items: z.array(studentLearningItemReadSchema),
  })
  .strict();

export const studentCourseSubjectLearningRouteSchema = z
  .object({
    courseSubject: courseSubjectReadBaseSchema,
    units: z.array(studentLearningUnitReadSchema),
  })
  .strict();

export const teacherWorkingDraftReadSchema = z
  .object({
    present: z.literal(true),
    basedOnVersion: z.number().int().min(1),
    updatedAt: timestampSchema,
  })
  .strict();

export const teacherLearningItemReadSchema = studentLearningItemReadSchema
  .extend({
    courseSubjectId: opaqueIdSchema,
    publicationStatus: learningItemPublicationStatusSchema,
    publishAt: timestampSchema.nullable(),
    publishedAt: timestampSchema.nullable(),
    version: z.number().int().min(1),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    workingDraft: teacherWorkingDraftReadSchema.nullable(),
  })
  .strict();

export const teacherLearningUnitReadSchema = z
  .object({
    id: opaqueIdSchema,
    courseSubjectId: opaqueIdSchema,
    title: labelSchema,
    description: textSchema.nullable(),
    sortOrder: z.number().int().min(0),
    startAt: timestampSchema.nullable(),
    endAt: timestampSchema.nullable(),
    status: learningUnitStatusSchema,
    version: z.number().int().min(1),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    learnerVisibleNow: z.boolean(),
    items: z.array(teacherLearningItemReadSchema),
  })
  .strict();

export const teacherCourseSubjectLearningRouteSchema = z
  .object({
    courseSubject: courseSubjectReadBaseSchema
      .extend({
        status: z.enum(['ACTIVE', 'ARCHIVED']),
      })
      .strict(),
    units: z.array(teacherLearningUnitReadSchema),
  })
  .strict();

/** Teacher preview is deliberately the exact learner projection. */
export const teacherLearnerPreviewRouteSchema =
  studentCourseSubjectLearningRouteSchema;

/** Preview accepts no client-selected learner, tenant, or clock. */
export const teacherLearnerPreviewQuerySchema = z.object({}).strict();

export type LearningReadAudience = z.infer<typeof learningReadAudienceSchema>;
export type LearningReadErrorCode = z.infer<typeof learningReadErrorCodeSchema>;
export type CourseSubjectReadBase = z.infer<typeof courseSubjectReadBaseSchema>;
export type StudentLearningItemRead = z.infer<
  typeof studentLearningItemReadSchema
>;
export type StudentLearningUnitRead = z.infer<
  typeof studentLearningUnitReadSchema
>;
export type StudentCourseSubjectLearningRoute = z.infer<
  typeof studentCourseSubjectLearningRouteSchema
>;
export type TeacherWorkingDraftRead = z.infer<
  typeof teacherWorkingDraftReadSchema
>;
export type TeacherLearningItemRead = z.infer<
  typeof teacherLearningItemReadSchema
>;
export type TeacherLearningUnitRead = z.infer<
  typeof teacherLearningUnitReadSchema
>;
export type TeacherCourseSubjectLearningRoute = z.infer<
  typeof teacherCourseSubjectLearningRouteSchema
>;
export type TeacherLearnerPreviewRoute = StudentCourseSubjectLearningRoute;
export type TeacherLearnerPreviewQuery = z.infer<
  typeof teacherLearnerPreviewQuerySchema
>;
