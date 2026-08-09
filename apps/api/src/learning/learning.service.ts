import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateLearningItem,
  CreateLearningUnit,
  ReorderLearning,
  ScheduleLearningItem,
  UpdateLearningItem,
  UpdateLearningUnit,
} from '@edupay/contracts';

import { AuthorizationService } from '../authorization/authorization.service';
import { TenantCapability } from '../authorization/authorization.types';
import type {
  LearningItem,
  LearningItemType,
  LearningUnit,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../persistence/prisma.service';
import { TenantQueryScope } from '../persistence/tenant-query-scope';
import type { AcademicRequestContext } from '../academic/academic-context';
import {
  ACADEMIC_AUDIT_PORT,
  type AcademicAuditEvent,
  type AcademicAuditPort,
} from '../academic/academic-audit.port';
import {
  LEARNING_STUDENT_WORK_PORT,
  type LearningStudentWorkPort,
} from './learning-student-work.port';
import {
  mapLearningItem,
  mapLearningUnit,
  mapLearningUnitWithItems,
} from './learning.mapper';
import { NotificationService } from '../notifications/notification.service';

type LearningUnitWithSubject = LearningUnit & {
  courseSubject: { status: string };
};
type LearningItemWithUnit = LearningItem & {
  learningUnit: LearningUnit;
};

@Injectable()
export class LearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    @Inject(ACADEMIC_AUDIT_PORT)
    private readonly audit: AcademicAuditPort,
    @Inject(LEARNING_STUDENT_WORK_PORT)
    private readonly studentWork: LearningStudentWorkPort,
    private readonly notifications: NotificationService,
  ) {}

  async learningRoute(
    context: AcademicRequestContext,
    courseSubjectId: string,
  ): Promise<object> {
    const scope = this.readScope(context);
    const courseSubject = await this.courseSubject(scope, courseSubjectId);
    await this.requireCourseSubjectRead(context, scope, courseSubjectId);

    const isStudent = context.principal.roles.includes('STUDENT');
    const now = new Date();
    const records = await this.prisma.learningUnit.findMany({
      where: {
        tenantId: scope.tenantId,
        courseSubjectId,
        ...(isStudent
          ? {
              status: 'ACTIVE',
              AND: [
                { OR: [{ startAt: null }, { startAt: { lte: now } }] },
                { OR: [{ endAt: null }, { endAt: { gte: now } }] },
              ],
            }
          : {}),
      },
      include: {
        items: isStudent
          ? {
              where: this.visibleItemWhere(now),
              orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            }
          : { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });

    return {
      courseSubjectId: courseSubject.id,
      units: records.map(mapLearningUnitWithItems),
    };
  }

  async createUnit(
    context: AcademicRequestContext,
    input: CreateLearningUnit,
  ): Promise<object> {
    const scope = this.managerScope(context);
    await this.requireCourseSubjectForMutation(
      context,
      scope,
      input.courseSubjectId,
    );
    this.requireDateRange(input.startAt, input.endAt);
    const record = await this.prisma.learningUnit.create({
      data: {
        tenantId: scope.tenantId,
        courseSubjectId: input.courseSubjectId,
        title: input.title,
        description: input.description ?? null,
        sortOrder: input.sortOrder,
        startAt: input.startAt ? this.instant(input.startAt) : null,
        endAt: input.endAt ? this.instant(input.endAt) : null,
      },
    });
    await this.recordAudit(
      context,
      'LEARNING_UNIT_CREATED',
      'LearningUnit',
      record.id,
      record.courseSubjectId,
    );
    return mapLearningUnit(record);
  }

  async listUnits(
    context: AcademicRequestContext,
    courseSubjectId: string,
  ): Promise<object[]> {
    const scope = this.readScope(context);
    await this.courseSubject(scope, courseSubjectId);
    const isStudent = context.principal.roles.includes('STUDENT');
    await this.requireCourseSubjectRead(context, scope, courseSubjectId);
    const now = new Date();
    const records = await this.prisma.learningUnit.findMany({
      where: {
        tenantId: scope.tenantId,
        courseSubjectId,
        ...(isStudent
          ? {
              status: 'ACTIVE',
              AND: [
                { OR: [{ startAt: null }, { startAt: { lte: now } }] },
                { OR: [{ endAt: null }, { endAt: { gte: now } }] },
              ],
            }
          : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return records.map(mapLearningUnit);
  }

  async getUnit(
    context: AcademicRequestContext,
    id: string,
  ): Promise<object> {
    const scope = this.readScope(context);
    const record = await this.learningUnit(scope, id);
    await this.requireCourseSubjectRead(context, scope, record.courseSubjectId);
    if (
      context.principal.roles.includes('STUDENT') &&
      !this.isVisibleUnit(record, new Date())
    ) {
      this.notFound();
    }
    return mapLearningUnit(record);
  }

  async updateUnit(
    context: AcademicRequestContext,
    id: string,
    input: UpdateLearningUnit,
  ): Promise<object> {
    const scope = this.managerScope(context);
    const current = await this.learningUnitWithSubject(scope, id);
    await this.requireCourseSubjectForMutation(
      context,
      scope,
      current.courseSubjectId,
    );
    if (current.status === 'ARCHIVED') {
      throw new ConflictException('An archived learning unit is read-only.');
    }
    if (input.status === 'ARCHIVED') {
      throw new ConflictException('Use the archive endpoint for learning units.');
    }
    if (input.status === 'DRAFT' && current.status === 'ACTIVE') {
      throw new ConflictException(
        'An active learning unit cannot return to draft.',
      );
    }
    const startAt =
      input.startAt === undefined
        ? current.startAt
        : input.startAt
          ? this.instant(input.startAt)
          : null;
    const endAt =
      input.endAt === undefined
        ? current.endAt
        : input.endAt
          ? this.instant(input.endAt)
          : null;
    this.requireDateRange(
      startAt ? startAt.toISOString() : undefined,
      endAt ? endAt.toISOString() : undefined,
    );
    const record = await this.prisma.learningUnit.update({
      where: { tenantId_id: { tenantId: scope.tenantId, id } },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.sortOrder !== undefined
          ? { sortOrder: input.sortOrder }
          : {}),
        ...(input.startAt !== undefined ? { startAt } : {}),
        ...(input.endAt !== undefined ? { endAt } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });
    await this.recordAudit(
      context,
      'LEARNING_UNIT_UPDATED',
      'LearningUnit',
      id,
      record.courseSubjectId,
    );
    return mapLearningUnit(record);
  }

  async archiveUnit(
    context: AcademicRequestContext,
    id: string,
  ): Promise<object> {
    const scope = this.managerScope(context);
    const current = await this.learningUnit(scope, id);
    await this.requireCourseSubjectForMutation(
      context,
      scope,
      current.courseSubjectId,
    );
    if (current.status === 'ARCHIVED') return mapLearningUnit(current);
    const record = await this.prisma.learningUnit.update({
      where: { tenantId_id: { tenantId: scope.tenantId, id } },
      data: { status: 'ARCHIVED' },
    });
    await this.recordAudit(
      context,
      'LEARNING_UNIT_ARCHIVED',
      'LearningUnit',
      id,
      record.courseSubjectId,
    );
    return mapLearningUnit(record);
  }

  async reorderUnits(
    context: AcademicRequestContext,
    courseSubjectId: string,
    input: ReorderLearning,
  ): Promise<object[]> {
    const scope = this.managerScope(context);
    await this.requireCourseSubjectForMutation(context, scope, courseSubjectId);
    const records = await this.prisma.learningUnit.findMany({
      where: {
        tenantId: scope.tenantId,
        courseSubjectId,
        id: { in: input.orderedIds },
      },
      select: { id: true },
    });
    this.requireExactSet(records.map((record) => record.id), input.orderedIds);
    await this.prisma.$transaction(
      input.orderedIds.map((id, sortOrder) =>
        this.prisma.learningUnit.update({
          where: { tenantId_id: { tenantId: scope.tenantId, id } },
          data: { sortOrder },
        }),
      ),
    );
    await this.recordAudit(
      context,
      'LEARNING_UNITS_REORDERED',
      'LearningUnit',
      courseSubjectId,
      courseSubjectId,
    );
    return this.listUnits(context, courseSubjectId);
  }

  async createItem(
    context: AcademicRequestContext,
    learningUnitId: string,
    input: CreateLearningItem,
  ): Promise<object> {
    const scope = this.managerScope(context);
    const unit = await this.learningUnit(scope, learningUnitId);
    await this.requireCourseSubjectForMutation(
      context,
      scope,
      unit.courseSubjectId,
    );
    this.validateItemContent(input.type, input.instructions, input.body, input.dueAt);
    const record = await this.prisma.learningItem.create({
      data: {
        tenantId: scope.tenantId,
        courseSubjectId: unit.courseSubjectId,
        learningUnitId,
        type: input.type,
        title: input.title,
        description: input.description ?? null,
        content: input.content ?? null,
        instructions: input.instructions ?? null,
        body: input.body ?? null,
        sortOrder: input.sortOrder,
        dueAt: input.dueAt ? this.instant(input.dueAt) : null,
        createdByIdentityUserId: context.principal.identityUserId,
      },
    });
    await this.recordAudit(
      context,
      'LEARNING_ITEM_CREATED',
      'LearningItem',
      record.id,
      record.courseSubjectId,
    );
    return mapLearningItem(record);
  }

  async listItems(
    context: AcademicRequestContext,
    learningUnitId: string,
  ): Promise<object[]> {
    const scope = this.readScope(context);
    const unit = await this.learningUnit(scope, learningUnitId);
    await this.requireCourseSubjectRead(context, scope, unit.courseSubjectId);
    const isStudent = context.principal.roles.includes('STUDENT');
    if (isStudent && !this.isVisibleUnit(unit, new Date())) this.notFound();
    const records = await this.prisma.learningItem.findMany({
      where: {
        tenantId: scope.tenantId,
        learningUnitId,
        ...(isStudent ? this.visibleItemWhere(new Date()) : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return records.map(mapLearningItem);
  }

  async getItem(
    context: AcademicRequestContext,
    id: string,
  ): Promise<object> {
    const scope = this.readScope(context);
    const record = await this.learningItemWithUnit(scope, id);
    await this.requireCourseSubjectRead(context, scope, record.courseSubjectId);
    if (context.principal.roles.includes('STUDENT')) {
      if (
        !this.isVisibleUnit(record.learningUnit, new Date()) ||
        !this.isVisibleItem(record, new Date())
      ) {
        this.notFound();
      }
    }
    return mapLearningItem(record);
  }

  async updateItem(
    context: AcademicRequestContext,
    id: string,
    input: UpdateLearningItem,
  ): Promise<object> {
    const scope = this.managerScope(context);
    const current = await this.learningItemWithUnit(scope, id);
    await this.requireCourseSubjectForMutation(
      context,
      scope,
      current.courseSubjectId,
    );
    if (current.publicationStatus === 'ARCHIVED') {
      throw new ConflictException('An archived learning item is read-only.');
    }
    const nextType = input.type ?? current.type;
    const nextInstructions =
      input.instructions === undefined
        ? current.instructions
        : input.instructions;
    const nextBody = input.body === undefined ? current.body : input.body;
    const nextDueAt =
      input.dueAt === undefined
        ? current.dueAt
        : input.dueAt
          ? this.instant(input.dueAt)
          : null;
    this.validateItemContent(
      nextType,
      nextInstructions ?? undefined,
      nextBody ?? undefined,
      nextDueAt ? nextDueAt.toISOString() : undefined,
    );

    const sensitiveChange =
      current.publicationStatus !== 'DRAFT' &&
      (input.type !== undefined ||
        input.instructions !== undefined ||
        input.dueAt !== undefined);
    if (sensitiveChange) {
      await this.requireSensitiveConfirmation(
        context,
        scope,
        current,
        input.confirmSensitiveChange,
      );
    }

    const record = await this.prisma.learningItem.update({
      where: { tenantId_id: { tenantId: scope.tenantId, id } },
      data: {
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.instructions !== undefined
          ? { instructions: input.instructions }
          : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.sortOrder !== undefined
          ? { sortOrder: input.sortOrder }
          : {}),
        ...(input.dueAt !== undefined ? { dueAt: nextDueAt } : {}),
        updatedByIdentityUserId: context.principal.identityUserId,
      },
    });
    await this.recordAudit(
      context,
      sensitiveChange
        ? 'LEARNING_ITEM_SENSITIVE_CHANGE_CONFIRMED'
        : 'LEARNING_ITEM_UPDATED',
      'LearningItem',
      id,
      record.courseSubjectId,
    );
    return mapLearningItem(record);
  }

  async scheduleItem(
    context: AcademicRequestContext,
    id: string,
    input: ScheduleLearningItem,
  ): Promise<object> {
    const scope = this.managerScope(context);
    const current = await this.learningItem(scope, id);
    await this.requireCourseSubjectForMutation(
      context,
      scope,
      current.courseSubjectId,
    );
    if (current.publicationStatus === 'ARCHIVED') {
      throw new ConflictException('An archived learning item is read-only.');
    }
    if (current.publicationStatus === 'PUBLISHED') {
      throw new ConflictException(
        'Published content cannot be returned to a scheduled state.',
      );
    }
    const publishAt = this.instant(input.publishAt);
    if (publishAt.getTime() <= Date.now()) {
      throw new ConflictException('publishAt must be in the future.');
    }
    const changedTiming =
      current.publicationStatus === 'SCHEDULED' &&
      (!current.publishAt || current.publishAt.getTime() !== publishAt.getTime());
    if (changedTiming) {
      await this.requireSensitiveConfirmation(
        context,
        scope,
        current,
        input.confirmSensitiveChange,
      );
    }
    const record = await this.prisma.learningItem.update({
      where: { tenantId_id: { tenantId: scope.tenantId, id } },
      data: {
        publicationStatus: 'SCHEDULED',
        publishAt,
        publishedAt: null,
        publishedByIdentityUserId: null,
        updatedByIdentityUserId: context.principal.identityUserId,
      },
    });
    await this.recordAudit(
      context,
      changedTiming
        ? 'LEARNING_ITEM_PUBLICATION_TIMING_CHANGED_CONFIRMED'
        : 'LEARNING_ITEM_SCHEDULED',
      'LearningItem',
      id,
      record.courseSubjectId,
    );
    return mapLearningItem(record);
  }

  async publishItem(
    context: AcademicRequestContext,
    id: string,
  ): Promise<object> {
    const scope = this.managerScope(context);
    const current = await this.learningItem(scope, id);
    await this.requireCourseSubjectForMutation(
      context,
      scope,
      current.courseSubjectId,
    );
    if (current.publicationStatus === 'ARCHIVED') {
      throw new ConflictException('An archived learning item is read-only.');
    }
    if (current.publicationStatus === 'PUBLISHED') return mapLearningItem(current);
    const now = new Date();
    const record = await this.prisma.$transaction(async (tx) => {
      const published = await tx.learningItem.update({
        where: { tenantId_id: { tenantId: scope.tenantId, id } },
        data: {
          publicationStatus: 'PUBLISHED',
          publishAt: null,
          publishedAt: now,
          publishedByIdentityUserId: context.principal.identityUserId,
          updatedByIdentityUserId: context.principal.identityUserId,
        },
      });
      if (published.type !== 'MATERIAL') {
        await this.notifications.createLearningPublicationIntent(tx, {
          tenantId: scope.tenantId,
          learningItemId: published.id,
          eventType:
            published.type === 'ASSIGNMENT'
              ? 'ASSIGNMENT_PUBLISHED'
              : published.type === 'ASSESSMENT'
                ? 'ASSESSMENT_PUBLISHED'
                : 'ANNOUNCEMENT_PUBLISHED',
          occurredAt: now,
          notBefore: now,
          requestId: context.requestId,
        });
      }
      return published;
    });
    await this.recordAudit(
      context,
      'LEARNING_ITEM_PUBLISHED',
      'LearningItem',
      id,
      record.courseSubjectId,
    );
    return mapLearningItem(record);
  }

  async archiveItem(
    context: AcademicRequestContext,
    id: string,
  ): Promise<object> {
    const scope = this.managerScope(context);
    const current = await this.learningItem(scope, id);
    await this.requireCourseSubjectForMutation(
      context,
      scope,
      current.courseSubjectId,
    );
    if (current.publicationStatus === 'ARCHIVED') return mapLearningItem(current);
    const record = await this.prisma.learningItem.update({
      where: { tenantId_id: { tenantId: scope.tenantId, id } },
      data: {
        publicationStatus: 'ARCHIVED',
        updatedByIdentityUserId: context.principal.identityUserId,
      },
    });
    await this.recordAudit(
      context,
      'LEARNING_ITEM_ARCHIVED',
      'LearningItem',
      id,
      record.courseSubjectId,
    );
    return mapLearningItem(record);
  }

  async reorderItems(
    context: AcademicRequestContext,
    learningUnitId: string,
    input: ReorderLearning,
  ): Promise<object[]> {
    const scope = this.managerScope(context);
    const unit = await this.learningUnit(scope, learningUnitId);
    await this.requireCourseSubjectForMutation(
      context,
      scope,
      unit.courseSubjectId,
    );
    const records = await this.prisma.learningItem.findMany({
      where: {
        tenantId: scope.tenantId,
        learningUnitId,
        id: { in: input.orderedIds },
      },
      select: { id: true },
    });
    this.requireExactSet(records.map((record) => record.id), input.orderedIds);
    await this.prisma.$transaction(
      input.orderedIds.map((id, sortOrder) =>
        this.prisma.learningItem.update({
          where: { tenantId_id: { tenantId: scope.tenantId, id } },
          data: {
            sortOrder,
            updatedByIdentityUserId: context.principal.identityUserId,
          },
        }),
      ),
    );
    await this.recordAudit(
      context,
      'LEARNING_ITEMS_REORDERED',
      'LearningItem',
      learningUnitId,
      unit.courseSubjectId,
    );
    return this.listItems(context, learningUnitId);
  }

  private managerScope(context: AcademicRequestContext): TenantQueryScope {
    this.authorization.requireCapability(
      context.principal,
      context.tenant,
      TenantCapability.ManageLearningContent,
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

  private async requireCourseSubjectRead(
    context: AcademicRequestContext,
    scope: TenantQueryScope,
    courseSubjectId: string,
  ): Promise<void> {
    if (context.principal.roles.includes('TENANT_ADMIN')) return;
    if (context.principal.roles.includes('TEACHER')) {
      const teacher = await this.currentTeacher(scope, context);
      const assignment = await this.prisma.courseSubjectTeacher.findFirst({
        where: {
          tenantId: scope.tenantId,
          teacherId: teacher.id,
          courseSubjectId,
          status: 'ACTIVE',
        },
      });
      if (!assignment) this.deny();
      return;
    }
    if (context.principal.roles.includes('STUDENT')) {
      const student = await this.currentStudent(scope, context);
      const access = await this.prisma.courseSubject.findFirst({
        where: {
          tenantId: scope.tenantId,
          id: courseSubjectId,
          status: 'ACTIVE',
          OR: [
            {
              defaultForCourse: true,
              course: {
                enrollments: {
                  some: { studentId: student.id, status: 'ACTIVE' },
                },
              },
            },
            {
              directEnrollments: {
                some: { studentId: student.id, status: 'ACTIVE' },
              },
            },
          ],
        },
        select: { id: true },
      });
      if (!access) this.deny();
      return;
    }
    this.deny();
  }

  private async requireCourseSubjectForMutation(
    context: AcademicRequestContext,
    scope: TenantQueryScope,
    courseSubjectId: string,
  ): Promise<void> {
    const courseSubject = await this.courseSubject(scope, courseSubjectId);
    if (courseSubject.status !== 'ACTIVE') {
      throw new ConflictException(
        'Learning content can only be changed for an active CourseSubject.',
      );
    }
    if (context.principal.roles.includes('TENANT_ADMIN')) return;
    await this.requireCourseSubjectRead(context, scope, courseSubjectId);
  }

  private async courseSubject(scope: TenantQueryScope, id: string) {
    const record = await this.prisma.courseSubject.findUnique({
      where: { tenantId_id: { tenantId: scope.tenantId, id } },
    });
    if (!record) this.notFound();
    return record;
  }

  private async learningUnit(scope: TenantQueryScope, id: string) {
    const record = await this.prisma.learningUnit.findUnique({
      where: { tenantId_id: { tenantId: scope.tenantId, id } },
    });
    if (!record) this.notFound();
    return record;
  }

  private async learningUnitWithSubject(
    scope: TenantQueryScope,
    id: string,
  ): Promise<LearningUnitWithSubject> {
    const record = await this.prisma.learningUnit.findUnique({
      where: { tenantId_id: { tenantId: scope.tenantId, id } },
      include: { courseSubject: { select: { status: true } } },
    });
    if (!record) this.notFound();
    return record;
  }

  private async learningItem(scope: TenantQueryScope, id: string) {
    const record = await this.prisma.learningItem.findUnique({
      where: { tenantId_id: { tenantId: scope.tenantId, id } },
    });
    if (!record) this.notFound();
    return record;
  }

  private async learningItemWithUnit(
    scope: TenantQueryScope,
    id: string,
  ): Promise<LearningItemWithUnit> {
    const record = await this.prisma.learningItem.findUnique({
      where: { tenantId_id: { tenantId: scope.tenantId, id } },
      include: { learningUnit: true },
    });
    if (!record) this.notFound();
    return record;
  }

  private async currentTeacher(
    scope: TenantQueryScope,
    context: AcademicRequestContext,
  ) {
    const teacher = await this.prisma.teacher.findFirst({
      where: {
        tenantId: scope.tenantId,
        identityUserId: context.principal.identityUserId,
        status: 'ACTIVE',
      },
    });
    if (!teacher) this.deny();
    return teacher;
  }

  private async currentStudent(
    scope: TenantQueryScope,
    context: AcademicRequestContext,
  ) {
    const student = await this.prisma.student.findFirst({
      where: {
        tenantId: scope.tenantId,
        identityUserId: context.principal.identityUserId,
        status: 'ACTIVE',
      },
    });
    if (!student) this.deny();
    return student;
  }

  private visibleItemWhere(now: Date): Prisma.LearningItemWhereInput {
    return {
      OR: [
        { publicationStatus: 'PUBLISHED' },
        { publicationStatus: 'SCHEDULED', publishAt: { lte: now } },
      ],
    };
  }

  private isVisibleUnit(record: LearningUnit, now: Date): boolean {
    return (
      record.status === 'ACTIVE' &&
      (!record.startAt || record.startAt <= now) &&
      (!record.endAt || record.endAt >= now)
    );
  }

  private isVisibleItem(
    record: LearningItem,
    now: Date,
  ): boolean {
    return (
      record.publicationStatus === 'PUBLISHED' ||
      (record.publicationStatus === 'SCHEDULED' &&
        record.publishAt !== null &&
        record.publishAt <= now)
    );
  }

  private validateItemContent(
    type: LearningItemType,
    instructions: string | null | undefined,
    body: string | null | undefined,
    dueAt: string | null | undefined,
  ): void {
    if (
      (type === 'ASSIGNMENT' || type === 'ASSESSMENT') &&
      !instructions?.trim()
    ) {
      throw new BadRequestException(
        'instructions are required for deliverable items.',
      );
    }
    if (
      (type === 'ASSIGNMENT' || type === 'ASSESSMENT') &&
      !dueAt
    ) {
      throw new BadRequestException('dueAt is required for deliverable items.');
    }
    if (type === 'ANNOUNCEMENT' && !body?.trim()) {
      throw new BadRequestException('body is required for announcements.');
    }
    if (
      (type === 'MATERIAL' || type === 'ANNOUNCEMENT') &&
      dueAt
    ) {
      throw new BadRequestException(
        'dueAt is only valid for deliverable items.',
      );
    }
  }

  private async requireSensitiveConfirmation(
    context: AcademicRequestContext,
    scope: TenantQueryScope,
    current: LearningItem,
    confirmed: boolean,
  ): Promise<void> {
    const hasStudentWork = await this.studentWork.hasStudentWork({
      tenantId: scope.tenantId,
      learningItemId: current.id,
    });
    if (!confirmed) {
      throw new ConflictException(
        hasStudentWork
          ? 'This change could affect historical student evidence; explicit confirmation is required.'
          : 'Published or scheduled content changes require explicit confirmation.',
      );
    }
    await this.recordAudit(
      context,
      hasStudentWork
        ? 'LEARNING_ITEM_SENSITIVE_CHANGE_WITH_STUDENT_WORK_CONFIRMED'
        : 'LEARNING_ITEM_SENSITIVE_CHANGE_CONFIRMED',
      'LearningItem',
      current.id,
      current.courseSubjectId,
    );
  }

  private requireDateRange(
    startAt: string | undefined,
    endAt: string | undefined,
  ): void {
    if (startAt && endAt && this.instant(startAt) > this.instant(endAt)) {
      throw new BadRequestException('startAt must be on or before endAt.');
    }
  }

  private instant(value: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Timestamp must be a valid ISO 8601 instant.');
    }
    return date;
  }

  private requireExactSet(actual: string[], requested: string[]): void {
    if (
      actual.length !== requested.length ||
      actual.some((id) => !requested.includes(id))
    ) {
      this.notFound();
    }
  }

  private async recordAudit(
    context: AcademicRequestContext,
    action: string,
    resourceType: string,
    resourceId: string,
    courseSubjectId?: string,
  ): Promise<void> {
    const event: AcademicAuditEvent = {
      action,
      context,
      resourceId,
      resourceType,
      ...(courseSubjectId !== undefined ? { courseSubjectId } : {}),
    };
    await this.audit.record(event);
  }

  private deny(): never {
    throw new ForbiddenException('The requested action is not authorized.');
  }

  private notFound(): never {
    throw new NotFoundException('The requested learning resource was not found.');
  }
}
