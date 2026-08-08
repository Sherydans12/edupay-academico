import { z } from 'zod';

const opaqueIdSchema = z.string().uuid();
const tenantIdSchema = z.string().min(1).max(128);
const labelSchema = z.string().trim().min(1).max(160);
const personNameSchema = z.string().trim().min(1).max(120);
const dateSchema = z.iso.date();
const timestampSchema = z.iso.datetime({ offset: true });

export const academicYearStatusSchema = z.enum([
  'DRAFT',
  'ACTIVE',
  'CLOSED',
  'ARCHIVED',
]);
export const courseStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']);
export const personStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);
export const subjectStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);
export const courseSubjectStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);
export const relationshipStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);

export const cursorQuerySchema = z
  .object({
    cursor: opaqueIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const tenantSchema = z
  .object({
    id: tenantIdSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const academicYearSchema = z
  .object({
    id: opaqueIdSchema,
    label: labelSchema,
    startDate: dateSchema,
    endDate: dateSchema,
    status: academicYearStatusSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const createAcademicYearSchema = z
  .object({
    label: labelSchema,
    startDate: dateSchema,
    endDate: dateSchema,
  })
  .strict()
  .refine((value) => value.startDate <= value.endDate, {
    message: 'startDate must be on or before endDate',
    path: ['endDate'],
  });

export const updateAcademicYearSchema = z
  .object({
    label: labelSchema.optional(),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    status: academicYearStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export const courseSchema = z
  .object({
    id: opaqueIdSchema,
    academicYearId: opaqueIdSchema,
    label: labelSchema,
    status: courseStatusSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const createCourseSchema = z
  .object({
    academicYearId: opaqueIdSchema,
    label: labelSchema,
    status: courseStatusSchema.default('DRAFT'),
  })
  .strict();

export const updateCourseSchema = z
  .object({
    label: labelSchema.optional(),
    status: courseStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

const personFields = {
  id: opaqueIdSchema,
  identityUserId: z.string().min(1).max(128).nullable(),
  source: z.string().min(1).max(80),
  externalReference: z.string().min(1).max(200).nullable(),
  firstName: personNameSchema,
  lastName: personNameSchema,
  email: z.email().max(320).nullable(),
  status: personStatusSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
} as const;

export const studentSchema = z.object(personFields).strict();
export const teacherSchema = z.object(personFields).strict();

const createPersonFields = {
  firstName: personNameSchema,
  lastName: personNameSchema,
  email: z.email().max(320).optional(),
} as const;

export const createStudentSchema = z.object(createPersonFields).strict();
export const createTeacherSchema = z.object(createPersonFields).strict();

const updatePersonFields = {
  firstName: personNameSchema.optional(),
  lastName: personNameSchema.optional(),
  email: z.email().max(320).nullable().optional(),
} as const;

export const updateStudentSchema = z
  .object(updatePersonFields)
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });
export const updateTeacherSchema = z
  .object(updatePersonFields)
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export const personListQuerySchema = cursorQuerySchema.extend({
  search: z.string().trim().min(1).max(160).optional(),
  status: personStatusSchema.optional(),
});

export const verifiedIdentityLinkSchema = z
  .object({
    identityUserId: z.string().min(1).max(128),
  })
  .strict();

export const subjectSchema = z
  .object({
    id: opaqueIdSchema,
    name: labelSchema,
    status: subjectStatusSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const createSubjectSchema = z.object({ name: labelSchema }).strict();
export const updateSubjectSchema = z
  .object({
    name: labelSchema.optional(),
    status: subjectStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export const courseSubjectSchema = z
  .object({
    id: opaqueIdSchema,
    courseId: opaqueIdSchema,
    subjectId: opaqueIdSchema,
    defaultForCourse: z.boolean(),
    sortOrder: z.number().int().min(0),
    status: courseSubjectStatusSchema,
    course: courseSchema.optional(),
    subject: subjectSchema.optional(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const createCourseSubjectSchema = z
  .object({
    courseId: opaqueIdSchema,
    subjectId: opaqueIdSchema,
    defaultForCourse: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(10_000).default(0),
  })
  .strict();

export const updateCourseSubjectSchema = z
  .object({
    defaultForCourse: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(10_000).optional(),
    status: courseSubjectStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export const courseListQuerySchema = cursorQuerySchema.extend({
  academicYearId: opaqueIdSchema.optional(),
  status: courseStatusSchema.optional(),
});
export const subjectListQuerySchema = cursorQuerySchema.extend({
  status: subjectStatusSchema.optional(),
});
export const courseSubjectListQuerySchema = cursorQuerySchema.extend({
  courseId: opaqueIdSchema.optional(),
  subjectId: opaqueIdSchema.optional(),
  status: courseSubjectStatusSchema.optional(),
});

export const courseEnrollmentSchema = z
  .object({
    id: opaqueIdSchema,
    studentId: opaqueIdSchema,
    courseId: opaqueIdSchema,
    status: relationshipStatusSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();
export const createCourseEnrollmentSchema = z
  .object({
    studentId: opaqueIdSchema,
    courseId: opaqueIdSchema,
  })
  .strict();

export const studentSubjectEnrollmentSchema = z
  .object({
    id: opaqueIdSchema,
    studentId: opaqueIdSchema,
    courseSubjectId: opaqueIdSchema,
    status: relationshipStatusSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();
export const createStudentSubjectEnrollmentSchema = z
  .object({
    studentId: opaqueIdSchema,
    courseSubjectId: opaqueIdSchema,
  })
  .strict();

export const courseSubjectTeacherSchema = z
  .object({
    id: opaqueIdSchema,
    teacherId: opaqueIdSchema,
    courseSubjectId: opaqueIdSchema,
    status: relationshipStatusSchema,
    teacher: teacherSchema.optional(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();
export const assignCourseSubjectTeachersSchema = z
  .object({
    courseSubjectId: opaqueIdSchema,
    teacherIds: z.array(opaqueIdSchema).min(1).max(50),
  })
  .strict()
  .refine(
    (value) => new Set(value.teacherIds).size === value.teacherIds.length,
    {
      message: 'teacherIds must not contain duplicates',
      path: ['teacherIds'],
    },
  );

export const courseRosterItemSchema = z
  .object({
    enrollmentId: opaqueIdSchema,
    student: studentSchema,
  })
  .strict();
export const courseSubjectRosterItemSchema = z
  .object({
    access: z.array(z.enum(['COURSE_DEFAULT', 'DIRECT'])).min(1),
    student: studentSchema,
  })
  .strict();

export const academicYearPageSchema = z.object({
  items: z.array(academicYearSchema),
  nextCursor: opaqueIdSchema.nullable(),
});
export const coursePageSchema = z.object({
  items: z.array(courseSchema),
  nextCursor: opaqueIdSchema.nullable(),
});
export const studentPageSchema = z.object({
  items: z.array(studentSchema),
  nextCursor: opaqueIdSchema.nullable(),
});
export const teacherPageSchema = z.object({
  items: z.array(teacherSchema),
  nextCursor: opaqueIdSchema.nullable(),
});
export const subjectPageSchema = z.object({
  items: z.array(subjectSchema),
  nextCursor: opaqueIdSchema.nullable(),
});
export const courseSubjectPageSchema = z.object({
  items: z.array(courseSubjectSchema),
  nextCursor: opaqueIdSchema.nullable(),
});

export type CursorQuery = z.infer<typeof cursorQuerySchema>;
export type PersonListQuery = z.infer<typeof personListQuerySchema>;
export type CourseListQuery = z.infer<typeof courseListQuerySchema>;
export type SubjectListQuery = z.infer<typeof subjectListQuerySchema>;
export type CourseSubjectListQuery = z.infer<
  typeof courseSubjectListQuerySchema
>;
export type CreateAcademicYear = z.infer<typeof createAcademicYearSchema>;
export type UpdateAcademicYear = z.infer<typeof updateAcademicYearSchema>;
export type CreateCourse = z.infer<typeof createCourseSchema>;
export type UpdateCourse = z.infer<typeof updateCourseSchema>;
export type CreateStudent = z.infer<typeof createStudentSchema>;
export type UpdateStudent = z.infer<typeof updateStudentSchema>;
export type CreateTeacher = z.infer<typeof createTeacherSchema>;
export type UpdateTeacher = z.infer<typeof updateTeacherSchema>;
export type VerifiedIdentityLink = z.infer<typeof verifiedIdentityLinkSchema>;
export type CreateSubject = z.infer<typeof createSubjectSchema>;
export type UpdateSubject = z.infer<typeof updateSubjectSchema>;
export type CreateCourseSubject = z.infer<typeof createCourseSubjectSchema>;
export type UpdateCourseSubject = z.infer<typeof updateCourseSubjectSchema>;
export type CreateCourseEnrollment = z.infer<
  typeof createCourseEnrollmentSchema
>;
export type CreateStudentSubjectEnrollment = z.infer<
  typeof createStudentSubjectEnrollmentSchema
>;
export type AssignCourseSubjectTeachers = z.infer<
  typeof assignCourseSubjectTeachersSchema
>;
