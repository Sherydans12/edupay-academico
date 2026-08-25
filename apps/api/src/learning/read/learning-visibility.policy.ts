import type { IdentityRole } from '../../identity/identity.types';
import type {
  LearningReadCourseSubjectRow,
  LearningReadItemRow,
  LearningReadUnitRow,
  StudentReadEligibility,
} from './learning-read.types';

export function effectivePublished(
  item: Pick<LearningReadItemRow, 'publicationStatus' | 'publishAt'>,
  now: Date,
): boolean {
  return (
    item.publicationStatus === 'PUBLISHED' ||
    (item.publicationStatus === 'SCHEDULED' &&
      item.publishAt !== null &&
      item.publishAt <= now)
  );
}

export function enrollmentEligible(
  trustedTenantId: string,
  courseSubject: Pick<
    LearningReadCourseSubjectRow,
    'tenantId' | 'courseId' | 'id'
  >,
  eligibility: StudentReadEligibility,
): boolean {
  if (
    eligibility.student.tenantId !== trustedTenantId ||
    eligibility.student.status !== 'ACTIVE' ||
    courseSubject.tenantId !== trustedTenantId
  ) {
    return false;
  }

  const courseEnrollment = eligibility.courseEnrollment;
  const subjectEnrollment = eligibility.subjectEnrollment;
  return Boolean(
    (courseEnrollment?.tenantId === trustedTenantId &&
      courseEnrollment.courseId === courseSubject.courseId &&
      courseEnrollment.status === 'ACTIVE') ||
    (subjectEnrollment?.tenantId === trustedTenantId &&
      subjectEnrollment.courseSubjectId === courseSubject.id &&
      subjectEnrollment.status === 'ACTIVE'),
  );
}

export function unitAvailableNow(
  unit: Pick<LearningReadUnitRow, 'status' | 'startAt' | 'endAt'>,
  now: Date,
): boolean {
  return (
    unit.status === 'ACTIVE' &&
    (unit.startAt === null || unit.startAt <= now) &&
    (unit.endAt === null || now <= unit.endAt)
  );
}

export interface StudentItemVisibilityInput {
  readonly trustedTenantId: string;
  readonly courseSubject: LearningReadCourseSubjectRow;
  readonly unit: LearningReadUnitRow;
  readonly item: LearningReadItemRow;
  readonly now: Date;
  readonly enrollmentAllowed: boolean;
}

export function canViewStudentItem(input: StudentItemVisibilityInput): boolean {
  const { courseSubject, enrollmentAllowed, item, now, trustedTenantId, unit } =
    input;
  return (
    enrollmentAllowed &&
    courseSubject.tenantId === trustedTenantId &&
    unit.tenantId === trustedTenantId &&
    item.tenantId === trustedTenantId &&
    unit.courseSubjectId === courseSubject.id &&
    item.courseSubjectId === courseSubject.id &&
    item.learningUnitId === unit.id &&
    courseSubject.course.academicYear.status === 'ACTIVE' &&
    courseSubject.course.status === 'ACTIVE' &&
    courseSubject.status === 'ACTIVE' &&
    unitAvailableNow(unit, now) &&
    item.publicationStatus !== 'ARCHIVED' &&
    effectivePublished(item, now)
  );
}

export interface TeacherAuthoringAccessInput {
  readonly trustedTenantId: string;
  readonly resourceTenantId: string;
  readonly roles: readonly IdentityRole[];
  readonly elevatedSupportContext: boolean;
  readonly teacherStatus?: string | undefined;
  readonly assignmentStatus?: string | undefined;
}

export function canAccessTeacherAuthoring(
  input: TeacherAuthoringAccessInput,
): boolean {
  if (input.trustedTenantId !== input.resourceTenantId) return false;
  if (input.roles.includes('SYSTEM_ADMIN') && input.elevatedSupportContext) {
    return true;
  }
  if (input.roles.includes('TENANT_ADMIN')) return true;
  return (
    input.roles.includes('TEACHER') &&
    input.teacherStatus === 'ACTIVE' &&
    input.assignmentStatus === 'ACTIVE'
  );
}
