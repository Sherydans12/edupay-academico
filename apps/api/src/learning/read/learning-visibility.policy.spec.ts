import { describe, expect, it } from 'vitest';

import {
  canAccessTeacherAuthoring,
  canViewStudentItem,
  effectivePublished,
  enrollmentEligible,
  unitAvailableNow,
} from './learning-visibility.policy';
import type {
  LearningReadCourseSubjectRow,
  LearningReadItemRow,
  LearningReadUnitRow,
  StudentReadEligibility,
} from './learning-read.types';

const now = new Date('2026-08-24T12:00:00.000Z');
const tenantId = 'tenant-a';

const courseSubject: LearningReadCourseSubjectRow = {
  id: '10000000-0000-4000-8000-000000000003',
  tenantId,
  courseId: '10000000-0000-4000-8000-000000000001',
  subjectId: '10000000-0000-4000-8000-000000000002',
  status: 'ACTIVE',
  course: { status: 'ACTIVE', academicYear: { status: 'ACTIVE' } },
};

const unit: LearningReadUnitRow = {
  id: '10000000-0000-4000-8000-000000000004',
  tenantId,
  courseSubjectId: courseSubject.id,
  title: 'Unidad',
  description: null,
  sortOrder: 0,
  startAt: null,
  endAt: null,
  status: 'ACTIVE',
  version: 1,
  createdAt: now,
  updatedAt: now,
  items: [],
};

const item: LearningReadItemRow = {
  id: '10000000-0000-4000-8000-000000000005',
  tenantId,
  courseSubjectId: courseSubject.id,
  learningUnitId: unit.id,
  type: 'MATERIAL',
  title: 'Publicado',
  description: null,
  content: 'live',
  instructions: null,
  body: null,
  sortOrder: 0,
  publicationStatus: 'PUBLISHED',
  publishAt: null,
  publishedAt: now,
  dueAt: new Date('2026-08-20T12:00:00.000Z'),
  version: 1,
  createdAt: now,
  updatedAt: now,
};

const visibility = (
  overrides: Partial<{
    trustedTenantId: string;
    courseSubject: LearningReadCourseSubjectRow;
    unit: LearningReadUnitRow;
    item: LearningReadItemRow;
    enrollmentAllowed: boolean;
  }> = {},
) =>
  canViewStudentItem({
    trustedTenantId: tenantId,
    courseSubject,
    unit,
    item,
    now,
    enrollmentAllowed: true,
    ...overrides,
  });

