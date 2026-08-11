import type {
  AcademicYear,
  Course,
  CourseEnrollment,
  CourseSubject,
  CourseSubjectTeacher,
  Student,
  StudentSubjectEnrollment,
  Subject,
  Teacher,
} from '../generated/prisma/client';

const timestamp = (value: Date): string => value.toISOString();
const date = (value: Date): string => value.toISOString().slice(0, 10);

export const mapAcademicYear = (record: AcademicYear): object => ({
  id: record.id,
  label: record.label,
  startDate: date(record.startDate),
  endDate: date(record.endDate),
  status: record.status,
  createdAt: timestamp(record.createdAt),
  updatedAt: timestamp(record.updatedAt),
});

export const mapCourse = (record: Course): object => ({
  id: record.id,
  academicYearId: record.academicYearId,
  source: record.source,
  externalReference: record.externalReference,
  label: record.label,
  status: record.status,
  createdAt: timestamp(record.createdAt),
  updatedAt: timestamp(record.updatedAt),
});

export const mapStudent = (record: Student): object => ({
  id: record.id,
  identityUserId: record.identityUserId,
  source: record.source,
  externalReference: record.externalReference,
  firstName: record.firstName,
  lastName: record.lastName,
  email: record.email,
  status: record.status,
  createdAt: timestamp(record.createdAt),
  updatedAt: timestamp(record.updatedAt),
});

export const mapTeacher = (record: Teacher): object => ({
  id: record.id,
  identityUserId: record.identityUserId,
  source: record.source,
  externalReference: record.externalReference,
  firstName: record.firstName,
  lastName: record.lastName,
  email: record.email,
  status: record.status,
  createdAt: timestamp(record.createdAt),
  updatedAt: timestamp(record.updatedAt),
});

export const mapSubject = (record: Subject): object => ({
  id: record.id,
  name: record.name,
  status: record.status,
  createdAt: timestamp(record.createdAt),
  updatedAt: timestamp(record.updatedAt),
});

type CourseSubjectWithRelations = CourseSubject & {
  course?: Course;
  subject?: Subject;
};

export const mapCourseSubject = (
  record: CourseSubjectWithRelations,
): object => ({
  id: record.id,
  courseId: record.courseId,
  subjectId: record.subjectId,
  defaultForCourse: record.defaultForCourse,
  sortOrder: record.sortOrder,
  status: record.status,
  ...(record.course ? { course: mapCourse(record.course) } : {}),
  ...(record.subject ? { subject: mapSubject(record.subject) } : {}),
  createdAt: timestamp(record.createdAt),
  updatedAt: timestamp(record.updatedAt),
});

export const mapCourseEnrollment = (record: CourseEnrollment): object => ({
  id: record.id,
  studentId: record.studentId,
  courseId: record.courseId,
  source: record.source,
  externalReference: record.externalReference,
  status: record.status,
  createdAt: timestamp(record.createdAt),
  updatedAt: timestamp(record.updatedAt),
});

export const mapStudentSubjectEnrollment = (
  record: StudentSubjectEnrollment,
): object => ({
  id: record.id,
  studentId: record.studentId,
  courseSubjectId: record.courseSubjectId,
  status: record.status,
  createdAt: timestamp(record.createdAt),
  updatedAt: timestamp(record.updatedAt),
});

type AssignmentWithTeacher = CourseSubjectTeacher & { teacher?: Teacher };

export const mapCourseSubjectTeacher = (
  record: AssignmentWithTeacher,
): object => ({
  id: record.id,
  teacherId: record.teacherId,
  courseSubjectId: record.courseSubjectId,
  status: record.status,
  ...(record.teacher ? { teacher: mapTeacher(record.teacher) } : {}),
  createdAt: timestamp(record.createdAt),
  updatedAt: timestamp(record.updatedAt),
});
