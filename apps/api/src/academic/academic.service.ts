import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  canonicalStudentNationalId,
  courseEnrollmentPromotionRosterLimit,
  courseRolloverDraftResponseSchema,
  promoteCourseEnrollmentsSchema,
  STUDENT_NATIONAL_ID_EXISTS,
} from '@edupay/contracts';
import type {
  AdmitStudent,
  StudentAdmissionResult,
  StudentNationalIdLookup,
  StudentNationalIdLookupResult,
} from '@edupay/contracts';
import type {
  AcademicPreparationStatus,
  AcademicYearOverview,
  CopyAcademicYearCourses,
  CopyAcademicYearCoursesResult,
  AssignCourseSubjectTeachers,
  CourseListQuery,
  CourseSubjectListQuery,
  CreateAcademicYear,
  CreateCourse,
  CreateCourseEnrollment,
  CreateCourseSubject,
  CreateStudent,
  CreateStudentSubjectEnrollment,
  CreateSubject,
  CreateTeacher,
  CourseRosterItem,
  CourseEnrollmentPromotionResult,
  CourseRosterPage,
  CourseRosterSummary,
  CursorQuery,
  InconsistentCourseEnrollmentPage,
  InconsistentCourseEnrollmentReason,
  PersonListQuery,
  PromoteCourseEnrollments,
  SaveCourseRolloverDraft,
  StudentListQuery,
  SubjectListQuery,
  UpdateAcademicYear,
  UpdateCourse,
  UpdateCourseSubject,
  UpdateStudent,
  UpdateSubject,
  UpdateTeacher,
} from '@edupay/contracts';

