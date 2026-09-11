import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  learningReadAudienceSchema,
  type StudentCourseSubjectLearningRoute,
} from '@edupay/contracts';

import type { AcademicRequestContext } from '../../academic/academic-context';
import { AuthorizationService } from '../../authorization/authorization.service';
import { TenantCapability } from '../../authorization/authorization.types';
import { PrismaService } from '../../persistence/prisma.service';
import { TrustedTenantContext } from '../../tenant/trusted-tenant-context';
import { CurrentIdentityStatusService } from '../../identity/current-identity-status.service';
import {
  LEARNING_READ_CLOCK,
  LEARNING_READ_MAX_ITEMS_PER_UNIT,
  LEARNING_READ_MAX_UNITS,
  LEARNING_READ_MODEL_V2,
  type LearningReadClock,
} from './learning-read.constants';
import {
  mapStudentLearningRoute,
  mapTeacherLearningRoute,
} from './learning-read.mapper';
import type {
  LearningReadAggregate,
  LearningReadRequest,
  StudentReadEligibility,
} from './learning-read.types';
import {
  canAccessTeacherAuthoring,
  enrollmentEligible,
} from './learning-visibility.policy';

const courseSubjectReadInclude = {
  course: {
    select: {
      status: true,
      academicYear: { select: { status: true } },
    },
  },
} as const;

const itemReadSelect = {
  id: true,
  tenantId: true,
  courseSubjectId: true,
  learningUnitId: true,
  type: true,
  title: true,
  description: true,
  content: true,
  instructions: true,
  body: true,
  bodyDocument: true,
  sortOrder: true,
  publicationStatus: true,
  publishAt: true,
  publishedAt: true,
  dueAt: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} as const;

