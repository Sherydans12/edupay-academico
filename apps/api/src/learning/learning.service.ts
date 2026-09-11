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
  LearningBodyDocument,
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
import {
  Prisma,
  type ContentEntityType,
  type ContentRevisionOperation,
  type LearningItem,
  type LearningItemType,
  type LearningUnit,
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
import {
  SparseOrderingService,
  SPARSE_ORDER_STEP,
} from './ordering/sparse-ordering.service';
import { CommandIdempotencyService } from './idempotency/command-idempotency.service';
import {
  assertBodyDocumentReferences,
  bodyDocumentHasMeaningfulContent,
  bodyDocumentToLegacyText,
  parsePersistedBodyDocument,
} from './body-document';

type LearningUnitWithSubject = LearningUnit & {
  courseSubject: { status: string };
};
type LearningItemWithUnit = LearningItem & {
  learningUnit: LearningUnit;
};

function bodyDocumentForPersistence(
  document: LearningBodyDocument | null | undefined,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  return document === null || document === undefined
    ? Prisma.JsonNull
    : (document as unknown as Prisma.InputJsonValue);
}

function legacyFieldsForBodyDocument(
  type: LearningItemType,
  document: LearningBodyDocument | null | undefined,
): Record<string, string | null> {
  const legacyText = bodyDocumentToLegacyText(document);
  if (type === 'MATERIAL') return { content: legacyText };
  if (type === 'ASSIGNMENT' || type === 'ASSESSMENT') {
    return { instructions: legacyText };
  }
  return { body: legacyText };
}

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
    private readonly ordering: SparseOrderingService,
    private readonly idempotency: CommandIdempotencyService,
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

    const execution = await this.idempotency.execute({
      tenantId: scope.tenantId,
      actorIdentityUserId: context.principal.identityUserId,
      commandName: 'CREATE_UNIT',
      idempotencyKey: context.idempotencyKey,
      payload: input,
      action: async (tx) => {
        let sortOrder = input.sortOrder;
        if (sortOrder === 0) {
          const highestUnit = await tx.learningUnit.findFirst({
            where: {
              tenantId: scope.tenantId,
              courseSubjectId: input.courseSubjectId,
            },
            orderBy: { sortOrder: 'desc' },
            select: { sortOrder: true },
          });
          sortOrder = this.ordering.computeNextEndPosition(
            highestUnit?.sortOrder,
          );
        }

        const created = await tx.learningUnit.create({
          data: {
            tenantId: scope.tenantId,
            courseSubjectId: input.courseSubjectId,
            title: input.title,
            description: input.description ?? null,
            sortOrder,
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

        return { status: 201, data: mapLearningUnit(created) };
      },
    });

    await this.recordAudit(
      context,
      'LEARNING_UNIT_CREATED',
      'LearningUnit',
      (execution.data as { id: string }).id,
      input.courseSubjectId,
    );
    return execution.data;
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

  async getUnit(context: AcademicRequestContext, id: string): Promise<object> {
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
      throw new ConflictException(
        'Use the archive endpoint for learning units.',
      );
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

    const execution = await this.idempotency.execute({
      tenantId: scope.tenantId,
      actorIdentityUserId: context.principal.identityUserId,
      commandName: 'UPDATE_UNIT',
      idempotencyKey: context.idempotencyKey,
      payload: { id, ...input },
      action: async (tx) => {
        const updated = await this.applyVersionedUnitUpdate(
          tx,
          scope.tenantId,
          id,
          input.expectedRevision,
          {
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
        );
        await this.recordRevision(tx, {
          tenantId: scope.tenantId,
          entityType: 'LEARNING_UNIT',
          entityId: id,
          revisionNumber: updated.version,
          operation: 'UPDATED',
          snapshot: mapLearningUnit(updated),
          context,
        });
        return { status: 200, data: mapLearningUnit(updated) };
      },
    });

    await this.recordAudit(
      context,
      'LEARNING_UNIT_UPDATED',
      'LearningUnit',
      id,
      current.courseSubjectId,
    );
    return execution.data;
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

    const execution = await this.idempotency.execute({
      tenantId: scope.tenantId,
      actorIdentityUserId: context.principal.identityUserId,
      commandName: 'ARCHIVE_UNIT',
      idempotencyKey: context.idempotencyKey,
      payload: { id },
      action: async (tx) => {
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
        return { status: 200, data: mapLearningUnit(archived) };
      },
    });

    await this.recordAudit(
      context,
      'LEARNING_UNIT_ARCHIVED',
      'LearningUnit',
      id,
      current.courseSubjectId,
    );
    return execution.data;
  }

  async restoreArchivedUnit(
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
    if (current.status !== 'ARCHIVED') return mapLearningUnit(current);

    const execution = await this.idempotency.execute({
      tenantId: scope.tenantId,
      actorIdentityUserId: context.principal.identityUserId,
      commandName: 'RESTORE_UNIT',
      idempotencyKey: context.idempotencyKey,
      payload: { id },
      action: async (tx) => {
        const restored = await tx.learningUnit.update({
          where: { tenantId_id: { tenantId: scope.tenantId, id } },
          data: { status: 'DRAFT', version: { increment: 1 } },
        });
        await this.recordRevision(tx, {
          tenantId: scope.tenantId,
          entityType: 'LEARNING_UNIT',
          entityId: id,
          revisionNumber: restored.version,
          operation: 'RESTORED',
          snapshot: mapLearningUnit(restored),
          context,
        });
        return { status: 200, data: mapLearningUnit(restored) };
      },
    });

    await this.recordAudit(
      context,
      'LEARNING_UNIT_RESTORED',
      'LearningUnit',
      id,
      current.courseSubjectId,
    );
    return execution.data;
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

    const title = input?.title?.trim() || `${current.title} (Copia)`;
    const duplicateItems = input?.duplicateItems ?? true;

    const execution = await this.idempotency.execute({
      tenantId: scope.tenantId,
      actorIdentityUserId: context.principal.identityUserId,
      commandName: 'DUPLICATE_UNIT',
      idempotencyKey: context.idempotencyKey,
      payload: { id, ...input },
      action: async (tx) => {
        const highestUnit = await tx.learningUnit.findFirst({
          where: {
            tenantId: scope.tenantId,
            courseSubjectId: current.courseSubjectId,
          },
          orderBy: { sortOrder: 'desc' },
          select: { sortOrder: true },
        });
        const nextSortOrder = this.ordering.computeNextEndPosition(
          highestUnit?.sortOrder,
        );

        const itemsToDuplicate = duplicateItems
          ? await tx.learningItem.findMany({
              where: { tenantId: scope.tenantId, learningUnitId: id },
              orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            })
          : [];

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
              bodyDocument: bodyDocumentForPersistence(
                parsePersistedBodyDocument(item.bodyDocument),
              ),
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

        return { status: 201, data: mapLearningUnit(createdUnit) };
      },
    });

    await this.recordAudit(
      context,
      'LEARNING_UNIT_DUPLICATED',
      'LearningUnit',
      (execution.data as { id: string }).id,
      current.courseSubjectId,
    );
    return execution.data;
  }

  async reorderUnits(
    context: AcademicRequestContext,
    courseSubjectId: string,
    input: ReorderLearning,
  ): Promise<object[]> {
    const scope = this.managerScope(context);
    await this.requireCourseSubjectForMutation(context, scope, courseSubjectId);

    const execution = await this.idempotency.execute({
      tenantId: scope.tenantId,
      actorIdentityUserId: context.principal.identityUserId,
      commandName: 'REORDER_UNITS',
      idempotencyKey: context.idempotencyKey,
      payload: { courseSubjectId, ...input },
      action: async (tx) => {
        const records = await tx.learningUnit.findMany({
          where: {
            tenantId: scope.tenantId,
            courseSubjectId,
          },
          select: { id: true, version: true },
        });

        this.requireExactSet(
          records.map((record) => record.id),
          input.orderedIds,
        );

        if (input.expectedOrderRevision !== undefined) {
          const maxVersion = Math.max(...records.map((r) => r.version), 1);
          if (input.expectedOrderRevision !== maxVersion) {
            this.throwStaleRevision();
          }
        }

        for (const [index, id] of input.orderedIds.entries()) {
          const sparseSortOrder = (index + 1) * SPARSE_ORDER_STEP;
          const result = await tx.learningUnit.updateMany({
            where: {
              tenantId: scope.tenantId,
              id,
              ...(input.expectedOrderRevision !== undefined
                ? { version: { lte: input.expectedOrderRevision } }
                : {}),
            },
            data: { sortOrder: sparseSortOrder, version: { increment: 1 } },
          });

          if (result.count === 0) {
            this.throwStaleRevision();
          }

          const updated = await tx.learningUnit.findUniqueOrThrow({
            where: { tenantId_id: { tenantId: scope.tenantId, id } },
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

        const reorderedUnits = await tx.learningUnit.findMany({
          where: { tenantId: scope.tenantId, courseSubjectId },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        });

        return { status: 200, data: reorderedUnits.map(mapLearningUnit) };
      },
    });

    await this.recordAudit(
      context,
      'LEARNING_UNITS_REORDERED',
      'LearningUnit',
      courseSubjectId,
      courseSubjectId,
    );
    return execution.data;
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
    const bodyDocument = input.bodyDocument;
    const documentFields =
      bodyDocument !== undefined
        ? legacyFieldsForBodyDocument(input.type, bodyDocument)
        : {};
    this.validateItemContent(
      input.type,
      bodyDocument !== undefined
        ? documentFields.instructions
        : input.instructions,
      bodyDocument !== undefined ? documentFields.body : input.body,
      input.dueAt,
      bodyDocument,
    );

    const execution = await this.idempotency.execute({
      tenantId: scope.tenantId,
      actorIdentityUserId: context.principal.identityUserId,
      commandName: 'CREATE_ITEM',
      idempotencyKey: context.idempotencyKey,
      payload: { learningUnitId, ...input },
      action: async (tx) => {
        let sortOrder = input.sortOrder;
        if (sortOrder === 0) {
          const highestItem = await tx.learningItem.findFirst({
            where: {
              tenantId: scope.tenantId,
              learningUnitId,
            },
            orderBy: { sortOrder: 'desc' },
            select: { sortOrder: true },
          });
          sortOrder = this.ordering.computeNextEndPosition(
            highestItem?.sortOrder,
          );
        }

        const created = await tx.learningItem.create({
          data: {
            tenantId: scope.tenantId,
            courseSubjectId: unit.courseSubjectId,
            learningUnitId,
            type: input.type,
            title: input.title,
            description: input.description ?? null,
            content:
              bodyDocument !== undefined
                ? (documentFields.content ?? null)
                : (input.content ?? null),
            instructions:
              bodyDocument !== undefined
                ? (documentFields.instructions ?? null)
                : (input.instructions ?? null),
            body:
              bodyDocument !== undefined
                ? (documentFields.body ?? null)
                : (input.body ?? null),
            bodyDocument: bodyDocumentForPersistence(bodyDocument),
            sortOrder,
            dueAt: input.dueAt ? this.instant(input.dueAt) : null,
            createdByIdentityUserId: context.principal.identityUserId,
            updatedByIdentityUserId: context.principal.identityUserId,
          },
        });

        await assertBodyDocumentReferences(
          tx,
          scope.tenantId,
          created.id,
          bodyDocument,
        );

        await this.recordRevision(tx, {
          tenantId: scope.tenantId,
          entityType: 'LEARNING_ITEM',
          entityId: created.id,
          revisionNumber: created.version,
          operation: 'CREATED',
          snapshot: mapLearningItem(created),
          context,
        });

        return { status: 201, data: mapLearningItem(created) };
      },
    });

    await this.recordAudit(
      context,
      'LEARNING_ITEM_CREATED',
      'LearningItem',
      (execution.data as { id: string }).id,
      unit.courseSubjectId,
    );
    return execution.data;
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

  async getItem(context: AcademicRequestContext, id: string): Promise<object> {
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
    const bodyDocument = input.bodyDocument;
    const nextType = input.type ?? current.type;
    const documentFields =
      bodyDocument !== undefined
        ? legacyFieldsForBodyDocument(nextType, bodyDocument)
        : {};
    const contentFieldChanged =
      input.title !== undefined ||
      input.description !== undefined ||
      input.content !== undefined ||
      input.instructions !== undefined ||
      input.body !== undefined ||
      input.bodyDocument !== undefined ||
      input.dueAt !== undefined;
    if (contentFieldChanged && this.isEffectivelyVisible(current, new Date())) {
      throw new ConflictException({
        code: 'PUBLISHED_CONTENT_REQUIRES_DRAFT',
        message:
          'Este contenido ya es visible para estudiantes. Usa el borrador de trabajo para editarlo sin afectar lo publicado.',
      });
    }
    const nextInstructions =
      bodyDocument !== undefined &&
      (nextType === 'ASSIGNMENT' || nextType === 'ASSESSMENT')
        ? documentFields.instructions
        : input.instructions === undefined
          ? current.instructions
          : input.instructions;
    const nextBody =
      bodyDocument !== undefined && nextType === 'ANNOUNCEMENT'
        ? documentFields.body
        : input.body === undefined
          ? current.body
          : input.body;
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
      bodyDocument !== undefined
        ? bodyDocument
        : parsePersistedBodyDocument(current.bodyDocument),
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

    const execution = await this.idempotency.execute({
      tenantId: scope.tenantId,
      actorIdentityUserId: context.principal.identityUserId,
      commandName: 'UPDATE_ITEM',
      idempotencyKey: context.idempotencyKey,
      payload: { id, ...input },
      action: async (tx) => {
        const updated = await this.applyVersionedItemUpdate(
          tx,
          scope.tenantId,
          id,
          input.expectedRevision,
          {
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
            ...(bodyDocument !== undefined
              ? {
                  bodyDocument: bodyDocumentForPersistence(bodyDocument),
                  ...documentFields,
                }
              : {}),
            ...(input.sortOrder !== undefined
              ? { sortOrder: input.sortOrder }
              : {}),
            ...(input.dueAt !== undefined ? { dueAt: nextDueAt } : {}),
            updatedByIdentityUserId: context.principal.identityUserId,
          },
        );
        await assertBodyDocumentReferences(
          tx,
          scope.tenantId,
          id,
          bodyDocument,
        );
        await this.recordRevision(tx, {
          tenantId: scope.tenantId,
          entityType: 'LEARNING_ITEM',
          entityId: id,
          revisionNumber: updated.version,
          operation: sensitiveChange ? 'SENSITIVE_CHANGE_CONFIRMED' : 'UPDATED',
          snapshot: mapLearningItem(updated),
          context,
        });
        return { status: 200, data: mapLearningItem(updated) };
      },
    });

    await this.recordAudit(
      context,
      sensitiveChange
        ? 'LEARNING_ITEM_SENSITIVE_CHANGE_CONFIRMED'
        : 'LEARNING_ITEM_UPDATED',
      'LearningItem',
      id,
      current.courseSubjectId,
    );
    return execution.data;
  }

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
    const bodyDocument = input.bodyDocument;
    const draftBodyDocument =
      bodyDocument !== undefined
        ? bodyDocument
        : parsePersistedBodyDocument(current.bodyDocument);
    const documentFields =
      bodyDocument !== undefined
        ? legacyFieldsForBodyDocument(current.type, bodyDocument)
        : {};
    const nextInstructions =
      bodyDocument !== undefined
        ? documentFields.instructions
        : input.instructions !== undefined
          ? input.instructions
          : current.instructions;
    const nextBody =
      bodyDocument !== undefined
        ? documentFields.body
        : input.body !== undefined
          ? input.body
          : current.body;
    this.validateItemContent(
      current.type,
      nextInstructions ?? undefined,
      nextBody ?? undefined,
      input.dueAt !== undefined
        ? input.dueAt
        : (current.dueAt?.toISOString() ?? undefined),
      draftBodyDocument,
    );

    const execution = await this.idempotency.execute({
      tenantId: scope.tenantId,
      actorIdentityUserId: context.principal.identityUserId,
      commandName: 'SAVE_DRAFT',
      idempotencyKey: context.idempotencyKey,
      payload: { id, ...input },
      action: async (tx) => {
        const draft = await tx.learningItemDraft.upsert({
          where: {
            tenantId_learningItemId: {
              tenantId: scope.tenantId,
              learningItemId: id,
            },
          },
          create: {
            tenantId: scope.tenantId,
            learningItemId: id,
            title: input.title ?? current.title,
            description:
              input.description !== undefined
                ? input.description
                : current.description,
            content:
              bodyDocument !== undefined
                ? (documentFields.content ?? null)
                : input.content !== undefined
                  ? input.content
                  : current.content,
            instructions:
              bodyDocument !== undefined
                ? (documentFields.instructions ?? null)
                : input.instructions !== undefined
                  ? input.instructions
                  : current.instructions,
            body:
              bodyDocument !== undefined
                ? (documentFields.body ?? null)
                : input.body !== undefined
                  ? input.body
                  : current.body,
            bodyDocument: bodyDocumentForPersistence(
              bodyDocument !== undefined
                ? bodyDocument
                : parsePersistedBodyDocument(current.bodyDocument),
            ),
            dueAt:
              input.dueAt !== undefined
                ? input.dueAt
                  ? this.instant(input.dueAt)
                  : null
                : current.dueAt,
            basedOnVersion: current.version,
            updatedByIdentityUserId: context.principal.identityUserId,
          },
          update: {
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.description !== undefined
              ? { description: input.description }
              : {}),
            ...(bodyDocument === undefined && input.content !== undefined
              ? { content: input.content }
              : {}),
            ...(bodyDocument === undefined && input.instructions !== undefined
              ? { instructions: input.instructions }
              : {}),
            ...(bodyDocument === undefined && input.body !== undefined
              ? { body: input.body }
              : {}),
            ...(bodyDocument !== undefined
              ? {
                  ...documentFields,
                  bodyDocument: bodyDocumentForPersistence(bodyDocument),
                }
              : {}),
            ...(input.dueAt !== undefined
              ? { dueAt: input.dueAt ? this.instant(input.dueAt) : null }
              : {}),
            basedOnVersion: current.version,
            updatedByIdentityUserId: context.principal.identityUserId,
          },
        });
        await assertBodyDocumentReferences(
          tx,
          scope.tenantId,
          id,
          draftBodyDocument,
        );
        return { status: 200, data: mapLearningItemDraft(draft) };
      },
    });

    await this.recordAudit(
      context,
      'LEARNING_ITEM_DRAFT_SAVED',
      'LearningItem',
      id,
      current.courseSubjectId,
    );
    return execution.data;
  }

  async getDraft(context: AcademicRequestContext, id: string): Promise<object> {
    const scope = this.managerScope(context);
    const current = await this.learningItem(scope, id);
    await this.requireCourseSubjectForMutation(
      context,
      scope,
      current.courseSubjectId,
    );
    const draft = await this.prisma.learningItemDraft.findUnique({
      where: {
        tenantId_learningItemId: {
          tenantId: scope.tenantId,
          learningItemId: id,
        },
      },
    });
    return { draft: draft ? mapLearningItemDraft(draft) : null };
  }

  async discardDraft(
    context: AcademicRequestContext,
    id: string,
  ): Promise<void> {
    const scope = this.managerScope(context);
    const current = await this.learningItem(scope, id);
    await this.requireCourseSubjectForMutation(
      context,
      scope,
      current.courseSubjectId,
    );

    await this.idempotency.execute({
      tenantId: scope.tenantId,
      actorIdentityUserId: context.principal.identityUserId,
      commandName: 'DISCARD_DRAFT',
      idempotencyKey: context.idempotencyKey,
      payload: { id },
      action: async (tx) => {
        const draft = await tx.learningItemDraft.findUnique({
          where: {
            tenantId_learningItemId: {
              tenantId: scope.tenantId,
              learningItemId: id,
            },
          },
        });
        if (!draft) return { status: 200, data: null };
        await tx.learningItemDraft.delete({
          where: {
            tenantId_learningItemId: {
              tenantId: scope.tenantId,
              learningItemId: id,
            },
          },
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
        return { status: 200, data: null };
      },
    });

    await this.recordAudit(
      context,
      'LEARNING_ITEM_DRAFT_DISCARDED',
      'LearningItem',
      id,
      current.courseSubjectId,
    );
  }

  async publishDraft(
    context: AcademicRequestContext,
    id: string,
    input: PublishLearningItemDraft,
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
    const draft = await this.prisma.learningItemDraft.findUnique({
      where: {
        tenantId_learningItemId: {
          tenantId: scope.tenantId,
          learningItemId: id,
        },
      },
    });
    if (!draft) this.notFound();

    const draftBodyDocument = parsePersistedBodyDocument(draft.bodyDocument);
    const documentFields = legacyFieldsForBodyDocument(
      current.type,
      draftBodyDocument,
    );

    this.validateItemContent(
      current.type,
      draftBodyDocument
        ? documentFields.instructions
        : (draft.instructions ?? undefined),
      draftBodyDocument ? documentFields.body : (draft.body ?? undefined),
      draft.dueAt ? draft.dueAt.toISOString() : undefined,
      draftBodyDocument,
    );
    const sensitiveChange = current.publicationStatus !== 'DRAFT';
    if (sensitiveChange) {
      await this.requireSensitiveConfirmation(
        context,
        scope,
        current,
        input.confirmSensitiveChange,
      );
    }

    const execution = await this.idempotency.execute({
      tenantId: scope.tenantId,
      actorIdentityUserId: context.principal.identityUserId,
      commandName: 'PUBLISH_DRAFT',
      idempotencyKey: context.idempotencyKey,
      payload: { id, ...input },
      action: async (tx) => {
        const updated = await tx.learningItem.update({
          where: { tenantId_id: { tenantId: scope.tenantId, id } },
          data: {
            title: draft.title ?? current.title,
            description: draft.description,
            content: draftBodyDocument
              ? (documentFields.content ?? null)
              : draft.content,
            instructions: draftBodyDocument
              ? (documentFields.instructions ?? null)
              : draft.instructions,
            body: draftBodyDocument
              ? (documentFields.body ?? null)
              : draft.body,
            bodyDocument: bodyDocumentForPersistence(draftBodyDocument),
            dueAt: draft.dueAt,
            updatedByIdentityUserId: context.principal.identityUserId,
            version: { increment: 1 },
          },
        });
        await assertBodyDocumentReferences(
          tx,
          scope.tenantId,
          id,
          draftBodyDocument,
        );
        await tx.learningItemDraft.delete({
          where: {
            tenantId_learningItemId: {
              tenantId: scope.tenantId,
              learningItemId: id,
            },
          },
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
        return { status: 200, data: mapLearningItem(updated) };
      },
    });

    await this.recordAudit(
      context,
      'LEARNING_ITEM_DRAFT_PUBLISHED',
      'LearningItem',
      id,
      current.courseSubjectId,
    );
    return execution.data;
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
      (!current.publishAt ||
        current.publishAt.getTime() !== publishAt.getTime());
    if (changedTiming) {
      await this.requireSensitiveConfirmation(
        context,
        scope,
        current,
        input.confirmSensitiveChange,
      );
    }

    const execution = await this.idempotency.execute({
      tenantId: scope.tenantId,
      actorIdentityUserId: context.principal.identityUserId,
      commandName: 'SCHEDULE_ITEM',
      idempotencyKey: context.idempotencyKey,
      payload: { id, ...input },
      action: async (tx) => {
        const updated = await this.applyVersionedItemUpdate(
          tx,
          scope.tenantId,
          id,
          input.expectedRevision,
          {
            publicationStatus: 'SCHEDULED',
            publishAt,
            publishedAt: null,
            publishedByIdentityUserId: null,
            updatedByIdentityUserId: context.principal.identityUserId,
          },
        );
        await this.recordRevision(tx, {
          tenantId: scope.tenantId,
          entityType: 'LEARNING_ITEM',
          entityId: id,
          revisionNumber: updated.version,
          operation: 'SCHEDULED',
          snapshot: mapLearningItem(updated),
          context,
        });
        return { status: 200, data: mapLearningItem(updated) };
      },
    });

    await this.recordAudit(
      context,
      changedTiming
        ? 'LEARNING_ITEM_PUBLICATION_TIMING_CHANGED_CONFIRMED'
        : 'LEARNING_ITEM_SCHEDULED',
      'LearningItem',
      id,
      current.courseSubjectId,
    );
    return execution.data;
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
    if (current.publicationStatus === 'PUBLISHED')
      return mapLearningItem(current);
    const now = new Date();

    const execution = await this.idempotency.execute({
      tenantId: scope.tenantId,
      actorIdentityUserId: context.principal.identityUserId,
      commandName: 'PUBLISH_ITEM',
      idempotencyKey: context.idempotencyKey,
      payload: { id },
      action: async (tx) => {
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
        return { status: 200, data: mapLearningItem(published) };
      },
    });

    await this.recordAudit(
      context,
      'LEARNING_ITEM_PUBLISHED',
      'LearningItem',
      id,
      current.courseSubjectId,
    );
    return execution.data;
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
    if (current.publicationStatus === 'ARCHIVED')
      return mapLearningItem(current);

    const execution = await this.idempotency.execute({
      tenantId: scope.tenantId,
      actorIdentityUserId: context.principal.identityUserId,
      commandName: 'ARCHIVE_ITEM',
      idempotencyKey: context.idempotencyKey,
      payload: { id },
      action: async (tx) => {
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
        return { status: 200, data: mapLearningItem(archived) };
      },
    });

    await this.recordAudit(
      context,
      'LEARNING_ITEM_ARCHIVED',
      'LearningItem',
      id,
      current.courseSubjectId,
    );
    return execution.data;
  }

  async restoreArchivedItem(
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
    if (current.publicationStatus !== 'ARCHIVED')
      return mapLearningItem(current);

    const execution = await this.idempotency.execute({
      tenantId: scope.tenantId,
      actorIdentityUserId: context.principal.identityUserId,
      commandName: 'RESTORE_ITEM',
      idempotencyKey: context.idempotencyKey,
      payload: { id },
      action: async (tx) => {
        const restored = await tx.learningItem.update({
          where: { tenantId_id: { tenantId: scope.tenantId, id } },
          data: {
            publicationStatus: 'DRAFT',
            publishAt: null,
            updatedByIdentityUserId: context.principal.identityUserId,
            version: { increment: 1 },
          },
        });
        await this.recordRevision(tx, {
          tenantId: scope.tenantId,
          entityType: 'LEARNING_ITEM',
          entityId: id,
          revisionNumber: restored.version,
          operation: 'RESTORED',
          snapshot: mapLearningItem(restored),
          context,
        });
        return { status: 200, data: mapLearningItem(restored) };
      },
    });

    await this.recordAudit(
      context,
      'LEARNING_ITEM_RESTORED',
      'LearningItem',
      id,
      current.courseSubjectId,
    );
    return execution.data;
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

    const execution = await this.idempotency.execute({
      tenantId: scope.tenantId,
      actorIdentityUserId: context.principal.identityUserId,
      commandName: 'UNPUBLISH_ITEM',
      idempotencyKey: context.idempotencyKey,
      payload: { id },
      action: async (tx) => {
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
        return { status: 200, data: mapLearningItem(updated) };
      },
    });

    await this.recordAudit(
      context,
      'LEARNING_ITEM_UNPUBLISHED',
      'LearningItem',
      id,
      current.courseSubjectId,
    );
    return execution.data;
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
    const targetUnit = await this.learningUnit(
      scope,
      input.targetLearningUnitId,
    );
    if (targetUnit.status === 'ARCHIVED') {
      throw new ConflictException('Cannot move an item to an archived unit.');
    }
    await this.requireCourseSubjectForMutation(
      context,
      scope,
      targetUnit.courseSubjectId,
    );

    // CRITICAL: Reject cross-CourseSubject movements
    if (current.courseSubjectId !== targetUnit.courseSubjectId) {
      throw new ConflictException(
        'Cannot move learning item between different CourseSubjects.',
      );
    }

    const sourceUnit = await this.learningUnit(scope, current.learningUnitId);

    // Concurrency checks on base revisions
    if (
      input.expectedRevision !== undefined &&
      input.expectedRevision !== current.version
    ) {
      this.throwStaleRevision();
    }
    if (
      input.sourceOrderRevision !== undefined &&
      input.sourceOrderRevision !== sourceUnit.version
    ) {
      this.throwStaleRevision();
    }
    if (
      input.targetOrderRevision !== undefined &&
      input.targetOrderRevision !== targetUnit.version
    ) {
      this.throwStaleRevision();
    }

    const execution = await this.idempotency.execute({
      tenantId: scope.tenantId,
      actorIdentityUserId: context.principal.identityUserId,
      commandName: 'MOVE_ITEM',
      idempotencyKey: context.idempotencyKey,
      payload: { id, ...input },
      action: async (tx) => {
        const newSortOrder = await this.ordering.determineItemPlacementPosition(
          {
            tx,
            tenantId: scope.tenantId,
            targetLearningUnitId: input.targetLearningUnitId,
            placement: input.placement,
            excludeItemId: id,
          },
        );

        const updated = await this.applyVersionedItemUpdate(
          tx,
          scope.tenantId,
          id,
          input.expectedRevision,
          {
            learningUnitId: input.targetLearningUnitId,
            courseSubjectId: targetUnit.courseSubjectId,
            sortOrder: newSortOrder,
            updatedByIdentityUserId: context.principal.identityUserId,
          },
        );

        if (current.learningUnitId !== input.targetLearningUnitId) {
          const srcRes = await tx.learningUnit.updateMany({
            where: {
              tenantId: scope.tenantId,
              id: current.learningUnitId,
              ...(input.sourceOrderRevision !== undefined
                ? { version: input.sourceOrderRevision }
                : {}),
            },
            data: { version: { increment: 1 } },
          });
          if (srcRes.count === 0) this.throwStaleRevision();

          const tgtRes = await tx.learningUnit.updateMany({
            where: {
              tenantId: scope.tenantId,
              id: input.targetLearningUnitId,
              ...(input.targetOrderRevision !== undefined
                ? { version: input.targetOrderRevision }
                : {}),
            },
            data: { version: { increment: 1 } },
          });
          if (tgtRes.count === 0) this.throwStaleRevision();
        } else {
          const unitRes = await tx.learningUnit.updateMany({
            where: {
              tenantId: scope.tenantId,
              id: current.learningUnitId,
              ...(input.sourceOrderRevision !== undefined
                ? { version: input.sourceOrderRevision }
                : {}),
            },
            data: { version: { increment: 1 } },
          });
          if (unitRes.count === 0) this.throwStaleRevision();
        }

        await this.recordRevision(tx, {
          tenantId: scope.tenantId,
          entityType: 'LEARNING_ITEM',
          entityId: id,
          revisionNumber: updated.version,
          operation: 'MOVED',
          snapshot: mapLearningItem(updated),
          context,
        });

        return { status: 200, data: mapLearningItem(updated) };
      },
    });

    await this.recordAudit(
      context,
      'LEARNING_ITEM_MOVED',
      'LearningItem',
      id,
      targetUnit.courseSubjectId,
    );
    return execution.data;
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
      throw new ConflictException(
        'Cannot duplicate an item into an archived unit.',
      );
    }
    await this.requireCourseSubjectForMutation(
      context,
      scope,
      targetUnit.courseSubjectId,
    );

    // Cross-CourseSubject check
    if (current.courseSubjectId !== targetUnit.courseSubjectId) {
      throw new ConflictException(
        'Cannot duplicate learning item into a unit of a different CourseSubject.',
      );
    }

    const title = input?.title?.trim() || `${current.title} (Copia)`;

    const execution = await this.idempotency.execute({
      tenantId: scope.tenantId,
      actorIdentityUserId: context.principal.identityUserId,
      commandName: 'DUPLICATE_ITEM',
      idempotencyKey: context.idempotencyKey,
      payload: { id, ...input },
      action: async (tx) => {
        const highestInTarget = await tx.learningItem.findFirst({
          where: { tenantId: scope.tenantId, learningUnitId: targetUnitId },
          orderBy: { sortOrder: 'desc' },
          select: { sortOrder: true },
        });
        const nextSortOrder = this.ordering.computeNextEndPosition(
          highestInTarget?.sortOrder,
        );

        const sourceReferences = await tx.fileReference.findMany({
          where: {
            tenantId: scope.tenantId,
            referenceType: 'LEARNING_ITEM',
            learningItemId: id,
            fileObject: { lifecycle: 'AVAILABLE' },
          },
        });

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

        return { status: 201, data: mapLearningItem(created) };
      },
    });

    await this.recordAudit(
      context,
      'LEARNING_ITEM_DUPLICATED',
      'LearningItem',
      (execution.data as { id: string }).id,
      targetUnit.courseSubjectId,
    );
    return execution.data;
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

    if (
      input.expectedOrderRevision !== undefined &&
      input.expectedOrderRevision !== unit.version
    ) {
      this.throwStaleRevision();
    }

    const execution = await this.idempotency.execute({
      tenantId: scope.tenantId,
      actorIdentityUserId: context.principal.identityUserId,
      commandName: 'REORDER_ITEMS',
      idempotencyKey: context.idempotencyKey,
      payload: { learningUnitId, ...input },
      action: async (tx) => {
        // Concurrency serialization gate: conditionally lock and update learning unit version
        const unitUpdateResult = await tx.learningUnit.updateMany({
          where: {
            tenantId: scope.tenantId,
            id: learningUnitId,
            ...(input.expectedOrderRevision !== undefined
              ? { version: input.expectedOrderRevision }
              : {}),
          },
          data: { version: { increment: 1 } },
        });

        if (unitUpdateResult.count === 0) {
          this.throwStaleRevision();
        }

        const records = await tx.learningItem.findMany({
          where: {
            tenantId: scope.tenantId,
            learningUnitId,
          },
          select: { id: true, version: true },
        });

        this.requireExactSet(
          records.map((record) => record.id),
          input.orderedIds,
        );

        for (const [index, id] of input.orderedIds.entries()) {
          const sparseSortOrder = (index + 1) * SPARSE_ORDER_STEP;
          const updated = await tx.learningItem.update({
            where: { tenantId_id: { tenantId: scope.tenantId, id } },
            data: {
              sortOrder: sparseSortOrder,
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

        const reorderedItems = await tx.learningItem.findMany({
          where: { tenantId: scope.tenantId, learningUnitId },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        });

        return { status: 200, data: reorderedItems.map(mapLearningItem) };
      },
    });

    await this.recordAudit(
      context,
      'LEARNING_ITEMS_REORDERED',
      'LearningItem',
      learningUnitId,
      unit.courseSubjectId,
    );
    return execution.data;
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

  private isVisibleItem(record: LearningItem, now: Date): boolean {
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
    bodyDocument?: LearningBodyDocument | null,
  ): void {
    const hasBodyDocumentContent =
      bodyDocumentHasMeaningfulContent(bodyDocument);
    if (
      (type === 'ASSIGNMENT' || type === 'ASSESSMENT') &&
      !instructions?.trim() &&
      !hasBodyDocumentContent
    ) {
      throw new BadRequestException(
        'instructions are required for deliverable items.',
      );
    }
    if ((type === 'ASSIGNMENT' || type === 'ASSESSMENT') && !dueAt) {
      throw new BadRequestException('dueAt is required for deliverable items.');
    }
    if (type === 'ANNOUNCEMENT' && !body?.trim() && !hasBodyDocumentContent) {
      throw new BadRequestException('body is required for announcements.');
    }
    if ((type === 'MATERIAL' || type === 'ANNOUNCEMENT') && dueAt) {
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
      throw new BadRequestException(
        'Timestamp must be a valid ISO 8601 instant.',
      );
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
    throw new NotFoundException(
      'The requested learning resource was not found.',
    );
  }

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
        ...(expectedRevision !== undefined
          ? { version: expectedRevision }
          : {}),
      },
      data: { ...data, version: { increment: 1 } },
    });
    if (result.count === 0) this.throwStaleRevision();
    return tx.learningUnit.findUniqueOrThrow({
      where: { tenantId_id: { tenantId, id } },
    });
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
        ...(expectedRevision !== undefined
          ? { version: expectedRevision }
          : {}),
      },
      data: { ...data, version: { increment: 1 } },
    });
    if (result.count === 0) this.throwStaleRevision();
    return tx.learningItem.findUniqueOrThrow({
      where: { tenantId_id: { tenantId, id } },
    });
  }

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
    await this.requireCourseSubjectForMutation(
      context,
      scope,
      current.courseSubjectId,
    );
    return this.listRevisions(scope.tenantId, 'LEARNING_UNIT', id);
  }

  async listItemHistory(
    context: AcademicRequestContext,
    id: string,
  ): Promise<object[]> {
    const scope = this.managerScope(context);
    const current = await this.learningItem(scope, id);
    await this.requireCourseSubjectForMutation(
      context,
      scope,
      current.courseSubjectId,
    );
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

  async restoreUnitRevision(
    context: AcademicRequestContext,
    id: string,
    revisionNumber: number,
    input: RestoreRevision,
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

    const execution = await this.idempotency.execute({
      tenantId: scope.tenantId,
      actorIdentityUserId: context.principal.identityUserId,
      commandName: 'RESTORE_UNIT_REVISION',
      idempotencyKey: context.idempotencyKey,
      payload: { id, revisionNumber, ...input },
      action: async (tx) => {
        const updated = await this.applyVersionedUnitUpdate(
          tx,
          scope.tenantId,
          id,
          input.expectedRevision,
          {
            title:
              typeof snapshot.title === 'string'
                ? snapshot.title
                : current.title,
            description:
              typeof snapshot.description === 'string'
                ? snapshot.description
                : null,
            startAt:
              typeof snapshot.startAt === 'string'
                ? new Date(snapshot.startAt)
                : null,
            endAt:
              typeof snapshot.endAt === 'string'
                ? new Date(snapshot.endAt)
                : null,
          },
        );
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
        return { status: 200, data: mapLearningUnit(updated) };
      },
    });

    await this.recordAudit(
      context,
      'LEARNING_UNIT_RESTORED',
      'LearningUnit',
      id,
      current.courseSubjectId,
    );
    return execution.data;
  }

  async restoreItemRevision(
    context: AcademicRequestContext,
    id: string,
    revisionNumber: number,
    input: RestoreRevision,
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
      description:
        typeof snapshot.description === 'string' ? snapshot.description : null,
      content: typeof snapshot.content === 'string' ? snapshot.content : null,
      instructions:
        typeof snapshot.instructions === 'string'
          ? snapshot.instructions
          : null,
      body: typeof snapshot.body === 'string' ? snapshot.body : null,
      bodyDocument: parsePersistedBodyDocument(snapshot.bodyDocument),
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
      restoredContent.bodyDocument,
    );

    const execution = await this.idempotency.execute({
      tenantId: scope.tenantId,
      actorIdentityUserId: context.principal.identityUserId,
      commandName: 'RESTORE_ITEM_REVISION',
      idempotencyKey: context.idempotencyKey,
      payload: { id, revisionNumber, ...input },
      action: async (tx) => {
        const updated = await this.applyVersionedItemUpdate(
          tx,
          scope.tenantId,
          id,
          input.expectedRevision,
          {
            title: restoredContent.title ?? current.title,
            description: restoredContent.description ?? null,
            content: restoredContent.content ?? null,
            instructions: restoredContent.instructions ?? null,
            body: restoredContent.body ?? null,
            bodyDocument: bodyDocumentForPersistence(
              restoredContent.bodyDocument,
            ),
            ...legacyFieldsForBodyDocument(
              current.type,
              restoredContent.bodyDocument,
            ),
            dueAt: restoredContent.dueAt
              ? this.instant(restoredContent.dueAt)
              : null,
            updatedByIdentityUserId: context.principal.identityUserId,
          },
        );
        await assertBodyDocumentReferences(
          tx,
          scope.tenantId,
          id,
          restoredContent.bodyDocument,
        );
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
        return { status: 200, data: mapLearningItem(updated) };
      },
    });

    await this.recordAudit(
      context,
      'LEARNING_ITEM_RESTORED',
      'LearningItem',
      id,
      current.courseSubjectId,
    );
    return execution.data;
  }
}