describe('learning visibility policy', () => {
  it('V-01/V-02/V-05/V-08 rejects inactive parent and item lifecycle states', () => {
    expect(visibility({ unit: { ...unit, status: 'DRAFT' } })).toBe(false);
    expect(visibility({ unit: { ...unit, status: 'ARCHIVED' } })).toBe(false);
    expect(visibility({ item: { ...item, publicationStatus: 'DRAFT' } })).toBe(
      false,
    );
    expect(
      visibility({ item: { ...item, publicationStatus: 'ARCHIVED' } }),
    ).toBe(false);
    expect(
      visibility({
        courseSubject: { ...courseSubject, status: 'ARCHIVED' },
      }),
    ).toBe(false);
  });

  it('S-07..S-09 rejects inactive AcademicYear, Course, and CourseSubject', () => {
    expect(
      visibility({
        courseSubject: {
          ...courseSubject,
          course: { status: 'ACTIVE', academicYear: { status: 'CLOSED' } },
        },
      }),
    ).toBe(false);
    expect(
      visibility({
        courseSubject: {
          ...courseSubject,
          course: { ...courseSubject.course, status: 'ARCHIVED' },
        },
      }),
    ).toBe(false);
    expect(
      visibility({ courseSubject: { ...courseSubject, status: 'ARCHIVED' } }),
    ).toBe(false);
  });

  it('V-03/V-04/P-01..P-03/P-07 applies scheduled publication at read time', () => {
    expect(
      visibility({
        item: {
          ...item,
          publicationStatus: 'SCHEDULED',
          publishAt: new Date(now.getTime() + 1),
        },
      }),
    ).toBe(false);
    expect(
      visibility({
        item: { ...item, publicationStatus: 'SCHEDULED', publishAt: now },
      }),
    ).toBe(true);
    expect(effectivePublished(item, now)).toBe(true);
    expect(
      effectivePublished(
        { publicationStatus: 'DRAFT', publishAt: new Date(now.getTime() - 1) },
        now,
      ),
    ).toBe(false);
  });

  it('V-06/V-07 keeps live visibility independent of a draft and past due date', () => {
    expect(
      visibility({
        item: {
          ...item,
          draft: { basedOnVersion: 1, updatedAt: now },
          dueAt: new Date(now.getTime() - 10_000),
        },
      }),
    ).toBe(true);
  });

  it('W-01..W-06 applies inclusive nullable unit windows', () => {
    expect(unitAvailableNow(unit, now)).toBe(true);
    expect(
      unitAvailableNow(
        {
          ...unit,
          startAt: new Date(now.getTime() - 1),
          endAt: new Date(now.getTime() + 1),
        },
        now,
      ),
    ).toBe(true);
    expect(
      unitAvailableNow({ ...unit, startAt: new Date(now.getTime() + 1) }, now),
    ).toBe(false);
    expect(
      unitAvailableNow({ ...unit, endAt: new Date(now.getTime() - 1) }, now),
    ).toBe(false);
    expect(unitAvailableNow({ ...unit, startAt: now }, now)).toBe(true);
    expect(unitAvailableNow({ ...unit, endAt: now }, now)).toBe(true);
  });

  it('S-01..S-06 validates active student and either exact enrollment', () => {
    const eligibility: StudentReadEligibility = {
      student: { tenantId, status: 'ACTIVE' },
      courseEnrollment: {
        tenantId,
        courseId: courseSubject.courseId,
        status: 'ACTIVE',
      },
      subjectEnrollment: null,
    };
    expect(enrollmentEligible(tenantId, courseSubject, eligibility)).toBe(true);
    expect(
      enrollmentEligible(tenantId, courseSubject, {
        ...eligibility,
        courseEnrollment: null,
        subjectEnrollment: {
          tenantId,
          courseSubjectId: courseSubject.id,
          status: 'ACTIVE',
        },
      }),
    ).toBe(true);
    expect(
      enrollmentEligible(tenantId, courseSubject, {
        ...eligibility,
        student: { tenantId, status: 'INACTIVE' },
      }),
    ).toBe(false);
    expect(
      enrollmentEligible(tenantId, courseSubject, {
        ...eligibility,
        courseEnrollment: {
          ...eligibility.courseEnrollment!,
          status: 'INACTIVE',
        },
      }),
    ).toBe(false);
    expect(
      enrollmentEligible(tenantId, courseSubject, {
        ...eligibility,
        courseEnrollment: null,
        subjectEnrollment: {
          tenantId,
          courseSubjectId: '20000000-0000-4000-8000-000000000003',
          status: 'ACTIVE',
        },
      }),
    ).toBe(false);
  });

  it('T-02/T-08 rejects every cross-tenant row even when IDs collide', () => {
    expect(visibility({ trustedTenantId: 'tenant-b' })).toBe(false);
    expect(visibility({ unit: { ...unit, tenantId: 'tenant-b' } })).toBe(false);
    expect(visibility({ item: { ...item, tenantId: 'tenant-b' } })).toBe(false);
  });

  it('A-01..A-04 authorizes active assignment, tenant admin, or audited support only', () => {
    expect(
      canAccessTeacherAuthoring({
        trustedTenantId: tenantId,
        resourceTenantId: tenantId,
        roles: ['TEACHER'],
        elevatedSupportContext: false,
        teacherStatus: 'ACTIVE',
        assignmentStatus: 'ACTIVE',
      }),
    ).toBe(true);
    expect(
      canAccessTeacherAuthoring({
        trustedTenantId: tenantId,
        resourceTenantId: tenantId,
        roles: ['TEACHER'],
        elevatedSupportContext: false,
        teacherStatus: 'ACTIVE',
        assignmentStatus: 'INACTIVE',
      }),
    ).toBe(false);
    expect(
      canAccessTeacherAuthoring({
        trustedTenantId: tenantId,
        resourceTenantId: tenantId,
        roles: ['TENANT_ADMIN'],
        elevatedSupportContext: false,
      }),
    ).toBe(true);
    expect(
      canAccessTeacherAuthoring({
        trustedTenantId: tenantId,
        resourceTenantId: tenantId,
        roles: ['SYSTEM_ADMIN'],
        elevatedSupportContext: false,
      }),
    ).toBe(false);
    expect(
      canAccessTeacherAuthoring({
        trustedTenantId: tenantId,
        resourceTenantId: tenantId,
        roles: ['SYSTEM_ADMIN'],
        elevatedSupportContext: true,
      }),
    ).toBe(true);
  });
});