import { AuthorizationService } from '../authorization/authorization.service';
import { requireAcademicYearMutable } from './academic-year.policy';
import { TenantCapability } from '../authorization/authorization.types';
import type {
  AcademicYearStatus,
  CourseStatus,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../persistence/prisma.service';
import { TenantQueryScope } from '../persistence/tenant-query-scope';
import {
  ACADEMIC_AUDIT_PORT,
  type AcademicAuditPort,
} from './academic-audit.port';
import type { AcademicRequestContext } from './academic-context';
import {
  mapAcademicYear,
  mapCourse,
  mapCourseEnrollment,
  mapCourseSubject,
  mapCourseSubjectTeacher,
  mapStudent,
  mapStudentSubjectEnrollment,
  mapSubject,
  mapTeacher,
} from './academic.mapper';
import {
  ACADEMIC_IDENTITY_LINK_VERIFIER,
  type AcademicIdentityLinkVerifier,
} from './identity-link.port';
import { EDUPAY_SOURCE, MANUAL_SOURCE } from '../sync/sync.constants';
import { FinancialProjectionConfigService } from '../financial-projection/financial-projection-config.service';
import {
  FinancialProjectionOutboxService,
  financialProjectionEnrollmentInclude,
} from '../financial-projection/financial-projection-outbox.service';
import { CommandIdempotencyService } from '../idempotency/command-idempotency.service';
import {
  evaluateAcademicPreparation,
  type AcademicPreparationCourseCounts,
} from './academic-preparation';

const academicYearTransitions: Readonly<
  Record<AcademicYearStatus, readonly AcademicYearStatus[]>
> = {
  DRAFT: ['DRAFT', 'ACTIVE', 'ARCHIVED'],
  ACTIVE: ['ACTIVE', 'CLOSED'],
  CLOSED: ['CLOSED', 'ARCHIVED'],
  ARCHIVED: ['ARCHIVED'],
};

const courseTransitions: Readonly<
  Record<CourseStatus, readonly CourseStatus[]>
> = {
  DRAFT: ['DRAFT', 'ACTIVE', 'ARCHIVED'],
  ACTIVE: ['ACTIVE', 'ARCHIVED'],
  ARCHIVED: ['ARCHIVED'],
};

type CourseRosterFingerprintRow = {
  id: string;
  source: string;
  student: { source: string };
};

function isSourceManagedEnrollment(enrollment: {
  source: string;
  student: { source: string };
}): boolean {
  return (
    enrollment.source !== MANUAL_SOURCE ||
    enrollment.student.source === EDUPAY_SOURCE
  );
}

function courseRosterFingerprint(
  courseId: string,
  enrollments: readonly CourseRosterFingerprintRow[],
): string {
  const rows = enrollments.map((enrollment) =>
    [enrollment.id, enrollment.source, enrollment.student.source].join(':'),
  );
  return createHash('sha256')
    .update(JSON.stringify({ courseId, rows }))
    .digest('hex');
}

@Injectable()
export class AcademicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    @Inject(ACADEMIC_AUDIT_PORT)
    private readonly audit: AcademicAuditPort,
    @Inject(ACADEMIC_IDENTITY_LINK_VERIFIER)
    private readonly identityLinks: AcademicIdentityLinkVerifier,
    private readonly financialProjectionConfig: FinancialProjectionConfigService,
    private readonly financialProjectionOutbox: FinancialProjectionOutboxService,
    private readonly commandIdempotency: CommandIdempotencyService,
  ) {}

  async currentTenant(context: AcademicRequestContext): Promise<object> {
    const scope = this.adminScope(context);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: scope.tenantId },
    });
    if (!tenant) this.notFound();
    return {
      id: tenant.id,
      createdAt: tenant.createdAt.toISOString(),
      updatedAt: tenant.updatedAt.toISOString(),
    };
  }

  async academicPreparationStatus(
    context: AcademicRequestContext,
  ): Promise<AcademicPreparationStatus> {
    const scope = this.adminScope(context);
    const years = await this.prisma.academicYear.findMany({
      where: { tenantId: scope.tenantId },
      select: { id: true, status: true },
    });
    const activeYears = years.filter((year) => year.status === 'ACTIVE');
    let courses: AcademicPreparationCourseCounts | null = null;

    if (activeYears.length === 1 && activeYears[0]) {
      const academicYearId = activeYears[0].id;
      const [active, draft] = await Promise.all([
        this.prisma.course.count({
          where: {
            tenantId: scope.tenantId,
            academicYearId,
            status: 'ACTIVE',
          },
        }),
        this.prisma.course.count({
          where: {
            tenantId: scope.tenantId,
            academicYearId,
            status: 'DRAFT',
          },
        }),
      ]);
      courses = { active, draft };
    }

    return evaluateAcademicPreparation({
      evaluatedAt: new Date().toISOString(),
      years,
      courses,
    });
  }

  async createAcademicYear(
    context: AcademicRequestContext,
    input: CreateAcademicYear,
  ): Promise<object> {
    const scope = this.adminScope(context);
    this.requireDateRange(input.startDate, input.endDate);
    await this.ensureTenant(scope);
    const record = await this.write(() =>
      this.prisma.academicYear.create({
        data: {
          tenantId: scope.tenantId,
          label: input.label,
          startDate: this.date(input.startDate),
          endDate: this.date(input.endDate),
        },
      }),
    );
    await this.recordAudit(
      context,
      'ACADEMIC_YEAR_CREATED',
      'AcademicYear',
      record.id,
    );
    return mapAcademicYear(record);
  }

  async listAcademicYears(
    context: AcademicRequestContext,
    query: CursorQuery,
  ): Promise<object> {
    const scope = this.adminScope(context);
    if (query.cursor) {
      await this.requireCursor(
        this.prisma.academicYear.findFirst({
          where: { tenantId: scope.tenantId, paginationToken: query.cursor },
          select: { id: true },
        }),
      );
    }
    const records = await this.prisma.academicYear.findMany({
      where: { tenantId: scope.tenantId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...(query.cursor
        ? { cursor: { paginationToken: query.cursor }, skip: 1 }
        : {}),
      take: query.limit + 1,
    });
    return this.page(records, query.limit, mapAcademicYear);
  }

  async getAcademicYear(
    context: AcademicRequestContext,
    id: string,
  ): Promise<object> {
    const scope = this.adminScope(context);
    return mapAcademicYear(await this.academicYear(scope, id));
  }

  async academicYearOverview(
    context: AcademicRequestContext,
    id: string,
  ): Promise<AcademicYearOverview> {
    const scope = this.adminScope(context);
    await this.academicYear(scope, id);
    const [courseGroups, activeEnrollments, sourceManagedActiveEnrollments] =
      await Promise.all([
        this.prisma.course.groupBy({
          by: ['status'],
          where: { tenantId: scope.tenantId, academicYearId: id },
          _count: { _all: true },
        }),
        this.prisma.courseEnrollment.count({
          where: {
            tenantId: scope.tenantId,
            status: 'ACTIVE',
            student: { status: 'ACTIVE' },
            course: { academicYearId: id },
          },
        }),
        this.prisma.courseEnrollment.count({
          where: {
            tenantId: scope.tenantId,
            status: 'ACTIVE',
            student: { status: 'ACTIVE' },
            course: { academicYearId: id },
            OR: [
              { source: { not: MANUAL_SOURCE } },
              { student: { source: EDUPAY_SOURCE } },
            ],
          },
        }),
      ]);
    const countFor = (status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED') =>
      courseGroups.find((group) => group.status === status)?._count._all ?? 0;
    return {
      academicYearId: id,
      courses: {
        draft: countFor('DRAFT'),
        active: countFor('ACTIVE'),
        archived: countFor('ARCHIVED'),
      },
      activeEnrollments,
      sourceManagedActiveEnrollments,
    };
  }

  /**
   * Creates in the target year, as DRAFT manual courses, the labels of the
   * source year's non-archived courses that the target does not have yet.
   * Matching is by trimmed, case-insensitive label; repeating it creates
   * nothing new.
   */
  async copyAcademicYearCourses(
    context: AcademicRequestContext,
    targetId: string,
    input: CopyAcademicYearCourses,
  ): Promise<CopyAcademicYearCoursesResult> {
    const scope = this.adminScope(context);
    if (input.sourceAcademicYearId === targetId) {
      throw new BadRequestException(
        'The source and target academic years must be different.',
      );
    }
    const target = await this.academicYear(scope, targetId);
    this.requireYearMutable(target.status);
    await this.academicYear(scope, input.sourceAcademicYearId);
    const [sourceCourses, targetCourses] = await Promise.all([
      this.prisma.course.findMany({
        where: {
          tenantId: scope.tenantId,
          academicYearId: input.sourceAcademicYearId,
          status: { not: 'ARCHIVED' },
        },
        select: { label: true },
        orderBy: { label: 'asc' },
      }),
      this.prisma.course.findMany({
        where: { tenantId: scope.tenantId, academicYearId: targetId },
        select: { label: true },
      }),
    ]);
    const key = (label: string) => label.trim().toLocaleLowerCase('es-CL');
    const present = new Set(targetCourses.map((course) => key(course.label)));
    const toCreate: string[] = [];
    const alreadyPresent: string[] = [];
    const seen = new Set<string>();
    for (const { label } of sourceCourses) {
      const normalized = key(label);
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      if (present.has(normalized)) alreadyPresent.push(label.trim());
      else toCreate.push(label.trim());
    }
    const dryRun = input.dryRun ?? false;
    let createdCount = 0;
    if (!dryRun && toCreate.length > 0) {
      const created = await this.write(() =>
        this.prisma.course.createMany({
          data: toCreate.map((label) => ({
            tenantId: scope.tenantId,
            academicYearId: targetId,
            source: MANUAL_SOURCE,
            label,
            status: 'DRAFT' as const,
          })),
          skipDuplicates: true,
        }),
      );
      createdCount = created.count;
      await this.recordAudit(
        context,
        'ACADEMIC_YEAR_COURSES_COPIED',
        'AcademicYear',
        targetId,
      );
    }
    return {
      sourceAcademicYearId: input.sourceAcademicYearId,
      targetAcademicYearId: targetId,
      dryRun,
      toCreate,
      alreadyPresent,
      createdCount,
    };
  }

  async updateAcademicYear(
    context: AcademicRequestContext,
    id: string,
    input: UpdateAcademicYear,
  ): Promise<object> {
    const scope = this.adminScope(context);
    const current = await this.academicYear(scope, id);
    const nextStatus = input.status ?? current.status;
    if (!academicYearTransitions[current.status].includes(nextStatus)) {
      throw new ConflictException(
        'The academic year lifecycle transition is not allowed.',
      );
    }
    const changesConfiguration =
      input.label !== undefined ||
      input.startDate !== undefined ||
      input.endDate !== undefined;
    if (changesConfiguration && current.status !== 'DRAFT') {
      throw new ConflictException(
        'Only a draft academic year can change its configuration.',
      );
    }
    if (current.status === 'ARCHIVED' && Object.keys(input).length > 0) {
      throw new ConflictException('An archived academic year is read-only.');
    }
    const startDate =
      input.startDate ?? current.startDate.toISOString().slice(0, 10);
    const endDate = input.endDate ?? current.endDate.toISOString().slice(0, 10);
    this.requireDateRange(startDate, endDate);
    // Label, dates and lifecycle status of the year travel in the projection.
    const reproject =
      this.financialProjectionConfig.enabled() && Object.keys(input).length > 0;
    const record = await this.write(() =>
      this.prisma.$transaction(async (tx) => {
        const updated = await tx.academicYear.update({
          where: { tenantId_id: { tenantId: scope.tenantId, id } },
          data: {
            ...(input.label !== undefined ? { label: input.label } : {}),
            ...(input.startDate !== undefined
              ? { startDate: this.date(input.startDate) }
              : {}),
            ...(input.endDate !== undefined
              ? { endDate: this.date(input.endDate) }
              : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
          },
        });
        if (reproject) {
          await this.financialProjectionOutbox.reprojectEnrollments(
            tx,
            {
              tenantId: scope.tenantId,
              status: 'ACTIVE',
              course: { academicYearId: id },
            },
            context.requestId,
          );
        }
        return updated;
      }),
    );
    await this.recordAudit(
      context,
      'ACADEMIC_YEAR_UPDATED',
      'AcademicYear',
      id,
    );
    return mapAcademicYear(record);
  }

  async createCourse(
    context: AcademicRequestContext,
    input: CreateCourse,
  ): Promise<object> {
    const scope = this.adminScope(context);
    await this.ensureTenant(scope);
    const year = await this.academicYear(scope, input.academicYearId);
    this.requireYearMutable(year.status);
    if (input.status === 'ACTIVE' && year.status !== 'ACTIVE') {
      throw new ConflictException(
        'A course can be activated only in an active academic year.',
      );
    }
    const record = await this.write(() =>
      this.prisma.course.create({
        data: {
          tenantId: scope.tenantId,
          academicYearId: input.academicYearId,
          source: MANUAL_SOURCE,
          label: input.label,
          status: input.status,
        },
      }),
    );
    await this.recordAudit(context, 'COURSE_CREATED', 'Course', record.id);
    return mapCourse(record);
  }

  async listCourses(
    context: AcademicRequestContext,
    query: CourseListQuery,
  ): Promise<object> {
    const scope = this.adminScope(context);
    if (query.cursor) {
      await this.requireCursor(
        this.prisma.course.findFirst({
          where: { tenantId: scope.tenantId, paginationToken: query.cursor },
          select: { id: true },
        }),
      );
    }
    const records = await this.prisma.course.findMany({
      where: {
        tenantId: scope.tenantId,
        ...(query.academicYearId
          ? { academicYearId: query.academicYearId }
          : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...(query.cursor
        ? { cursor: { paginationToken: query.cursor }, skip: 1 }
        : {}),
      take: query.limit + 1,
    });
    return this.page(records, query.limit, mapCourse);
  }

  async getCourse(
    context: AcademicRequestContext,
    id: string,
  ): Promise<object> {
    const scope = this.adminScope(context);
    return mapCourse(await this.course(scope, id));
  }

  async updateCourse(
    context: AcademicRequestContext,
    id: string,
    input: UpdateCourse,
  ): Promise<object> {
    const scope = this.adminScope(context);
    const current = await this.courseWithYear(scope, id);
    if (current.source === EDUPAY_SOURCE) {
      this.sourceManagedConflict();
    }
    if (current.status === 'ARCHIVED') {
      throw new ConflictException('An archived course is read-only.');
    }
    this.requireYearMutable(current.academicYear.status);
    const nextStatus = input.status ?? current.status;
    if (!courseTransitions[current.status].includes(nextStatus)) {
      throw new ConflictException(
        'The course lifecycle transition is not allowed.',
      );
    }
    if (nextStatus === 'ACTIVE' && current.academicYear.status !== 'ACTIVE') {
      throw new ConflictException(
        'A course can be activated only in an active academic year.',
      );
    }
    // The course label travels in the financial projection.
    const reproject =
      this.financialProjectionConfig.enabled() &&
      input.label !== undefined &&
      input.label !== current.label;
    const record = await this.write(() =>
      this.prisma.$transaction(async (tx) => {
        const updated = await tx.course.update({
          where: { tenantId_id: { tenantId: scope.tenantId, id } },
          data: {
            ...(input.label !== undefined ? { label: input.label } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
          },
        });
        if (reproject) {
          await this.financialProjectionOutbox.reprojectEnrollments(
            tx,
            { tenantId: scope.tenantId, courseId: id, status: 'ACTIVE' },
            context.requestId,
          );
        }
        return updated;
      }),
    );
    await this.recordAudit(context, 'COURSE_UPDATED', 'Course', id);
    return mapCourse(record);
  }

  async createStudent(
    context: AcademicRequestContext,
    input: CreateStudent,
  ): Promise<object> {
    const scope = this.adminScope(context);
    await this.ensureTenant(scope);
    const record = await this.write(() =>
      this.prisma.student.create({
        data: {
          tenantId: scope.tenantId,
          source: MANUAL_SOURCE,
          firstName: input.firstName,
          lastName: input.lastName,
          ...(input.email !== undefined ? { email: input.email } : {}),
        },
      }),
    );
    await this.recordAudit(context, 'STUDENT_CREATED', 'Student', record.id);
    return mapStudent(record);
  }

  async listStudents(
    context: AcademicRequestContext,
    query: StudentListQuery,
  ): Promise<object> {
    const scope = this.adminScope(context);
    if (query.academicYearId) {
      await this.academicYear(scope, query.academicYearId);
    }
    if (query.cursor) {
      await this.requireCursor(
        this.prisma.student.findFirst({
          where: { tenantId: scope.tenantId, paginationToken: query.cursor },
          select: { id: true },
        }),
      );
    }
    const where: Prisma.StudentWhereInput = {
      tenantId: scope.tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              {
                externalReference: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };
    const [records, totalCount] = await Promise.all([
      this.prisma.student.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        ...(query.cursor
          ? { cursor: { paginationToken: query.cursor }, skip: 1 }
          : {}),
        take: query.limit + 1,
      }),
      this.prisma.student.count({ where }),
    ]);
    const page = this.page(records, query.limit, mapStudent);
    if (!query.academicYearId) return { ...page, totalCount };
    const visible = records.slice(0, query.limit);
    const studentIds = visible.map((record) => record.id);
    const enrollments = await this.prisma.courseEnrollment.findMany({
      where: {
        tenantId: scope.tenantId,
        studentId: { in: studentIds },
        status: 'ACTIVE',
        course: { academicYearId: query.academicYearId },
      },
      select: {
        id: true,
        studentId: true,
        course: { select: { id: true, label: true } },
      },
      orderBy: [{ course: { label: 'asc' } }, { id: 'asc' }],
    });
    const byStudent = new Map<string, (typeof enrollments)[number]>();
    for (const enrollment of enrollments) {
      if (!byStudent.has(enrollment.studentId)) {
        byStudent.set(enrollment.studentId, enrollment);
      }
    }
    return {
      ...page,
      items: page.items.map((item, index) => {
        const enrollment = byStudent.get(visible[index]!.id);
        return {
          ...(item as Record<string, unknown>),
          yearEnrollment: enrollment
            ? {
                enrollmentId: enrollment.id,
                courseId: enrollment.course.id,
                courseLabel: enrollment.course.label,
              }
            : null,
        };
      }),
      totalCount,
    };
  }

  async getStudent(
    context: AcademicRequestContext,
    id: string,
  ): Promise<object> {
    const scope = this.adminScope(context);
    return mapStudent(await this.student(scope, id));
  }

  async updateStudent(
    context: AcademicRequestContext,
    id: string,
    input: UpdateStudent,
  ): Promise<object> {
    const scope = this.adminScope(context);
    const current = await this.student(scope, id);
    if (
      current.source === EDUPAY_SOURCE &&
      (input.firstName !== undefined || input.lastName !== undefined)
    ) {
      this.sourceManagedConflict();
    }
    // Names travel in the financial projection; email does not.
    const reproject =
      this.financialProjectionConfig.enabled() &&
      (input.firstName !== undefined || input.lastName !== undefined);
    const record = await this.write(() =>
      this.prisma.$transaction(async (tx) => {
        const updated = await tx.student.update({
          where: { tenantId_id: { tenantId: scope.tenantId, id } },
          data: {
            ...(input.firstName !== undefined
              ? { firstName: input.firstName }
              : {}),
            ...(input.lastName !== undefined
              ? { lastName: input.lastName }
              : {}),
            ...(input.email !== undefined ? { email: input.email } : {}),
          },
        });
        if (reproject) {
          await this.financialProjectionOutbox.reprojectEnrollments(
            tx,
            { tenantId: scope.tenantId, studentId: id, status: 'ACTIVE' },
            context.requestId,
          );
        }
        return updated;
      }),
    );
    await this.recordAudit(context, 'STUDENT_UPDATED', 'Student', id);
    return mapStudent(record);
  }

  async setStudentStatus(
    context: AcademicRequestContext,
    id: string,
    status: 'ACTIVE' | 'INACTIVE',
  ): Promise<object> {
    const scope = this.adminScope(context);
    const current = await this.student(scope, id);
    if (current.source === EDUPAY_SOURCE) this.sourceManagedConflict();
    const record = await this.prisma.student.update({
      where: { tenantId_id: { tenantId: scope.tenantId, id } },
      data: { status },
    });
    await this.recordAudit(context, `STUDENT_${status}`, 'Student', id);
    return mapStudent(record);
  }

  async linkStudentIdentity(
    context: AcademicRequestContext,
    id: string,
    identityUserId: string,
  ): Promise<object> {
    const scope = this.adminScope(context);
    await this.student(scope, id);
    await this.identityLinks.verifyExactLink({
      academicRecordId: id,
      academicRecordType: 'STUDENT',
      context,
      identityUserId,
    });
    const record = await this.write(() =>
      this.prisma.student.update({
        where: { tenantId_id: { tenantId: scope.tenantId, id } },
        data: { identityUserId },
      }),
    );
    await this.recordAudit(context, 'STUDENT_IDENTITY_LINKED', 'Student', id);
    return mapStudent(record);
  }

  async createTeacher(
    context: AcademicRequestContext,
    input: CreateTeacher,
  ): Promise<object> {
    const scope = this.adminScope(context);
    await this.ensureTenant(scope);
    const record = await this.write(() =>
      this.prisma.teacher.create({
        data: {
          tenantId: scope.tenantId,
          source: MANUAL_SOURCE,
          firstName: input.firstName,
          lastName: input.lastName,
          ...(input.email !== undefined ? { email: input.email } : {}),
        },
      }),
    );
    await this.recordAudit(context, 'TEACHER_CREATED', 'Teacher', record.id);
    return mapTeacher(record);
  }

  async listTeachers(
    context: AcademicRequestContext,
    query: PersonListQuery,
  ): Promise<object> {
    const scope = this.adminScope(context);
    if (query.cursor) {
      await this.requireCursor(
        this.prisma.teacher.findFirst({
          where: { tenantId: scope.tenantId, paginationToken: query.cursor },
          select: { id: true },
        }),
      );
    }
    const where: Prisma.TeacherWhereInput = {
      tenantId: scope.tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              {
                externalReference: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };
    const [records, totalCount] = await Promise.all([
      this.prisma.teacher.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        ...(query.cursor
          ? { cursor: { paginationToken: query.cursor }, skip: 1 }
          : {}),
        take: query.limit + 1,
      }),
      this.prisma.teacher.count({ where }),
    ]);
    return {
      ...this.page(records, query.limit, mapTeacher),
      totalCount,
    };
  }

  async getTeacher(
    context: AcademicRequestContext,
    id: string,
  ): Promise<object> {
    const scope = this.adminScope(context);
    return mapTeacher(await this.teacher(scope, id));
  }

  async updateTeacher(
    context: AcademicRequestContext,
    id: string,
    input: UpdateTeacher,
  ): Promise<object> {
    const scope = this.adminScope(context);
    await this.teacher(scope, id);
    const record = await this.write(() =>
      this.prisma.teacher.update({
        where: { tenantId_id: { tenantId: scope.tenantId, id } },
        data: {
          ...(input.firstName !== undefined
            ? { firstName: input.firstName }
            : {}),
          ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
        },
      }),
    );
    await this.recordAudit(context, 'TEACHER_UPDATED', 'Teacher', id);
    return mapTeacher(record);
  }

  async setTeacherStatus(
    context: AcademicRequestContext,
    id: string,
    status: 'ACTIVE' | 'INACTIVE',
  ): Promise<object> {
    const scope = this.adminScope(context);
    await this.teacher(scope, id);
    const record = await this.prisma.teacher.update({
      where: { tenantId_id: { tenantId: scope.tenantId, id } },
      data: { status },
    });
    await this.recordAudit(context, `TEACHER_${status}`, 'Teacher', id);
    return mapTeacher(record);
  }

  async linkTeacherIdentity(
    context: AcademicRequestContext,
    id: string,
    identityUserId: string,
  ): Promise<object> {
    const scope = this.adminScope(context);
    await this.teacher(scope, id);
    await this.identityLinks.verifyExactLink({
      academicRecordId: id,
      academicRecordType: 'TEACHER',
      context,
      identityUserId,
    });
    const record = await this.write(() =>
      this.prisma.teacher.update({
        where: { tenantId_id: { tenantId: scope.tenantId, id } },
        data: { identityUserId },
      }),
    );
    await this.recordAudit(context, 'TEACHER_IDENTITY_LINKED', 'Teacher', id);
    return mapTeacher(record);
  }

  async createSubject(
    context: AcademicRequestContext,
    input: CreateSubject,
  ): Promise<object> {
    const scope = this.adminScope(context);
    await this.ensureTenant(scope);
    const record = await this.write(() =>
      this.prisma.subject.create({
        data: { tenantId: scope.tenantId, name: input.name },
      }),
    );
    await this.recordAudit(context, 'SUBJECT_CREATED', 'Subject', record.id);
    return mapSubject(record);
  }

  async listSubjects(
    context: AcademicRequestContext,
    query: SubjectListQuery,
  ): Promise<object> {
    const scope = this.adminScope(context);
    if (query.cursor) {
      await this.requireCursor(
        this.prisma.subject.findFirst({
          where: { tenantId: scope.tenantId, paginationToken: query.cursor },
          select: { id: true },
        }),
      );
    }
    const records = await this.prisma.subject.findMany({
      where: {
        tenantId: scope.tenantId,
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...(query.cursor
        ? { cursor: { paginationToken: query.cursor }, skip: 1 }
        : {}),
      take: query.limit + 1,
    });
    return this.page(records, query.limit, mapSubject);
  }

  async updateSubject(
    context: AcademicRequestContext,
    id: string,
    input: UpdateSubject,
  ): Promise<object> {
    const scope = this.adminScope(context);
    const current = await this.subject(scope, id);
    if (current.status === 'ARCHIVED') {
      throw new ConflictException('An archived subject is read-only.');
    }
    const record = await this.write(() =>
      this.prisma.subject.update({
        where: { tenantId_id: { tenantId: scope.tenantId, id } },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
      }),
    );
    await this.recordAudit(context, 'SUBJECT_UPDATED', 'Subject', id);
    return mapSubject(record);
  }

  async getSubject(
    context: AcademicRequestContext,
    id: string,
  ): Promise<object> {
    const scope = this.adminScope(context);
    return mapSubject(await this.subject(scope, id));
  }

  async createCourseSubject(
    context: AcademicRequestContext,
    input: CreateCourseSubject,
  ): Promise<object> {
    const scope = this.adminScope(context);
    const course = await this.courseWithYear(scope, input.courseId);
    this.requireStructuralMutation(course.status, course.academicYear.status);
    const subject = await this.subject(scope, input.subjectId);
    if (subject.status !== 'ACTIVE') {
      throw new ConflictException(
        'An archived subject cannot be assigned to a course.',
      );
    }
    const record = await this.write(() =>
      this.prisma.courseSubject.create({
        data: {
          tenantId: scope.tenantId,
          courseId: input.courseId,
          subjectId: input.subjectId,
          defaultForCourse: input.defaultForCourse,
          sortOrder: input.sortOrder,
        },
        include: { course: true, subject: true },
      }),
    );
    await this.recordAudit(
      context,
      'COURSE_SUBJECT_CREATED',
      'CourseSubject',
      record.id,
      record.id,
    );
    return mapCourseSubject(record);
  }

  async listCourseSubjects(
    context: AcademicRequestContext,
    query: CourseSubjectListQuery,
  ): Promise<object> {
    const scope = this.adminScope(context);
    if (query.cursor) {
      await this.requireCursor(
        this.prisma.courseSubject.findFirst({
          where: { tenantId: scope.tenantId, paginationToken: query.cursor },
          select: { id: true },
        }),
      );
    }
    const records = await this.prisma.courseSubject.findMany({
      where: {
        tenantId: scope.tenantId,
        ...(query.courseId ? { courseId: query.courseId } : {}),
        ...(query.subjectId ? { subjectId: query.subjectId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: { course: true, subject: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...(query.cursor
        ? { cursor: { paginationToken: query.cursor }, skip: 1 }
        : {}),
      take: query.limit + 1,
    });
    return this.page(records, query.limit, mapCourseSubject);
  }

  async updateCourseSubject(
    context: AcademicRequestContext,
    id: string,
    input: UpdateCourseSubject,
  ): Promise<object> {
    const scope = this.adminScope(context);
    const current = await this.courseSubjectWithContext(scope, id);
    if (current.status === 'ARCHIVED') {
      throw new ConflictException('An archived CourseSubject is read-only.');
    }
    this.requireStructuralMutation(
      current.course.status,
      current.course.academicYear.status,
    );
    const record = await this.write(() =>
      this.prisma.courseSubject.update({
        where: { tenantId_id: { tenantId: scope.tenantId, id } },
        data: {
          ...(input.defaultForCourse !== undefined
            ? { defaultForCourse: input.defaultForCourse }
            : {}),
          ...(input.sortOrder !== undefined
            ? { sortOrder: input.sortOrder }
            : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
        include: { course: true, subject: true },
      }),
    );
    await this.recordAudit(
      context,
      'COURSE_SUBJECT_UPDATED',
      'CourseSubject',
      id,
      id,
    );
    return mapCourseSubject(record);
  }

  async enrollStudentInCourse(
    context: AcademicRequestContext,
    input: CreateCourseEnrollment,
  ): Promise<object> {
    const scope = this.adminScope(context);
    const student = await this.student(scope, input.studentId);
    if (student.status !== 'ACTIVE') {
      throw new ConflictException('An inactive student cannot be enrolled.');
    }
    const course = await this.courseWithYear(scope, input.courseId);
    this.requireStructuralMutation(course.status, course.academicYear.status);
    const sourceEnrollment = await this.prisma.courseEnrollment.findFirst({
      where: {
        tenantId: scope.tenantId,
        studentId: student.id,
        source: EDUPAY_SOURCE,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    if (sourceEnrollment) this.sourceManagedEnrollmentConflict();
    const record = await this.write(() =>
      this.prisma.$transaction(async (tx) => {
        const enrollment = await tx.courseEnrollment.create({
          data: { tenantId: scope.tenantId, source: MANUAL_SOURCE, ...input },
          include: financialProjectionEnrollmentInclude,
        });
        if (this.financialProjectionConfig.enabled()) {
          await this.financialProjectionOutbox.enqueueEnrollment(
            tx,
            enrollment,
            context.requestId,
          );
        }
        return enrollment;
      }),
    );
    await this.recordAudit(
      context,
      'COURSE_ENROLLMENT_CREATED',
      'CourseEnrollment',
      record.id,
    );
    return mapCourseEnrollment(record);
  }

  /**
   * ADR-0024 manual admission: creates the student record with its RUN/IPE
   * and a MANUAL enrollment in one idempotent command. An identifier that
   * already belongs to a record in the tenant is a conflict; records are
   * never matched by name, course or email.
   */
  async admitStudent(
    context: AcademicRequestContext,
    input: AdmitStudent,
  ): Promise<StudentAdmissionResult> {
    const scope = this.adminScope(context);
    const idempotencyKey = context.idempotencyKey?.trim();
    if (!idempotencyKey) {
      throw new BadRequestException(
        'An Idempotency-Key is required to admit a student.',
      );
    }
    const nationalId = this.requireNationalId(input);
    const course = await this.courseWithYear(scope, input.courseId);
    this.requireStructuralMutation(course.status, course.academicYear.status);
    await this.ensureTenant(scope);

    const payload = {
      nationalIdType: input.nationalIdType,
      nationalId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email ?? null,
      courseId: input.courseId,
    };

    let admission: StudentAdmissionResult;
    let shouldRecordAudit = true;
    try {
      const execution =
        await this.commandIdempotency.execute<StudentAdmissionResult>({
          tenantId: scope.tenantId,
          actorIdentityUserId: context.principal.identityUserId,
          commandName: 'ADMIT_STUDENT',
          idempotencyKey,
          payload,
          returnReplayMetadata: true,
          action: async (tx) => {
            const existing = await tx.student.findUnique({
              where: {
                tenantId_nationalIdType_nationalId: {
                  tenantId: scope.tenantId,
                  nationalIdType: input.nationalIdType,
                  nationalId,
                },
              },
              select: { id: true },
            });
            if (existing) this.nationalIdConflict();

            const student = await tx.student.create({
              data: {
                tenantId: scope.tenantId,
                source: MANUAL_SOURCE,
                nationalIdType: input.nationalIdType,
                nationalId,
                firstName: input.firstName,
                lastName: input.lastName,
                ...(input.email !== undefined ? { email: input.email } : {}),
              },
            });
            const enrollment = await tx.courseEnrollment.create({
              data: {
                tenantId: scope.tenantId,
                source: MANUAL_SOURCE,
                studentId: student.id,
                courseId: input.courseId,
              },
              include: financialProjectionEnrollmentInclude,
            });
            if (this.financialProjectionConfig.enabled()) {
              await this.financialProjectionOutbox.enqueueEnrollment(
                tx,
                enrollment,
                context.requestId,
              );
            }
            return {
              data: {
                student: mapStudent(
                  student,
                ) as StudentAdmissionResult['student'],
                enrollment: mapCourseEnrollment(
                  enrollment,
                ) as StudentAdmissionResult['enrollment'],
                nationalIdType: input.nationalIdType,
              },
            };
          },
        });
      admission = execution.data;
      shouldRecordAudit = execution.replayed !== true;
    } catch (error) {
      if (this.prismaErrorCode(error) === 'P2002') this.nationalIdConflict();
      throw error;
    }

    if (shouldRecordAudit) {
      // Audit records ids only; the RUN/IPE and names are never logged.
      await this.recordAudit(
        context,
        'STUDENT_ADMITTED',
        'Student',
        admission.student.id,
      );
      await this.recordAudit(
        context,
        'COURSE_ENROLLMENT_CREATED',
        'CourseEnrollment',
        admission.enrollment.id,
      );
    }
    return admission;
  }

  /** Finds the record that owns an identifier, sent in the body (never a URL). */
  async lookupStudentByNationalId(
    context: AcademicRequestContext,
    input: StudentNationalIdLookup,
  ): Promise<StudentNationalIdLookupResult> {
    const scope = this.adminScope(context);
    const nationalId = this.requireNationalId(input);
    const record = await this.prisma.student.findUnique({
      where: {
        tenantId_nationalIdType_nationalId: {
          tenantId: scope.tenantId,
          nationalIdType: input.nationalIdType,
          nationalId,
        },
      },
    });
    return {
      student: record
        ? (mapStudent(record) as StudentNationalIdLookupResult['student'])
        : null,
    };
  }

  private requireNationalId(input: {
    nationalIdType: AdmitStudent['nationalIdType'];
    nationalId: string;
  }): string {
    const nationalId = canonicalStudentNationalId(
      input.nationalIdType,
      input.nationalId,
    );
    if (nationalId === null) {
      throw new BadRequestException('The student identifier is not valid.');
    }
    return nationalId;
  }

  private nationalIdConflict(): never {
    throw new ConflictException({
      code: STUDENT_NATIONAL_ID_EXISTS,
      message:
        'A student record with this identifier already exists in this tenant.',
    });
  }

  async getCourseRolloverDraft(
    context: AcademicRequestContext,
    sourceCourseId: string,
    targetAcademicYearId: string,
  ) {
    const scope = this.adminScope(context);
    await Promise.all([
      this.course(scope, sourceCourseId),
      this.academicYear(scope, targetAcademicYearId),
    ]);
    const draft = await this.prisma.courseRolloverDraft.findUnique({
      where: {
        tenantId_sourceCourseId_targetAcademicYearId: {
          tenantId: scope.tenantId,
          sourceCourseId,
          targetAcademicYearId,
        },
      },
    });
    return this.mapRolloverDraft(draft);
  }

  async saveCourseRolloverDraft(
    context: AcademicRequestContext,
    sourceCourseId: string,
    targetAcademicYearId: string,
    { expectedRevision, plan }: SaveCourseRolloverDraft,
  ) {
    const { tenantId } = this.adminScope(context);
    if (
      sourceCourseId !== plan.sourceCourseId ||
      targetAcademicYearId !== plan.targetAcademicYearId ||
      plan.draftRevision !== undefined
    ) {
      throw new BadRequestException(
        'The draft must match the selected course and year.',
      );
    }
    const draftKey = { tenantId, sourceCourseId, targetAcademicYearId };
    const where = { tenantId_sourceCourseId_targetAcademicYearId: draftKey };
    try {
      const draft = await this.prisma.$transaction(
        async (tx) => {
          await this.validateRolloverPlan(tx, tenantId, plan);
          const current = await tx.courseRolloverDraft.findUnique({ where });
          if ((current?.revision ?? 0) !== expectedRevision) {
            this.rolloverDraftChanged();
          }
          return current
            ? tx.courseRolloverDraft.update({
                where: { ...where, revision: expectedRevision },
                data: { plan, revision: { increment: 1 } },
              })
            : tx.courseRolloverDraft.create({ data: { ...draftKey, plan } });
        },
        { isolationLevel: 'Serializable' },
      );
      await this.recordAudit(
        context,
        'COURSE_ROLLOVER_DRAFT_SAVED',
        'Course',
        sourceCourseId,
      );
      return this.mapRolloverDraft(draft);
    } catch (error) {
      if (
        ['P2002', 'P2025', 'P2034'].includes(this.prismaErrorCode(error) ?? '')
      ) {
        this.rolloverDraftChanged();
      }
      throw error;
    }
  }

  private mapRolloverDraft(
    draft: {
      revision: number;
      preparedRevision: number | null;
      updatedAt: Date;
      plan: Prisma.JsonValue;
    } | null,
  ) {
    return courseRolloverDraftResponseSchema.parse({
      draft: draft
        ? {
            revision: draft.revision,
            preparedRevision: draft.preparedRevision,
            plan: draft.plan,
            updatedAt: draft.updatedAt.toISOString(),
          }
        : null,
    });
  }

  private rolloverDraftChanged(): never {
    throw new ConflictException({
      code: 'COURSE_ROLLOVER_DRAFT_CHANGED',
      message: 'The draft changed. Reload the saved draft before continuing.',
    });
  }

  private async validateRolloverPlan(
    tx: Prisma.TransactionClient,
    tenantId: string,
    input: PromoteCourseEnrollments,
  ) {
    const sourceCourse = await tx.course.findFirst({
      where: { tenantId: tenantId, id: input.sourceCourseId },
      include: { academicYear: true },
    });
    if (!sourceCourse) this.notFound();
    if (
      sourceCourse.status !== 'ACTIVE' ||
      sourceCourse.academicYear.status !== 'ACTIVE'
    ) {
      throw new ConflictException(
        'The source course must be active in an active academic year.',
      );
    }

    const targetYear = await tx.academicYear.findFirst({
      where: {
        tenantId: tenantId,
        id: input.targetAcademicYearId,
      },
    });
    if (!targetYear) this.notFound();
    if (
      !['DRAFT', 'ACTIVE'].includes(targetYear.status) ||
      targetYear.startDate <= sourceCourse.academicYear.endDate
    ) {
      throw new ConflictException(
        'The target academic year must be mutable and begin after the source year ends.',
      );
    }

    const targetIds = [
      ...new Set([
        input.defaultTargetCourseId,
        ...input.overrides.flatMap((override) =>
          override.targetCourseId ? [override.targetCourseId] : [],
        ),
      ]),
    ];
    const targets = await tx.course.findMany({
      where: {
        tenantId: tenantId,
        id: { in: targetIds },
      },
      include: { academicYear: true },
    });
    if (targets.length !== targetIds.length) this.notFound();
    for (const target of targets) {
      if (
        target.academicYearId !== input.targetAcademicYearId ||
        target.status === 'ARCHIVED' ||
        (targetYear.status === 'DRAFT' && target.status !== 'DRAFT')
      ) {
        throw new ConflictException(
          'Every destination must be a mutable course in the selected academic year.',
        );
      }
    }

    const sourceRoster = await tx.courseEnrollment.findMany({
      where: {
        tenantId: tenantId,
        courseId: input.sourceCourseId,
        status: 'ACTIVE',
        student: { status: 'ACTIVE' },
      },
      select: {
        id: true,
        studentId: true,
        source: true,
        student: { select: { source: true } },
      },
      orderBy: { id: 'asc' },
      take: courseEnrollmentPromotionRosterLimit + 1,
    });
    if (sourceRoster.length > courseEnrollmentPromotionRosterLimit) {
      throw new ConflictException({
        code: 'COURSE_ROSTER_LIMIT_EXCEEDED',
        message: `A course advancement supports up to ${courseEnrollmentPromotionRosterLimit} active enrollments per operation.`,
      });
    }
    if (
      courseRosterFingerprint(input.sourceCourseId, sourceRoster) !==
      input.expectedRosterFingerprint
    ) {
      throw new ConflictException({
        code: 'COURSE_ROSTER_CHANGED',
        message:
          'The source roster changed after preview. Refresh it before confirming the advancement.',
      });
    }

    const sourceRosterById = new Map(
      sourceRoster.map((enrollment) => [enrollment.id, enrollment]),
    );
    const overrideByEnrollmentId = new Map(
      input.overrides.map((override) => [
        override.sourceEnrollmentId,
        override,
      ]),
    );
    const obsoleteOverrides = input.overrides.filter(
      ({ sourceEnrollmentId }) => !sourceRosterById.has(sourceEnrollmentId),
    );
    if (obsoleteOverrides.length) {
      throw new ConflictException({
        code: 'COURSE_ROLLOVER_OVERRIDES_OBSOLETE',
        message:
          'Some saved decisions belong to students outside the current roster.',
        details: obsoleteOverrides.map(({ sourceEnrollmentId }) => ({
          field: `overrides.${sourceEnrollmentId}`,
          message: 'The enrollment is no longer in the active roster.',
        })),
      });
    }
    for (const enrollment of sourceRoster) {
      if (
        overrideByEnrollmentId.has(enrollment.id) &&
        isSourceManagedEnrollment(enrollment)
      ) {
        this.sourceManagedEnrollmentConflict();
      }
    }

    return { sourceRoster, overrideByEnrollmentId };
  }

  async promoteCourseEnrollments(
    context: AcademicRequestContext,
    input: PromoteCourseEnrollments,
    prepareOnly = false,
  ): Promise<CourseEnrollmentPromotionResult> {
    const scope = this.adminScope(context);
    const idempotencyKey = context.idempotencyKey?.trim();
    if (!idempotencyKey) {
      throw new BadRequestException(
        'An Idempotency-Key is required to confirm a course advancement.',
      );
    }
    if (prepareOnly && !input.draftRevision) {
      throw new BadRequestException(
        'Save the draft before preparing next-year enrollments.',
      );
    }

    let promotion: CourseEnrollmentPromotionResult;
    let shouldRecordPromotionAudit = true;
    try {
      const execution =
        await this.commandIdempotency.execute<CourseEnrollmentPromotionResult>({
          tenantId: scope.tenantId,
          actorIdentityUserId: context.principal.identityUserId,
          commandName: prepareOnly
            ? 'PREPARE_COURSE_ENROLLMENTS'
            : 'PROMOTE_COURSE_ENROLLMENTS',
          idempotencyKey,
          payload: input,
          isolationLevel: 'Serializable',
          transactionTimeoutMs: 30_000,
          returnReplayMetadata: true,
          action: async (tx) => {
            const { sourceRoster, overrideByEnrollmentId } =
              await this.validateRolloverPlan(tx, scope.tenantId, input);
            const whereDraft = {
              tenantId_sourceCourseId_targetAcademicYearId: {
                tenantId: scope.tenantId,
                sourceCourseId: input.sourceCourseId,
                targetAcademicYearId: input.targetAcademicYearId,
              },
            };
            if (input.draftRevision) {
              const draft = await tx.courseRolloverDraft.findUnique({
                where: whereDraft,
              });
              if (
                draft?.revision !== input.draftRevision ||
                JSON.stringify(
                  promoteCourseEnrollmentsSchema.parse({
                    ...promoteCourseEnrollmentsSchema.parse(draft.plan),
                    draftRevision: draft.revision,
                  }),
                ) !==
                  JSON.stringify(promoteCourseEnrollmentsSchema.parse(input))
              ) {
                this.rolloverDraftChanged();
              }
            }
            const targetIds = [
              input.defaultTargetCourseId,
              ...input.overrides.flatMap(({ targetCourseId }) =>
                targetCourseId ? [targetCourseId] : [],
              ),
            ];
            const activeDestinationEnrollments =
              await tx.courseEnrollment.findMany({
                where: {
                  tenantId: scope.tenantId,
                  studentId: {
                    in: sourceRoster.map((enrollment) => enrollment.studentId),
                  },
                  ...(input.draftRevision
                    ? { course: { academicYearId: input.targetAcademicYearId } }
                    : { courseId: { in: targetIds } }),
                  status: 'ACTIVE',
                },
                select: { studentId: true, courseId: true },
              });
            const existingByStudent = new Map<string, string[]>();
            for (const enrollment of activeDestinationEnrollments) {
              const courseIds =
                existingByStudent.get(enrollment.studentId) ?? [];
              courseIds.push(enrollment.courseId);
              existingByStudent.set(enrollment.studentId, courseIds);
            }
            const movable = sourceRoster.flatMap((enrollment) => {
              if (isSourceManagedEnrollment(enrollment)) return [];
              const override = overrideByEnrollmentId.get(enrollment.id);
              const targetCourseId = override
                ? override.targetCourseId
                : input.defaultTargetCourseId;
              const existing =
                existingByStudent.get(enrollment.studentId) ?? [];
              if (
                input.draftRevision &&
                existing.length &&
                (existing.length > 1 || existing[0] !== targetCourseId)
              ) {
                throw new ConflictException({
                  code: 'COURSE_ROLLOVER_DESTINATION_CONFLICT',
                  message:
                    'A student already has an incompatible enrollment in the destination year.',
                  details: { sourceEnrollmentId: enrollment.id },
                });
              }
              if (!targetCourseId) return [];
              if (!input.draftRevision && existing.includes(targetCourseId)) {
                throw new ConflictException(
                  'A student is already enrolled in the selected destination course. Review the roster before continuing.',
                );
              }
              return [
                {
                  enrollment,
                  targetCourseId,
                  alreadyEnrolled: existing.includes(targetCourseId),
                },
              ];
            });

            if (!movable.length) {
              throw new BadRequestException(
                'Assign at least one student to a destination course before confirming.',
              );
            }

            const completedAt = new Date();
            const movableIds = movable.map(({ enrollment }) => enrollment.id);
            const deactivated = prepareOnly
              ? null
              : await tx.courseEnrollment.updateMany({
                  where: {
                    tenantId: scope.tenantId,
                    courseId: input.sourceCourseId,
                    id: { in: movableIds },
                    source: MANUAL_SOURCE,
                    status: 'ACTIVE',
                    student: { source: { not: EDUPAY_SOURCE } },
                  },
                  data: {
                    status: 'INACTIVE',
                    financialProjectionVersion: { increment: 1 },
                    financialProjectionEffectiveTo: completedAt,
                  },
                });
            if (deactivated && deactivated.count !== movable.length) {
              throw new ConflictException({
                code: 'COURSE_ROSTER_CHANGED',
                message:
                  'One or more enrollments changed after preview. Refresh the roster and try again.',
              });
            }

            const previousEnrollments = prepareOnly
              ? []
              : await tx.courseEnrollment.findMany({
                  where: {
                    tenantId: scope.tenantId,
                    id: { in: movableIds },
                    status: 'INACTIVE',
                  },
                  include: financialProjectionEnrollmentInclude,
                });
            let promotedCount = 0;
            let repeatedCount = 0;
            let transferredCount = 0;
            let deferredCount = 0;
            let sourceManagedCount = 0;

            for (const enrollment of sourceRoster) {
              if (isSourceManagedEnrollment(enrollment)) {
                sourceManagedCount += 1;
                continue;
              }
              const override = overrideByEnrollmentId.get(enrollment.id);
              if (!override) {
                promotedCount += 1;
                continue;
              }
              if (override.decision === 'REPEAT') repeatedCount += 1;
              if (override.decision === 'TRANSFER') transferredCount += 1;
              if (
                override.decision === 'DEFER' ||
                override.decision === 'NO_CONTINUE'
              )
                deferredCount += 1;
            }

            const newEnrollments = movable.filter(
              ({ alreadyEnrolled }) => !alreadyEnrolled,
            );
            const newEnrollmentIds = newEnrollments.map(() => randomUUID());
            let createdCount = 0;
            const batchSize = 500;
            for (
              let offset = 0;
              offset < newEnrollments.length;
              offset += batchSize
            ) {
              const batch = newEnrollments.slice(offset, offset + batchSize);
              const created = await tx.courseEnrollment.createMany({
                data: batch.map(({ enrollment, targetCourseId }, index) => ({
                  id: newEnrollmentIds[offset + index]!,
                  tenantId: scope.tenantId,
                  studentId: enrollment.studentId,
                  courseId: targetCourseId,
                  source: MANUAL_SOURCE,
                })),
              });
              createdCount += created.count;
            }
            if (createdCount !== newEnrollments.length) {
              throw new ConflictException({
                code: 'COURSE_ROSTER_CHANGED',
                message:
                  'One or more enrollments changed after preview. Refresh the roster and try again.',
              });
            }
            if (this.financialProjectionConfig.enabled()) {
              const nextEnrollments = await tx.courseEnrollment.findMany({
                where: {
                  tenantId: scope.tenantId,
                  id: { in: newEnrollmentIds },
                },
                include: financialProjectionEnrollmentInclude,
              });
              if (
                previousEnrollments.length !==
                  (prepareOnly ? 0 : movable.length) ||
                nextEnrollments.length !== newEnrollments.length
              ) {
                throw new ConflictException({
                  code: 'COURSE_ROSTER_CHANGED',
                  message:
                    'One or more enrollments changed after preview. Refresh the roster and try again.',
                });
              }
              await this.financialProjectionOutbox.enqueueEnrollments(
                tx,
                [...previousEnrollments, ...nextEnrollments],
                context.requestId,
              );
            }
            if (prepareOnly && input.draftRevision) {
              await tx.courseRolloverDraft.update({
                where: whereDraft,
                data: { preparedRevision: input.draftRevision },
              });
            }

            return {
              data: {
                sourceCourseId: input.sourceCourseId,
                targetAcademicYearId: input.targetAcademicYearId,
                defaultTargetCourseId: input.defaultTargetCourseId,
                sourceRosterCount: sourceRoster.length,
                promotedCount,
                repeatedCount,
                transferredCount,
                deferredCount,
                sourceManagedCount,
                completedAt: completedAt.toISOString(),
              },
            };
          },
        });
      promotion = execution.data;
      shouldRecordPromotionAudit = execution.replayed !== true;
    } catch (error) {
      if (['P2002', 'P2034'].includes(this.prismaErrorCode(error) ?? '')) {
        throw new ConflictException({
          code: 'COURSE_ROSTER_CHANGED',
          message:
            'The source roster changed while confirming. Refresh the preview before trying again.',
        });
      }
      throw error;
    }

    if (shouldRecordPromotionAudit)
      await this.audit.record({
        action: prepareOnly
          ? 'COURSE_ENROLLMENTS_PREPARED'
          : 'COURSE_ENROLLMENT_PROMOTION_COMPLETED',
        context,
        resourceId: promotion.sourceCourseId,
        resourceType: 'Course',
        summary: {
          targetAcademicYearId: promotion.targetAcademicYearId,
          defaultTargetCourseId: promotion.defaultTargetCourseId,
          promotedCount: promotion.promotedCount,
          repeatedCount: promotion.repeatedCount,
          transferredCount: promotion.transferredCount,
          deferredCount: promotion.deferredCount,
          sourceManagedCount: promotion.sourceManagedCount,
        },
      });
    return promotion;
  }

  async deactivateCourseEnrollment(
    context: AcademicRequestContext,
    id: string,
  ): Promise<object> {
    const scope = this.adminScope(context);
    const current = await this.prisma.courseEnrollment.findUnique({
      where: { tenantId_id: { tenantId: scope.tenantId, id } },
      include: { course: { include: { academicYear: true } } },
    });
    if (!current) this.notFound();
    if (current.source === EDUPAY_SOURCE) {
      this.sourceManagedEnrollmentConflict();
    }
    // Closing an enrollment only reduces state, so it remains possible in an
    // archived course: it is how enrollments left active there are cleaned up.
    // The academic year must still be open.
    this.requireYearMutable(current.course.academicYear.status);
    if (current.status === 'INACTIVE') return mapCourseEnrollment(current);
    const record = await this.write(() =>
      this.prisma.$transaction(async (tx) => {
        const enrollment = await tx.courseEnrollment.update({
          where: { tenantId_id: { tenantId: scope.tenantId, id } },
          data: {
            status: 'INACTIVE',
            financialProjectionVersion: { increment: 1 },
            financialProjectionEffectiveTo: new Date(),
          },
          include: financialProjectionEnrollmentInclude,
        });
        if (this.financialProjectionConfig.enabled()) {
          await this.financialProjectionOutbox.enqueueEnrollment(
            tx,
            enrollment,
            context.requestId,
          );
        }
        return enrollment;
      }),
    );
    await this.recordAudit(
      context,
      'COURSE_ENROLLMENT_DEACTIVATED',
      'CourseEnrollment',
      id,
    );
    return mapCourseEnrollment(record);
  }

  async courseRoster(
    context: AcademicRequestContext,
    courseId: string,
    query: CursorQuery,
  ): Promise<CourseRosterPage> {
    const scope = this.adminScope(context);
    await this.course(scope, courseId);
    const where: Prisma.CourseEnrollmentWhereInput = {
      tenantId: scope.tenantId,
      courseId,
      status: 'ACTIVE',
      student: { status: 'ACTIVE' },
    };
    if (query.cursor) {
      await this.requireCursor(
        this.prisma.courseEnrollment.findFirst({
          where: { ...where, id: query.cursor },
          select: { id: true },
        }),
      );
    }
    const totalCount = await this.prisma.courseEnrollment.count({ where });
    const records = await this.prisma.courseEnrollment.findMany({
      where,
      include: { student: true },
      orderBy: [
        { student: { lastName: 'asc' } },
        { student: { firstName: 'asc' } },
        { id: 'asc' },
      ],
      ...(query.cursor
        ? {
            cursor: {
              tenantId_id: { tenantId: scope.tenantId, id: query.cursor },
            },
            skip: 1,
          }
        : {}),
      take: query.limit + 1,
    });
    const hasMore = records.length > query.limit;
    const visible = hasMore ? records.slice(0, query.limit) : records;
    return {
      items: visible.map((record) => ({
        enrollmentId: record.id,
        sourceManaged: isSourceManagedEnrollment(record),
        student: mapStudent(record.student) as CourseRosterItem['student'],
      })),
      nextCursor: hasMore ? (visible.at(-1)?.id ?? null) : null,
      totalCount,
    };
  }

  /**
   * Active enrollments whose student is inactive or whose course is archived.
   * Read-only: closing each one is an explicit administrator action.
   */
  async inconsistentCourseEnrollments(
    context: AcademicRequestContext,
    query: CursorQuery,
  ): Promise<InconsistentCourseEnrollmentPage> {
    const scope = this.adminScope(context);
    const where: Prisma.CourseEnrollmentWhereInput = {
      tenantId: scope.tenantId,
      status: 'ACTIVE',
      OR: [
        { student: { status: 'INACTIVE' } },
        { course: { status: 'ARCHIVED' } },
      ],
    };
    if (query.cursor) {
      await this.requireCursor(
        this.prisma.courseEnrollment.findFirst({
          where: { ...where, id: query.cursor },
          select: { id: true },
        }),
      );
    }
    const totalCount = await this.prisma.courseEnrollment.count({ where });
    const records = await this.prisma.courseEnrollment.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            status: true,
            source: true,
          },
        },
        course: {
          select: {
            id: true,
            label: true,
            status: true,
            academicYear: { select: { id: true, label: true, status: true } },
          },
        },
      },
      orderBy: { id: 'asc' },
      ...(query.cursor
        ? {
            cursor: {
              tenantId_id: { tenantId: scope.tenantId, id: query.cursor },
            },
            skip: 1,
          }
        : {}),
      take: query.limit + 1,
    });
    const hasMore = records.length > query.limit;
    const visible = hasMore ? records.slice(0, query.limit) : records;
    return {
      items: visible.map((record) => {
        const reasons: InconsistentCourseEnrollmentReason[] = [];
        if (record.student.status === 'INACTIVE') {
          reasons.push('STUDENT_INACTIVE');
        }
        if (record.course.status === 'ARCHIVED') {
          reasons.push('COURSE_ARCHIVED');
        }
        return {
          enrollmentId: record.id,
          sourceManaged: isSourceManagedEnrollment(record),
          reasons,
          student: {
            id: record.student.id,
            firstName: record.student.firstName,
            lastName: record.student.lastName,
            status: record.student.status,
          },
          course: {
            id: record.course.id,
            label: record.course.label,
            status: record.course.status,
          },
          academicYear: record.course.academicYear,
        };
      }),
      nextCursor: hasMore ? (visible.at(-1)?.id ?? null) : null,
      totalCount,
    };
  }

  async courseRosterSummary(
    context: AcademicRequestContext,
    courseId: string,
  ): Promise<CourseRosterSummary> {
    const scope = this.adminScope(context);
    await this.course(scope, courseId);
    const where = {
      tenantId: scope.tenantId,
      courseId,
      status: 'ACTIVE' as const,
      student: { status: 'ACTIVE' as const },
    };
    const totalCount = await this.prisma.courseEnrollment.count({ where });
    if (totalCount > courseEnrollmentPromotionRosterLimit) {
      const sourceManagedCount = await this.prisma.courseEnrollment.count({
        where: {
          ...where,
          OR: [
            { source: { not: MANUAL_SOURCE } },
            { student: { source: EDUPAY_SOURCE } },
          ],
        },
      });
      return {
        sourceCourseId: courseId,
        fingerprint: null,
        totalCount,
        sourceManagedCount,
        operationAllowed: false,
        maxRosterCount: courseEnrollmentPromotionRosterLimit,
      };
    }

    const enrollments = await this.prisma.courseEnrollment.findMany({
      where,
      select: {
        id: true,
        source: true,
        student: { select: { source: true } },
      },
      orderBy: { id: 'asc' },
    });
    return {
      sourceCourseId: courseId,
      fingerprint: courseRosterFingerprint(courseId, enrollments),
      totalCount,
      sourceManagedCount: enrollments.filter(isSourceManagedEnrollment).length,
      operationAllowed: true,
      maxRosterCount: courseEnrollmentPromotionRosterLimit,
    };
  }

  async directlyEnrollStudent(
    context: AcademicRequestContext,
    input: CreateStudentSubjectEnrollment,
  ): Promise<object> {
    const scope = this.adminScope(context);
    const student = await this.student(scope, input.studentId);
    if (student.status !== 'ACTIVE') {
      throw new ConflictException('An inactive student cannot be assigned.');
    }
    const courseSubject = await this.courseSubjectWithContext(
      scope,
      input.courseSubjectId,
    );
    if (courseSubject.status !== 'ACTIVE') {
      throw new ConflictException(
        'An archived CourseSubject cannot receive assignments.',
      );
    }
    this.requireStructuralMutation(
      courseSubject.course.status,
      courseSubject.course.academicYear.status,
    );
    const record = await this.write(() =>
      this.prisma.studentSubjectEnrollment.create({
        data: { tenantId: scope.tenantId, ...input },
      }),
    );
    await this.recordAudit(
      context,
      'STUDENT_SUBJECT_ENROLLMENT_CREATED',
      'StudentSubjectEnrollment',
      record.id,
      input.courseSubjectId,
    );
    return mapStudentSubjectEnrollment(record);
  }

  async deactivateDirectEnrollment(
    context: AcademicRequestContext,
    id: string,
  ): Promise<object> {
    const scope = this.adminScope(context);
    const current = await this.prisma.studentSubjectEnrollment.findUnique({
      where: { tenantId_id: { tenantId: scope.tenantId, id } },
      include: {
        courseSubject: {
          include: { course: { include: { academicYear: true } } },
        },
      },
    });
    if (!current) this.notFound();
    this.requireStructuralMutation(
      current.courseSubject.course.status,
      current.courseSubject.course.academicYear.status,
    );
    const record = await this.prisma.studentSubjectEnrollment.update({
      where: { tenantId_id: { tenantId: scope.tenantId, id } },
      data: { status: 'INACTIVE' },
    });
    await this.recordAudit(
      context,
      'STUDENT_SUBJECT_ENROLLMENT_DEACTIVATED',
      'StudentSubjectEnrollment',
      id,
      current.courseSubjectId,
    );
    return mapStudentSubjectEnrollment(record);
  }

  async assignTeachers(
    context: AcademicRequestContext,
    input: AssignCourseSubjectTeachers,
  ): Promise<object[]> {
    const scope = this.adminScope(context);
    const courseSubject = await this.courseSubjectWithContext(
      scope,
      input.courseSubjectId,
    );
    if (courseSubject.status !== 'ACTIVE') {
      throw new ConflictException(
        'An archived CourseSubject cannot receive assignments.',
      );
    }
    this.requireStructuralMutation(
      courseSubject.course.status,
      courseSubject.course.academicYear.status,
    );
    const teacherCount = await this.prisma.teacher.count({
      where: {
        tenantId: scope.tenantId,
        id: { in: input.teacherIds },
        status: 'ACTIVE',
      },
    });
    if (teacherCount !== input.teacherIds.length) this.notFound();
    const records = await this.write(() =>
      this.prisma.$transaction(
        input.teacherIds.map((teacherId) =>
          this.prisma.courseSubjectTeacher.create({
            data: {
              tenantId: scope.tenantId,
              courseSubjectId: input.courseSubjectId,
              teacherId,
            },
            include: { teacher: true },
          }),
        ),
      ),
    );
    for (const record of records) {
      await this.recordAudit(
        context,
        'COURSE_SUBJECT_TEACHER_ASSIGNED',
        'CourseSubjectTeacher',
        record.id,
        input.courseSubjectId,
      );
    }
    return records.map(mapCourseSubjectTeacher);
  }

  async deactivateTeacherAssignment(
    context: AcademicRequestContext,
    id: string,
  ): Promise<object> {
    const scope = this.adminScope(context);
    const current = await this.prisma.courseSubjectTeacher.findUnique({
      where: { tenantId_id: { tenantId: scope.tenantId, id } },
      include: {
        courseSubject: {
          include: { course: { include: { academicYear: true } } },
        },
      },
    });
    if (!current) this.notFound();
    this.requireStructuralMutation(
      current.courseSubject.course.status,
      current.courseSubject.course.academicYear.status,
    );
    const record = await this.prisma.courseSubjectTeacher.update({
      where: { tenantId_id: { tenantId: scope.tenantId, id } },
      data: { status: 'INACTIVE' },
      include: { teacher: true },
    });
    await this.recordAudit(
      context,
      'COURSE_SUBJECT_TEACHER_DEACTIVATED',
      'CourseSubjectTeacher',
      id,
      current.courseSubjectId,
    );
    return mapCourseSubjectTeacher(record);
  }

  async assignedTeachers(
    context: AcademicRequestContext,
    courseSubjectId: string,
  ): Promise<object[]> {
    const scope = this.adminScope(context);
    await this.courseSubject(scope, courseSubjectId);
    const records = await this.prisma.courseSubjectTeacher.findMany({
      where: { tenantId: scope.tenantId, courseSubjectId, status: 'ACTIVE' },
      include: { teacher: true },
      orderBy: [
        { teacher: { lastName: 'asc' } },
        { teacher: { firstName: 'asc' } },
      ],
    });
    return records.map(mapCourseSubjectTeacher);
  }

  async effectiveCourseSubjectsForStudent(
    context: AcademicRequestContext,
    studentId: string,
  ): Promise<object[]> {
    const scope = this.adminScope(context);
    return this.effectiveCourseSubjects(scope, studentId);
  }

  async myEffectiveCourseSubjects(
    context: AcademicRequestContext,
  ): Promise<object[]> {
    const scope = this.readScope(context);
    if (!context.principal.roles.includes('STUDENT')) {
      throw new ForbiddenException('The requested action is not authorized.');
    }
    const student = await this.prisma.student.findFirst({
      where: {
        tenantId: scope.tenantId,
        identityUserId: context.principal.identityUserId,
        status: 'ACTIVE',
      },
    });
    if (!student)
      throw new ForbiddenException('The requested action is not authorized.');
    return this.effectiveCourseSubjects(scope, student.id);
  }

  async myStudentProfile(context: AcademicRequestContext): Promise<object> {
    const scope = this.readScope(context);
    if (!context.principal.roles.includes('STUDENT')) {
      throw new ForbiddenException('The requested action is not authorized.');
    }
    const student = await this.prisma.student.findFirst({
      where: {
        tenantId: scope.tenantId,
        identityUserId: context.principal.identityUserId,
        status: 'ACTIVE',
      },
    });
    if (!student)
      throw new ForbiddenException('The requested action is not authorized.');
    return mapStudent(student);
  }

  async myAssignedCourseSubjects(
    context: AcademicRequestContext,
  ): Promise<object[]> {
    const scope = this.readScope(context);
    const teacher = await this.currentTeacher(scope, context);
    const records = await this.prisma.courseSubject.findMany({
      where: {
        tenantId: scope.tenantId,
        status: 'ACTIVE',
        teacherAssignments: {
          some: { teacherId: teacher.id, status: 'ACTIVE' },
        },
      },
      include: { course: true, subject: true },
      orderBy: [{ courseId: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
    });
    return records.map(mapCourseSubject);
  }

  async courseSubjectRoster(
    context: AcademicRequestContext,
    courseSubjectId: string,
  ): Promise<object[]> {
    const scope = this.readScope(context);
    const courseSubject = await this.courseSubject(scope, courseSubjectId);
    if (context.principal.roles.includes('TENANT_ADMIN')) {
      this.authorization.requireCapability(
        context.principal,
        context.tenant,
        TenantCapability.AdministerAcademicStructure,
      );
    } else {
      const teacher = await this.currentTeacher(scope, context);
      const assignment = await this.prisma.courseSubjectTeacher.findFirst({
        where: {
          tenantId: scope.tenantId,
          teacherId: teacher.id,
          courseSubjectId,
          status: 'ACTIVE',
        },
      });
      if (!assignment) {
        throw new ForbiddenException('The requested action is not authorized.');
      }
    }
    if (courseSubject.status !== 'ACTIVE') return [];

    const direct = await this.prisma.student.findMany({
      where: {
        tenantId: scope.tenantId,
        status: 'ACTIVE',
        subjectEnrollments: {
          some: { courseSubjectId, status: 'ACTIVE' },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
    });
    const inherited = courseSubject.defaultForCourse
      ? await this.prisma.student.findMany({
          where: {
            tenantId: scope.tenantId,
            status: 'ACTIVE',
            courseEnrollments: {
              some: { courseId: courseSubject.courseId, status: 'ACTIVE' },
            },
          },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
        })
      : [];

    const roster = new Map<
      string,
      { access: Array<'COURSE_DEFAULT' | 'DIRECT'>; student: object }
    >();
    for (const student of inherited) {
      roster.set(student.id, {
        access: ['COURSE_DEFAULT'],
        student: mapStudent(student),
      });
    }
    for (const student of direct) {
      const existing = roster.get(student.id);
      if (existing) existing.access.push('DIRECT');
      else
        roster.set(student.id, {
          access: ['DIRECT'],
          student: mapStudent(student),
        });
    }
    return [...roster.values()];
  }

  private async effectiveCourseSubjects(
    scope: TenantQueryScope,
    studentId: string,
  ): Promise<object[]> {
    const student = await this.student(scope, studentId);
    if (student.status !== 'ACTIVE') return [];
    const records = await this.prisma.courseSubject.findMany({
      where: {
        tenantId: scope.tenantId,
        status: 'ACTIVE',
        OR: [
          {
            defaultForCourse: true,
            course: {
              enrollments: {
                some: { studentId, status: 'ACTIVE' },
              },
            },
          },
          {
            directEnrollments: {
              some: { studentId, status: 'ACTIVE' },
            },
          },
        ],
      },
      include: { course: true, subject: true },
      orderBy: [{ courseId: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
    });
    return records.map(mapCourseSubject);
  }

  private adminScope(context: AcademicRequestContext): TenantQueryScope {
    this.authorization.requireCapability(
      context.principal,
      context.tenant,
      TenantCapability.AdministerAcademicStructure,
    );
    return TenantQueryScope.fromTrustedContext(context.tenant);
  }

  private readScope(context: AcademicRequestContext): TenantQueryScope {
    this.authorization.requireCapability(
      context.principal,
      context.tenant,
      TenantCapability.AccessTenant,
    );
    return TenantQueryScope.fromTrustedContext(context.tenant);
  }

  private async ensureTenant(scope: TenantQueryScope): Promise<void> {
    await this.prisma.tenant.upsert({
      where: { id: scope.tenantId },
      create: { id: scope.tenantId },
      update: {},
    });
  }

  private async academicYear(scope: TenantQueryScope, id: string) {
    const record = await this.prisma.academicYear.findUnique({
      where: { tenantId_id: { tenantId: scope.tenantId, id } },
    });
    if (!record) this.notFound();
    return record;
  }

  private async course(scope: TenantQueryScope, id: string) {
    const record = await this.prisma.course.findUnique({
      where: { tenantId_id: { tenantId: scope.tenantId, id } },
    });
    if (!record) this.notFound();
    return record;
  }

  private async courseWithYear(scope: TenantQueryScope, id: string) {
    const record = await this.prisma.course.findUnique({
      where: { tenantId_id: { tenantId: scope.tenantId, id } },
      include: { academicYear: true },
    });
    if (!record) this.notFound();
    return record;
  }

  private async student(scope: TenantQueryScope, id: string) {
    const record = await this.prisma.student.findUnique({
      where: { tenantId_id: { tenantId: scope.tenantId, id } },
    });
    if (!record) this.notFound();
    return record;
  }

  private async teacher(scope: TenantQueryScope, id: string) {
    const record = await this.prisma.teacher.findUnique({
      where: { tenantId_id: { tenantId: scope.tenantId, id } },
    });
    if (!record) this.notFound();
    return record;
  }

  private async subject(scope: TenantQueryScope, id: string) {
    const record = await this.prisma.subject.findUnique({
      where: { tenantId_id: { tenantId: scope.tenantId, id } },
    });
    if (!record) this.notFound();
    return record;
  }

  private async courseSubject(scope: TenantQueryScope, id: string) {
    const record = await this.prisma.courseSubject.findUnique({
      where: { tenantId_id: { tenantId: scope.tenantId, id } },
    });
    if (!record) this.notFound();
    return record;
  }

  private async courseSubjectWithContext(scope: TenantQueryScope, id: string) {
    const record = await this.prisma.courseSubject.findUnique({
      where: { tenantId_id: { tenantId: scope.tenantId, id } },
      include: {
        course: { include: { academicYear: true } },
        subject: true,
      },
    });
    if (!record) this.notFound();
    return record;
  }

  private async currentTeacher(
    scope: TenantQueryScope,
    context: AcademicRequestContext,
  ) {
    if (!context.principal.roles.includes('TEACHER')) {
      throw new ForbiddenException('The requested action is not authorized.');
    }
    const teacher = await this.prisma.teacher.findFirst({
      where: {
        tenantId: scope.tenantId,
        identityUserId: context.principal.identityUserId,
        status: 'ACTIVE',
      },
    });
    if (!teacher)
      throw new ForbiddenException('The requested action is not authorized.');
    return teacher;
  }

  private requireYearMutable(status: AcademicYearStatus): void {
    requireAcademicYearMutable(status);
  }

  private requireStructuralMutation(
    courseStatus: CourseStatus,
    yearStatus: AcademicYearStatus,
  ): void {
    this.requireYearMutable(yearStatus);
    if (courseStatus === 'ARCHIVED') {
      throw new ConflictException('The course is read-only.');
    }
  }

  private requireDateRange(startDate: string, endDate: string): void {
    if (startDate > endDate) {
      throw new BadRequestException('startDate must be on or before endDate.');
    }
  }

  private date(value: string): Date {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private async requireCursor(value: Promise<unknown>): Promise<void> {
    if (!(await value)) {
      throw new BadRequestException('The pagination cursor is invalid.');
    }
  }

  private page<T extends { paginationToken: string }, TResult>(
    records: T[],
    limit: number,
    mapper: (record: T) => TResult,
  ): { items: TResult[]; nextCursor: string | null } {
    const hasMore = records.length > limit;
    const visible = hasMore ? records.slice(0, limit) : records;
    return {
      items: visible.map(mapper),
      nextCursor: hasMore ? (visible.at(-1)?.paginationToken ?? null) : null,
    };
  }

  private async write<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (this.prismaErrorCode(error) === 'P2002') {
        throw new ConflictException(
          'An active or uniquely identified record already exists.',
        );
      }
      if (this.prismaErrorCode(error) === 'P2003') {
        this.notFound();
      }
      throw error;
    }
  }

  private prismaErrorCode(error: unknown): string | undefined {
    if (typeof error !== 'object' || error === null || !('code' in error))
      return undefined;
    return typeof error.code === 'string' ? error.code : undefined;
  }

  private async recordAudit(
    context: AcademicRequestContext,
    action: string,
    resourceType: string,
    resourceId: string,
    courseSubjectId?: string,
  ): Promise<void> {
    await this.audit.record({
      action,
      context,
      resourceId,
      resourceType,
      ...(courseSubjectId ? { courseSubjectId } : {}),
    });
  }

  private notFound(): never {
    throw new NotFoundException(
      'The requested academic resource was not found.',
    );
  }

  private sourceManagedConflict(): never {
    throw new ConflictException({
      code: 'SOURCE_MANAGED_FIELD_CONFLICT',
      message: 'This field is managed by EduPay synchronization.',
    });
  }

  private sourceManagedEnrollmentConflict(): never {
    throw new ConflictException({
      code: 'SOURCE_MANAGED_ENROLLMENT_CONFLICT',
      message: 'This course enrollment is managed by EduPay synchronization.',
    });
  }
}