const unitReadSelect = {
  id: true,
  tenantId: true,
  courseSubjectId: true,
  title: true,
  description: true,
  sortOrder: true,
  startAt: true,
  endAt: true,
  status: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class LearningReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly currentIdentityStatus: CurrentIdentityStatusService,
    private readonly config: ConfigService,
    @Inject(LEARNING_READ_CLOCK) private readonly clock: LearningReadClock,
  ) {}

  isEnabled(): boolean {
    const value = this.config.get<unknown>(LEARNING_READ_MODEL_V2);
    return (
      value === true || value === 'true' || value === '1' || value === 'on'
    );
  }

  async read(
    context: AcademicRequestContext | undefined,
    request: LearningReadRequest,
    legacyRead?: () => Promise<object>,
  ): Promise<object> {
    if (!this.isEnabled()) {
      if (legacyRead) return legacyRead();
      this.notFound();
    }

    const trusted = this.requireContext(context);
    await this.currentIdentityStatus.requireCurrentActiveContext(
      trusted.context.principal,
      trusted.context.tenant,
      trusted.context.requestId,
    );
    const audience = learningReadAudienceSchema.safeParse(request.audience);
    if (!audience.success) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'The requested learning audience is invalid.',
      });
    }
    if (
      audience.data === 'TEACHER_PREVIEW' &&
      Object.prototype.hasOwnProperty.call(request, 'studentId')
    ) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Preview does not accept a student selector.',
      });
    }

    if (
      audience.data === 'STUDENT' &&
      !trusted.context.principal.roles.includes('STUDENT')
    ) {
      this.deny();
    }

    const courseSubject = await this.prisma.courseSubject.findUnique({
      where: {
        tenantId_id: {
          tenantId: trusted.context.tenant.tenantId,
          id: request.courseSubjectId,
        },
      },
      include: courseSubjectReadInclude,
    });
    if (!courseSubject) this.notFound();

    if (audience.data === 'STUDENT') {
      return this.studentRoute(trusted.context, courseSubject);
    }

    await this.requireTeacherAuthoring(
      trusted.context,
      courseSubject.tenantId,
      courseSubject.id,
      trusted.elevatedSupportContext,
    );

    if (audience.data === 'TEACHER_PREVIEW') {
      const now = this.clock.now();
      const aggregate = await this.loadStudentAggregate(courseSubject, now);
      return mapStudentLearningRoute(
        { aggregate, context: trusted.context, now },
        true,
      );
    }

    const aggregate = await this.loadTeacherAggregate(courseSubject);
    return mapTeacherLearningRoute({
      aggregate,
      context: trusted.context,
      now: this.clock.now(),
    });
  }

  private requireContext(context: AcademicRequestContext | undefined): {
    context: AcademicRequestContext;
    elevatedSupportContext: boolean;
  } {
    if (!context?.principal) {
      throw new UnauthorizedException('A valid access token is required.');
    }
    if (!TrustedTenantContext.isTrusted(context.tenant)) {
      this.deny();
    }

    const onlySystemAdmin =
      context.principal.roles.includes('SYSTEM_ADMIN') &&
      !context.principal.roles.some((role) => role !== 'SYSTEM_ADMIN');
    if (onlySystemAdmin) {
      // TenantContextGuard can attach this only through the audited support policy.
      return { context, elevatedSupportContext: true };
    }

    this.authorization.requireCapability(
      context.principal,
      context.tenant,
      TenantCapability.AccessTenant,
    );
    return { context, elevatedSupportContext: false };
  }

  private async studentRoute(
    context: AcademicRequestContext,
    courseSubject: LearningReadAggregate['courseSubject'],
  ): Promise<StudentCourseSubjectLearningRoute> {
    const student = await this.prisma.student.findFirst({
      where: {
        tenantId: context.tenant.tenantId,
        identityUserId: context.principal.identityUserId,
      },
      select: { id: true, tenantId: true, status: true },
    });
    if (!student || student.status !== 'ACTIVE') this.deny();

    const [courseEnrollment, subjectEnrollment] = await Promise.all([
      this.prisma.courseEnrollment.findFirst({
        where: {
          tenantId: context.tenant.tenantId,
          studentId: student.id,
          courseId: courseSubject.courseId,
          status: 'ACTIVE',
        },
        select: { tenantId: true, courseId: true, status: true },
      }),
      this.prisma.studentSubjectEnrollment.findFirst({
        where: {
          tenantId: context.tenant.tenantId,
          studentId: student.id,
          courseSubjectId: courseSubject.id,
          status: 'ACTIVE',
        },
        select: { tenantId: true, courseSubjectId: true, status: true },
      }),
    ]);

    const eligibility: StudentReadEligibility = {
      student,
      courseEnrollment,
      subjectEnrollment,
    };
    const allowed = enrollmentEligible(
      context.tenant.tenantId,
      courseSubject,
      eligibility,
    );
    if (!allowed) this.deny();
    if (
      courseSubject.course.academicYear.status !== 'ACTIVE' ||
      courseSubject.course.status !== 'ACTIVE' ||
      courseSubject.status !== 'ACTIVE'
    ) {
      this.notFound();
    }

    const now = this.clock.now();
    const aggregate = await this.loadStudentAggregate(courseSubject, now);
    return mapStudentLearningRoute(
      { aggregate, context, now, studentEligibility: eligibility },
      allowed,
    );
  }

  private async requireTeacherAuthoring(
    context: AcademicRequestContext,
    resourceTenantId: string,
    courseSubjectId: string,
    elevatedSupportContext: boolean,
  ): Promise<void> {
    let teacherStatus: string | undefined;
    let assignmentStatus: string | undefined;
    if (
      context.principal.roles.includes('TEACHER') &&
      !context.principal.roles.includes('TENANT_ADMIN')
    ) {
      const teacher = await this.prisma.teacher.findFirst({
        where: {
          tenantId: context.tenant.tenantId,
          identityUserId: context.principal.identityUserId,
        },
        select: { id: true, status: true },
      });
      teacherStatus = teacher?.status;
      if (teacher) {
        const assignment = await this.prisma.courseSubjectTeacher.findFirst({
          where: {
            tenantId: context.tenant.tenantId,
            teacherId: teacher.id,
            courseSubjectId,
          },
          select: { status: true },
        });
        assignmentStatus = assignment?.status;
      }
    }

    if (
      !canAccessTeacherAuthoring({
        trustedTenantId: context.tenant.tenantId,
        resourceTenantId,
        roles: context.principal.roles,
        elevatedSupportContext,
        teacherStatus,
        assignmentStatus,
      })
    ) {
      this.deny();
    }
  }

  private async loadStudentAggregate(
    courseSubject: LearningReadAggregate['courseSubject'],
    now: Date,
  ): Promise<LearningReadAggregate> {
    const units = await this.prisma.learningUnit.findMany({
      where: {
        tenantId: courseSubject.tenantId,
        courseSubjectId: courseSubject.id,
        status: 'ACTIVE',
        AND: [
          { OR: [{ startAt: null }, { startAt: { lte: now } }] },
          { OR: [{ endAt: null }, { endAt: { gte: now } }] },
        ],
      },
      take: LEARNING_READ_MAX_UNITS,
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: {
        ...unitReadSelect,
        items: {
          where: {
            OR: [
              { publicationStatus: 'PUBLISHED' },
              {
                publicationStatus: 'SCHEDULED',
                publishAt: { lte: now },
              },
            ],
          },
          take: LEARNING_READ_MAX_ITEMS_PER_UNIT,
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          select: itemReadSelect,
        },
      },
    });
    return { courseSubject, units };
  }

  private async loadTeacherAggregate(
    courseSubject: LearningReadAggregate['courseSubject'],
  ): Promise<LearningReadAggregate> {
    const units = await this.prisma.learningUnit.findMany({
      where: {
        tenantId: courseSubject.tenantId,
        courseSubjectId: courseSubject.id,
      },
      take: LEARNING_READ_MAX_UNITS,
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: {
        ...unitReadSelect,
        items: {
          take: LEARNING_READ_MAX_ITEMS_PER_UNIT,
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          select: {
            ...itemReadSelect,
            draft: { select: { basedOnVersion: true, updatedAt: true } },
          },
        },
      },
    });
    return { courseSubject, units };
  }

  private deny(): never {
    throw new ForbiddenException('The requested action is not authorized.');
  }

  private notFound(): never {
    throw new NotFoundException(
      'The requested learning resource was not found.',
    );
  }
}
