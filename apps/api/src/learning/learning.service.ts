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
  DuplicateLearningItem,
  DuplicateLearningUnit,
  MoveLearningItem,
  PublishLearningItemDraft,
  ReorderLearning,
  RestoreRevision,
  SaveLearningItemDraft,
  ScheduleLearningItem,
  UpdateLearningItem,
  UpdateLearningUnit,
} from '@edupay/contracts';

import { AuthorizationService } from '../authorization/authorization.service';
import { TenantCapability } from '../authorization/authorization.types';
import type {
  ContentEntityType,
  ContentRevisionOperation,
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
  mapContentRevision,
  mapLearningItem,
  mapLearningItemDraft,
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
    const record = await this.prisma.$transaction(async (tx) => {
      const created = await tx.learningUnit.create({
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
      await this.recordRevision(tx, {
        tenantId: scope.tenantId,
        entityType: 'LEARNING_UNIT',
        entityId: created.id,
        revisionNumber: created.version,
        operation: 'CREATED',
        snapshot: mapLearningUnit(created),
        context,
      });
      return created;
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
    const record = await this.prisma.$transaction(async (tx) => {
      const updated = await this.applyVersionedUnitUpdate(tx, scope.tenantId, id, input.expectedRevision, {
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
      });
      await this.recordRevision(tx, {
        tenantId: scope.tenantId,
        entityType: 'LEARNING_UNIT',
        entityId: id,
        revisionNumber: updated.version,
        operation: 'UPDATED',
        snapshot: mapLearningUnit(updated),
        context,
      });
      return updated;
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
    const record = await this.prisma.$transaction(async (tx) => {
      const archived = await tx.learningUnit.update({
        where: { tenantId_id: { tenantId: scope.tenantId, id } },
        data: { status: 'ARCHIVED', version: { increment: 1 } },
      });
      await this.recordRevision(tx, {
        tenantId: scope.tenantId,
        entityType: 'LEARNING_UNIT',
        entityId: id,
        revisionNumber: archived.version,
        operation: 'ARCHIVED',
        snapshot: mapLearningUnit(archived),
        context,
      });
      return archived;
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

  async duplicateUnit(
    context: AcademicRequestContext,
    id: string,
    input?: DuplicateLearningUnit,
  ): Promise<object> {
    const scope = this.managerScope(context);
    const current = await this.learningUnitWithSubject(scope, id);
    await this.requireCourseSubjectForMutation(
      context,
      scope,
      current.courseSubjectId,
    );

    const highestUnit = await this.prisma.learningUnit.findFirst({
      where: { tenantId: scope.tenantId, courseSubjectId: current.courseSubjectId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    const nextSortOrder = (highestUnit?.sortOrder ?? -1) + 1;

    const title = input?.title?.trim() || `${current.title} (Copia)`;
    const duplicateItems = input?.duplicateItems ?? true;

    const itemsToDuplicate = duplicateItems
      ? await this.prisma.learningItem.findMany({
          where: { tenantId: scope.tenantId, learningUnitId: id },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        })
      : [];

    const record = await this.prisma.$transaction(async (tx) => {
      const createdUnit = await tx.learningUnit.create({
        data: {
          tenantId: scope.tenantId,
          courseSubjectId: current.courseSubjectId,
          title,
          description: current.description,
          sortOrder: nextSortOrder,
          startAt: current.startAt,
          endAt: current.endAt,
          status: 'DRAFT',
          version: 1,
        },
      });

      await this.recordRevision(tx, {
        tenantId: scope.tenantId,
        entityType: 'LEARNING_UNIT',
        entityId: createdUnit.id,
        revisionNumber: createdUnit.version,
        operation: 'DUPLICATED',
        snapshot: mapLearningUnit(createdUnit),
        context,
      });

      for (const item of itemsToDuplicate) {
        const createdItem = await tx.learningItem.create({
          data: {
            tenantId: scope.tenantId,
            courseSubjectId: current.courseSubjectId,
            learningUnitId: createdUnit.id,
            type: item.type,
            title: item.title,
            description: item.description,
            content: item.content,
            instructions: item.instructions,
            body: item.body,
            sortOrder: item.sortOrder,
            publicationStatus: 'DRAFT',
            publishAt: null,
            publishedAt: null,
            publishedByIdentityUserId: null,
            dueAt: item.dueAt,
            createdByIdentityUserId: context.principal.identityUserId,
            version: 1,
          },
        });

        const itemRefs = await tx.fileReference.findMany({
          where: {
            tenantId: scope.tenantId,
            referenceType: 'LEARNING_ITEM',
            learningItemId: item.id,
            fileObject: { lifecycle: 'AVAILABLE' },
          },
        });

        for (const ref of itemRefs) {
          await tx.fileReference.create({
            data: {
              tenantId: scope.tenantId,
              fileObjectId: ref.fileObjectId,
              referenceType: 'LEARNING_ITEM',
              learningItemId: createdItem.id,
              category: ref.category,
              createdByIdentityUserId: context.principal.identityUserId,
            },
          });
        }

        await this.recordRevision(tx, {
          tenantId: scope.tenantId,
          entityType: 'LEARNING_ITEM',
          entityId: createdItem.id,
          revisionNumber: createdItem.version,
          operation: 'DUPLICATED',
          snapshot: mapLearningItem(createdItem),
          context,
        });
      }

      return createdUnit;
    });

    await this.recordAudit(
      context,
      'LEARNING_UNIT_DUPLICATED',
      'LearningUnit',
      record.id,
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
    await this.prisma.$transaction(async (tx) => {
      for (const [sortOrder, id] of input.orderedIds.entries()) {
        const updated = await tx.learningUnit.update({
          where: { tenantId_id: { tenantId: scope.tenantId, id } },
          data: { sortOrder, version: { increment: 1 } },
        });
        await this.recordRevision(tx, {
          tenantId: scope.tenantId,
          entityType: 'LEARNING_UNIT',
          entityId: id,
          revisionNumber: updated.version,
          operation: 'REORDERED',
          snapshot: mapLearningUnit(updated),
          context,
        });
      }
    });
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
    const record = await this.prisma.$transaction(async (tx) => {
      const created = await tx.learningItem.create({
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
      await this.recordRevision(tx, {
        tenantId: scope.tenantId,
        entityType: 'LEARNING_ITEM',
        entityId: created.id,
        revisionNumber: created.version,
        operation: 'CREATED',
        snapshot: mapLearningItem(created),
        context,
      });
      return created;
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
    const contentFieldChanged =
      input.title !== undefined ||
      input.description !== undefined ||
      input.content !== undefined ||
      input.instructions !== undefined ||
      input.body !== undefined ||
      input.dueAt !== undefined;
    if (contentFieldChanged && this.isEffectivelyVisible(current, new Date())) {
      throw new ConflictException({
        code: 'PUBLISHED_CONTENT_REQUIRES_DRAFT',
        message:
          'Este contenido ya es visible para estudiantes. Usa el borrador de trabajo para editarlo sin afectar lo publicado.',
      });
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

    const record = await this.prisma.$transaction(async (tx) => {
      const updated = await this.applyVersionedItemUpdate(tx, scope.tenantId, id, input.expectedRevision, {
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
      });
      await this.recordRevision(tx, {
        tenantId: scope.tenantId,
        entityType: 'LEARNING_ITEM',
        entityId: id,
        revisionNumber: updated.version,
        operation: sensitiveChange ? 'SENSITIVE_CHANGE_CONFIRMED' : 'UPDATED',
        snapshot: mapLearningItem(updated),
        context,
      });
      return updated;
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

  /**
   * Safe working-draft model for published content (see ADR-0012 follow-up):
   * once a LearningItem is effectively visible to students (PUBLISHED, or
   * SCHEDULED with publishAt already in the past), content-field edits must
   * go through these draft endpoints rather than updateItem, which now
   * refuses direct content edits in that state. Non-content fields (type,
   * sortOrder) remain directly editable via updateItem regardless of
   * visibility, since they are structural rather than authored content.
   */
  async saveDraft(
    context: AcademicRequestContext,
    id: string,
    input: SaveLearningItemDraft,
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
    this.requireExpectedRevision(current.version, input.expectedRevision);
    // A draft is always a COMPLETE content snapshot, never a sparse patch:
    // fields the caller didn't touch on first save are seeded from the
    // current live item, not left null, so "not set" is never confused with
    // "explicitly cleared" on a later save or on publish.
    const draft = await this.prisma.learningItemDraft.upsert({
      where: { tenantId_learningItemId: { tenantId: scope.tenantId, learningItemId: id } },
      create: {
        tenantId: scope.tenantId,
        learningItemId: id,
        title: input.title ?? current.title,
        description: input.description !== undefined ? input.description : current.description,
        content: input.content !== undefined ? input.content : current.content,
        instructions: input.instructions !== undefined ? input.instructions : current.instructions,
        body: input.body !== undefined ? input.body : current.body,
        dueAt: input.dueAt !== undefined ? (input.dueAt ? this.instant(input.dueAt) : null) : current.dueAt,
        basedOnVersion: current.version,
        updatedByIdentityUserId: context.principal.identityUserId,
      },
      update: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.dueAt !== undefined
          ? { dueAt: input.dueAt ? this.instant(input.dueAt) : null }
          : {}),
        basedOnVersion: current.version,
        updatedByIdentityUserId: context.principal.identityUserId,
      },
    });
    await this.recordAudit(context, 'LEARNING_ITEM_DRAFT_SAVED', 'LearningItem', id, current.courseSubjectId);
    return mapLearningItemDraft(draft);
  }

  async getDraft(context: AcademicRequestContext, id: string): Promise<object> {
    const scope = this.managerScope(context);
    const current = await this.learningItem(scope, id);
    await this.requireCourseSubjectForMutation(context, scope, current.courseSubjectId);
    const draft = await this.prisma.learningItemDraft.findUnique({
      where: { tenantId_learningItemId: { tenantId: scope.tenantId, learningItemId: id } },
    });
    return { draft: draft ? mapLearningItemDraft(draft) : null };
  }

  async discardDraft(context: AcademicRequestContext, id: string): Promise<void> {
    const scope = this.managerScope(context);
    const current = await this.learningItem(scope, id);
    await this.requireCourseSubjectForMutation(context, scope, current.courseSubjectId);
    await this.prisma.$transaction(async (tx) => {
      const draft = await tx.learningItemDraft.findUnique({
        where: { tenantId_learningItemId: { tenantId: scope.tenantId, learningItemId: id } },
      });
      if (!draft) return;
      await tx.learningItemDraft.delete({
        where: { tenantId_learningItemId: { tenantId: scope.tenantId, learningItemId: id } },
      });
      const updated = await tx.learningItem.update({
        where: { tenantId_id: { tenantId: scope.tenantId, id } },
        data: { version: { increment: 1 } },
      });
      await this.recordRevision(tx, {
        tenantId: scope.tenantId,
        entityType: 'LEARNING_ITEM',
        entityId: id,
        revisionNumber: updated.version,
        operation: 'DRAFT_DISCARDED',
        snapshot: mapLearningItemDraft(draft),
        context,
      });
    });
    await this.recordAudit(context, 'LEARNING_ITEM_DRAFT_DISCARDED', 'LearningItem', id, current.courseSubjectId);
  }

  /**
   * Atomically replaces the live LearningItem's content fields with the
   * draft's, in one transaction: the published version students see never
   * has a moment where it is partially updated or briefly inconsistent.
   */
  async publishDraft(
    context: AcademicRequestContext,
    id: string,
    input: PublishLearningItemDraft,
  ): Promise<object> {
    const scope = this.managerScope(context);
    const current = await this.learningItemWithUnit(scope, id);
    await this.requireCourseSubjectForMutation(context, scope, current.courseSubjectId);
    if (current.publicationStatus === 'ARCHIVED') {
      throw new ConflictException('An archived learning item is read-only.');
    }
    const draft = await this.prisma.learningItemDraft.findUnique({
      where: { tenantId_learningItemId: { tenantId: scope.tenantId, learningItemId: id } },
    });
    if (!draft) this.notFound();

    this.validateItemContent(
      current.type,
      draft.instructions ?? undefined,
      draft.body ?? undefined,
      draft.dueAt ? draft.dueAt.toISOString() : undefined,
    );
    const sensitiveChange = current.publicationStatus !== 'DRAFT';
    if (sensitiveChange) {
      await this.requireSensitiveConfirmation(context, scope, current, input.confirmSensitiveChange);
    }

    const record = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.learningItem.update({
        where: { tenantId_id: { tenantId: scope.tenantId, id } },
        data: {
          title: draft.title ?? current.title,
          description: draft.description,
          content: draft.content,
          instructions: draft.instructions,
          body: draft.body,
          dueAt: draft.dueAt,
          updatedByIdentityUserId: context.principal.identityUserId,
          version: { increment: 1 },
        },
      });
      await tx.learningItemDraft.delete({
        where: { tenantId_learningItemId: { tenantId: scope.tenantId, learningItemId: id } },
      });
      await this.recordRevision(tx, {
        tenantId: scope.tenantId,
        entityType: 'LEARNING_ITEM',
        entityId: id,
        revisionNumber: updated.version,
        operation: 'DRAFT_PUBLISHED',
        snapshot: mapLearningItem(updated),
        context,
      });
      return updated;
    });
    await this.recordAudit(context, 'LEARNING_ITEM_DRAFT_PUBLISHED', 'LearningItem', id, record.courseSubjectId);
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
    const record = await this.prisma.$transaction(async (tx) => {
      const updated = await this.applyVersionedItemUpdate(tx, scope.tenantId, id, input.expectedRevision, {
        publicationStatus: 'SCHEDULED',
        publishAt,
        publishedAt: null,
        publishedByIdentityUserId: null,
        updatedByIdentityUserId: context.principal.identityUserId,
      });
      await this.recordRevision(tx, {
        tenantId: scope.tenantId,
        entityType: 'LEARNING_ITEM',
        entityId: id,
        revisionNumber: updated.version,
        operation: 'SCHEDULED',
        snapshot: mapLearningItem(updated),
        context,
      });
      return updated;
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
          version: { increment: 1 },
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
      await this.recordRevision(tx, {
        tenantId: scope.tenantId,
        entityType: 'LEARNING_ITEM',
        entityId: id,
        revisionNumber: published.version,
        operation: 'PUBLISHED',
        snapshot: mapLearningItem(published),
        context,
      });
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
    const record = await this.prisma.$transaction(async (tx) => {
      const archived = await tx.learningItem.update({
        where: { tenantId_id: { tenantId: scope.tenantId, id } },
        data: {
          publicationStatus: 'ARCHIVED',
          updatedByIdentityUserId: context.principal.identityUserId,
          version: { increment: 1 },
        },
      });
      await this.recordRevision(tx, {
        tenantId: scope.tenantId,
        entityType: 'LEARNING_ITEM',
        entityId: id,
        revisionNumber: archived.version,
        operation: 'ARCHIVED',
        snapshot: mapLearningItem(archived),
        context,
      });
      return archived;
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

  async unpublishItem(
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
    if (current.publicationStatus === 'DRAFT') {
      return mapLearningItem(current);
    }
    const record = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.learningItem.update({
        where: { tenantId_id: { tenantId: scope.tenantId, id } },
        data: {
          publicationStatus: 'DRAFT',
          publishAt: null,
          publishedAt: null,
          publishedByIdentityUserId: null,
          updatedByIdentityUserId: context.principal.identityUserId,
          version: { increment: 1 },
        },
      });
      await this.recordRevision(tx, {
        tenantId: scope.tenantId,
        entityType: 'LEARNING_ITEM',
        entityId: id,
        revisionNumber: updated.version,
        operation: 'UNPUBLISHED',
        snapshot: mapLearningItem(updated),
        context,
      });
      return updated;
    });
    await this.recordAudit(
      context,
      'LEARNING_ITEM_UNPUBLISHED',
      'LearningItem',
      id,
      record.courseSubjectId,
    );
    return mapLearningItem(record);
  }

  async moveItem(
    context: AcademicRequestContext,
    id: string,
    input: MoveLearningItem,
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
    if (current.learningUnitId === input.targetLearningUnitId) {
      return mapLearningItem(current);
    }
    const targetUnit = await this.learningUnit(scope, input.targetLearningUnitId);
    if (targetUnit.status === 'ARCHIVED') {
      throw new ConflictException('Cannot move an item to an archived unit.');
    }
    await this.requireCourseSubjectForMutation(
      context,
      scope,
      targetUnit.courseSubjectId,
    );

    const highestInTarget = await this.prisma.learningItem.findFirst({
      where: { tenantId: scope.tenantId, learningUnitId: input.targetLearningUnitId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    const nextSortOrder = (highestInTarget?.sortOrder ?? -1) + 1;

    const record = await this.prisma.$transaction(async (tx) => {
      const updated = await this.applyVersionedItemUpdate(
        tx,
        scope.tenantId,
        id,
        input.expectedRevision,
        {
          learningUnitId: input.targetLearningUnitId,
          courseSubjectId: targetUnit.courseSubjectId,
          sortOrder: nextSortOrder,
          updatedByIdentityUserId: context.principal.identityUserId,
        },
      );
      await this.recordRevision(tx, {
        tenantId: scope.tenantId,
        entityType: 'LEARNING_ITEM',
        entityId: id,
        revisionNumber: updated.version,
        operation: 'MOVED',
        snapshot: mapLearningItem(updated),
        context,
      });
      return updated;
    });
    await this.recordAudit(
      context,
      'LEARNING_ITEM_MOVED',
      'LearningItem',
      id,
      record.courseSubjectId,
    );
    return mapLearningItem(record);
  }

  async duplicateItem(
    context: AcademicRequestContext,
    id: string,
    input?: DuplicateLearningItem,
  ): Promise<object> {
    const scope = this.managerScope(context);
    const current = await this.learningItem(scope, id);
    await this.requireCourseSubjectForMutation(
      context,
      scope,
      current.courseSubjectId,
    );
    const targetUnitId = input?.targetLearningUnitId ?? current.learningUnitId;
    const targetUnit = await this.learningUnit(scope, targetUnitId);
    if (targetUnit.status === 'ARCHIVED') {
      throw new ConflictException('Cannot duplicate an item into an archived unit.');
    }
    await this.requireCourseSubjectForMutation(
      context,
      scope,
      targetUnit.courseSubjectId,
    );

    const highestInTarget = await this.prisma.learningItem.findFirst({
      where: { tenantId: scope.tenantId, learningUnitId: targetUnitId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    const nextSortOrder = (highestInTarget?.sortOrder ?? -1) + 1;

    const title = input?.title?.trim() || `${current.title} (Copia)`;

    const sourceReferences = await this.prisma.fileReference.findMany({
      where: {
        tenantId: scope.tenantId,
        referenceType: 'LEARNING_ITEM',
        learningItemId: id,
        fileObject: { lifecycle: 'AVAILABLE' },
      },
    });

    const record = await this.prisma.$transaction(async (tx) => {
      const created = await tx.learningItem.create({
        data: {
          tenantId: scope.tenantId,
          courseSubjectId: targetUnit.courseSubjectId,
          learningUnitId: targetUnitId,
          type: current.type,
          title,
          description: current.description,
          content: current.content,
          instructions: current.instructions,
          body: current.body,
          sortOrder: nextSortOrder,
          publicationStatus: 'DRAFT',
          publishAt: null,
          publishedAt: null,
          publishedByIdentityUserId: null,
          dueAt: current.dueAt,
          createdByIdentityUserId: context.principal.identityUserId,
          version: 1,
        },
      });

      for (const ref of sourceReferences) {
        await tx.fileReference.create({
          data: {
            tenantId: scope.tenantId,
            fileObjectId: ref.fileObjectId,
            referenceType: 'LEARNING_ITEM',
            learningItemId: created.id,
            category: ref.category,
            createdByIdentityUserId: context.principal.identityUserId,
          },
        });
      }

      await this.recordRevision(tx, {
        tenantId: scope.tenantId,
        entityType: 'LEARNING_ITEM',
        entityId: created.id,
        revisionNumber: created.version,
        operation: 'DUPLICATED',
        snapshot: mapLearningItem(created),
        context,
      });
      return created;
    });

    await this.recordAudit(
      context,
      'LEARNING_ITEM_DUPLICATED',
      'LearningItem',
      record.id,
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
    await this.prisma.$transaction(async (tx) => {
      for (const [sortOrder, id] of input.orderedIds.entries()) {
        const updated = await tx.learningItem.update({
          where: { tenantId_id: { tenantId: scope.tenantId, id } },
          data: {
            sortOrder,
            updatedByIdentityUserId: context.principal.identityUserId,
            version: { increment: 1 },
          },
        });
        await this.recordRevision(tx, {
          tenantId: scope.tenantId,
          entityType: 'LEARNING_ITEM',
          entityId: id,
          revisionNumber: updated.version,
          operation: 'REORDERED',
          snapshot: mapLearningItem(updated),
          context,
        });
      }
    });
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

  /**
   * True once student visibility no longer depends on a future event: either
   * already PUBLISHED, or SCHEDULED with publishAt already in the past (see
   * visibleItemWhere / isVisibleItem - the same effective-visibility rule
   * applies here so a direct edit can never race a scheduled auto-publish).
   */
  private isEffectivelyVisible(item: LearningItem, now: Date): boolean {
    return this.isVisibleItem(item, now);
  }

  private requireExpectedRevision(
    currentVersion: number,
    expectedRevision: number | undefined,
  ): void {
    if (expectedRevision !== undefined && expectedRevision !== currentVersion) {
      this.throwStaleRevision();
    }
  }

  private throwStaleRevision(): never {
    throw new ConflictException({
      code: 'STALE_REVISION',
      message: 'Este contenido cambió en otra sesión.',
    });
  }

  /**
   * Atomically checks expectedRevision and applies the update in one
   * round-trip: the WHERE clause (not a separate read-then-write) is what
   * actually prevents a lost update between two concurrent requests.
   */
  private async applyVersionedUnitUpdate(
    tx: Prisma.TransactionClient,
    tenantId: string,
    id: string,
    expectedRevision: number | undefined,
    data: Prisma.LearningUnitUpdateManyMutationInput,
  ): Promise<LearningUnit> {
    const result = await tx.learningUnit.updateMany({
      where: {
        tenantId,
        id,
        ...(expectedRevision !== undefined ? { version: expectedRevision } : {}),
      },
      data: { ...data, version: { increment: 1 } },
    });
    if (result.count === 0) this.throwStaleRevision();
    return tx.learningUnit.findUniqueOrThrow({ where: { tenantId_id: { tenantId, id } } });
  }

  private async applyVersionedItemUpdate(
    tx: Prisma.TransactionClient,
    tenantId: string,
    id: string,
    expectedRevision: number | undefined,
    data: Prisma.LearningItemUncheckedUpdateManyInput,
  ): Promise<LearningItem> {
    const result = await tx.learningItem.updateMany({
      where: {
        tenantId,
        id,
        ...(expectedRevision !== undefined ? { version: expectedRevision } : {}),
      },
      data: { ...data, version: { increment: 1 } },
    });
    if (result.count === 0) this.throwStaleRevision();
    return tx.learningItem.findUniqueOrThrow({ where: { tenantId_id: { tenantId, id } } });
  }

  /**
   * Every mutation that matters creates one immutable ContentRevision row.
   * Revisions are never edited or deleted - restoring an old one creates a
   * new revision (operation RESTORED) instead of rewriting history.
   */
  private async recordRevision(
    tx: Prisma.TransactionClient,
    params: {
      tenantId: string;
      entityType: ContentEntityType;
      entityId: string;
      revisionNumber: number;
      operation: ContentRevisionOperation;
      snapshot: object;
      context: AcademicRequestContext;
      restoredFromRevision?: number;
    },
  ): Promise<void> {
    await tx.contentRevision.create({
      data: {
        tenantId: params.tenantId,
        entityType: params.entityType,
        entityId: params.entityId,
        revisionNumber: params.revisionNumber,
        operation: params.operation,
        snapshot: params.snapshot as Prisma.InputJsonValue,
        actorIdentityUserId: params.context.principal.identityUserId,
        requestId: params.context.requestId,
        restoredFromRevision: params.restoredFromRevision ?? null,
      },
    });
  }

  async listUnitHistory(
    context: AcademicRequestContext,
    id: string,
  ): Promise<object[]> {
    const scope = this.managerScope(context);
    const current = await this.learningUnit(scope, id);
    await this.requireCourseSubjectForMutation(context, scope, current.courseSubjectId);
    return this.listRevisions(scope.tenantId, 'LEARNING_UNIT', id);
  }

  async listItemHistory(
    context: AcademicRequestContext,
    id: string,
  ): Promise<object[]> {
    const scope = this.managerScope(context);
    const current = await this.learningItem(scope, id);
    await this.requireCourseSubjectForMutation(context, scope, current.courseSubjectId);
    return this.listRevisions(scope.tenantId, 'LEARNING_ITEM', id);
  }

  private async listRevisions(
    tenantId: string,
    entityType: ContentEntityType,
    entityId: string,
  ): Promise<object[]> {
    const revisions = await this.prisma.contentRevision.findMany({
      where: { tenantId, entityType, entityId },
      orderBy: { revisionNumber: 'desc' },
    });
    return revisions.map(mapContentRevision);
  }

  /**
   * Restoring never deletes or rewrites history: it reads an old snapshot's
   * content fields and applies them as a brand-new revision. Only content
   * fields are restored (title/description/timing for units;
   * title/description/content/instructions/body/dueAt for items) -
   * publication/lifecycle state is never time-travelled by a restore, so a
   * teacher cannot accidentally un-publish or un-archive content this way.
   */
  async restoreUnitRevision(
    context: AcademicRequestContext,
    id: string,
    revisionNumber: number,
    input: RestoreRevision,
  ): Promise<object> {
    const scope = this.managerScope(context);
    const current = await this.learningUnitWithSubject(scope, id);
    await this.requireCourseSubjectForMutation(context, scope, current.courseSubjectId);
    if (current.status === 'ARCHIVED') {
      throw new ConflictException('An archived learning unit is read-only.');
    }
    const revision = await this.prisma.contentRevision.findUnique({
      where: {
        tenantId_entityType_entityId_revisionNumber: {
          tenantId: scope.tenantId,
          entityType: 'LEARNING_UNIT',
          entityId: id,
          revisionNumber,
        },
      },
    });
    if (!revision) this.notFound();
    const snapshot = revision.snapshot as Record<string, unknown>;
    this.requireDateRange(
      typeof snapshot.startAt === 'string' ? snapshot.startAt : undefined,
      typeof snapshot.endAt === 'string' ? snapshot.endAt : undefined,
    );

    const record = await this.prisma.$transaction(async (tx) => {
      const updated = await this.applyVersionedUnitUpdate(tx, scope.tenantId, id, input.expectedRevision, {
        title: typeof snapshot.title === 'string' ? snapshot.title : current.title,
        description: typeof snapshot.description === 'string' ? snapshot.description : null,
        startAt: typeof snapshot.startAt === 'string' ? new Date(snapshot.startAt) : null,
        endAt: typeof snapshot.endAt === 'string' ? new Date(snapshot.endAt) : null,
      });
      await this.recordRevision(tx, {
        tenantId: scope.tenantId,
        entityType: 'LEARNING_UNIT',
        entityId: id,
        revisionNumber: updated.version,
        operation: 'RESTORED',
        snapshot: mapLearningUnit(updated),
        context,
        restoredFromRevision: revisionNumber,
      });
      return updated;
    });
    await this.recordAudit(context, 'LEARNING_UNIT_RESTORED', 'LearningUnit', id, record.courseSubjectId);
    return mapLearningUnit(record);
  }

  /**
   * Restoring a revision of a LearningItem that is currently effectively
   * visible to students goes through the same working-draft gate as
   * updateItem: it never mutates the live item directly, it seeds a draft
   * with the old content so the teacher can review/publish it explicitly.
   */
  async restoreItemRevision(
    context: AcademicRequestContext,
    id: string,
    revisionNumber: number,
    input: RestoreRevision,
  ): Promise<object> {
    const scope = this.managerScope(context);
    const current = await this.learningItemWithUnit(scope, id);
    await this.requireCourseSubjectForMutation(context, scope, current.courseSubjectId);
    if (current.publicationStatus === 'ARCHIVED') {
      throw new ConflictException('An archived learning item is read-only.');
    }
    const revision = await this.prisma.contentRevision.findUnique({
      where: {
        tenantId_entityType_entityId_revisionNumber: {
          tenantId: scope.tenantId,
          entityType: 'LEARNING_ITEM',
          entityId: id,
          revisionNumber,
        },
      },
    });
    if (!revision) this.notFound();
    const snapshot = revision.snapshot as Record<string, unknown>;
    const restoredContent: SaveLearningItemDraft = {
      title: typeof snapshot.title === 'string' ? snapshot.title : undefined,
      description: typeof snapshot.description === 'string' ? snapshot.description : null,
      content: typeof snapshot.content === 'string' ? snapshot.content : null,
      instructions: typeof snapshot.instructions === 'string' ? snapshot.instructions : null,
      body: typeof snapshot.body === 'string' ? snapshot.body : null,
      dueAt: typeof snapshot.dueAt === 'string' ? snapshot.dueAt : null,
      expectedRevision: input.expectedRevision,
    };

    if (this.isEffectivelyVisible(current, new Date())) {
      return this.saveDraft(context, id, restoredContent);
    }

    this.validateItemContent(
      current.type,
      restoredContent.instructions ?? undefined,
      restoredContent.body ?? undefined,
      restoredContent.dueAt ?? undefined,
    );
    const record = await this.prisma.$transaction(async (tx) => {
      const updated = await this.applyVersionedItemUpdate(tx, scope.tenantId, id, input.expectedRevision, {
        title: restoredContent.title ?? current.title,
        description: restoredContent.description ?? null,
        content: restoredContent.content ?? null,
        instructions: restoredContent.instructions ?? null,
        body: restoredContent.body ?? null,
        dueAt: restoredContent.dueAt ? this.instant(restoredContent.dueAt) : null,
        updatedByIdentityUserId: context.principal.identityUserId,
      });
      await this.recordRevision(tx, {
        tenantId: scope.tenantId,
        entityType: 'LEARNING_ITEM',
        entityId: id,
        revisionNumber: updated.version,
        operation: 'RESTORED',
        snapshot: mapLearningItem(updated),
        context,
        restoredFromRevision: revisionNumber,
      });
      return updated;
    });
    await this.recordAudit(context, 'LEARNING_ITEM_RESTORED', 'LearningItem', id, record.courseSubjectId);
    return mapLearningItem(record);
  }
}
