import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
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
  CursorQuery,
  PersonListQuery,
  SubjectListQuery,
  UpdateAcademicYear,
  UpdateCourse,
  UpdateCourseSubject,
  UpdateStudent,
  UpdateSubject,
  UpdateTeacher,
} from '@edupay/contracts';

import { AuthorizationService } from '../authorization/authorization.service';
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

@Injectable()
export class AcademicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    @Inject(ACADEMIC_AUDIT_PORT)
    private readonly audit: AcademicAuditPort,
    @Inject(ACADEMIC_IDENTITY_LINK_VERIFIER)
    private readonly identityLinks: AcademicIdentityLinkVerifier,
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
    const record = await this.write(() =>
      this.prisma.academicYear.update({
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
    const record = await this.write(() =>
      this.prisma.course.update({
        where: { tenantId_id: { tenantId: scope.tenantId, id } },
        data: {
          ...(input.label !== undefined ? { label: input.label } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
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
    query: PersonListQuery,
  ): Promise<object> {
    const scope = this.adminScope(context);
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
    const records = await this.prisma.student.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...(query.cursor
        ? { cursor: { paginationToken: query.cursor }, skip: 1 }
        : {}),
      take: query.limit + 1,
    });
    return this.page(records, query.limit, mapStudent);
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
    const record = await this.write(() =>
      this.prisma.student.update({
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
    const records = await this.prisma.teacher.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...(query.cursor
        ? { cursor: { paginationToken: query.cursor }, skip: 1 }
        : {}),
      take: query.limit + 1,
    });
    return this.page(records, query.limit, mapTeacher);
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
      this.prisma.courseEnrollment.create({
        data: { tenantId: scope.tenantId, source: MANUAL_SOURCE, ...input },
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
    this.requireStructuralMutation(
      current.course.status,
      current.course.academicYear.status,
    );
    const record = await this.prisma.courseEnrollment.update({
      where: { tenantId_id: { tenantId: scope.tenantId, id } },
      data: { status: 'INACTIVE' },
    });
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
  ): Promise<object[]> {
    const scope = this.adminScope(context);
    await this.course(scope, courseId);
    const records = await this.prisma.courseEnrollment.findMany({
      where: {
        tenantId: scope.tenantId,
        courseId,
        status: 'ACTIVE',
        student: { status: 'ACTIVE' },
      },
      include: { student: true },
      orderBy: [
        { student: { lastName: 'asc' } },
        { student: { firstName: 'asc' } },
      ],
    });
    return records.map((record) => ({
      enrollmentId: record.id,
      student: mapStudent(record.student),
    }));
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
    if (status === 'CLOSED' || status === 'ARCHIVED') {
      throw new ConflictException('The academic year is read-only.');
    }
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
