import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  NotificationPage,
  InAppNotification as InAppNotificationContract,
} from '@edupay/contracts';
import { randomUUID } from 'node:crypto';

import type {
  NotificationChannel,
  NotificationEventType,
  Prisma,
} from '../generated/prisma/client';
import type { AcademicRequestContext } from '../academic/academic-context';
import { PrismaService } from '../persistence/prisma.service';
import { TenantQueryScope } from '../persistence/tenant-query-scope';
import {
  ACADEMIC_NOTIFICATION_TEMPLATE_VERSION,
  notificationCopy,
  type AcademicNotificationPayload,
} from './notification-templates';

type TransactionClient = Prisma.TransactionClient;

interface Recipient {
  readonly key: string;
  readonly identityUserId: string | null;
  readonly email: string | null;
}

interface EventInput {
  readonly tenantId: string;
  readonly eventId: string;
  readonly eventType: NotificationEventType;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly payload: AcademicNotificationPayload;
  readonly occurredAt: Date;
  readonly notBefore: Date;
  readonly requestId?: string | undefined;
}

@Injectable()
export class NotificationService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createLearningPublicationIntent(
    tx: TransactionClient,
    input: {
      tenantId: string;
      learningItemId: string;
      eventType: NotificationEventType;
      occurredAt: Date;
      notBefore: Date;
      requestId?: string | undefined;
    },
  ): Promise<void> {
    const item = await tx.learningItem.findUnique({
      where: {
        tenantId_id: {
          tenantId: input.tenantId,
          id: input.learningItemId,
        },
      },
      include: {
        courseSubject: { include: { subject: true } },
      },
    });
    if (!item) return;

    const payload: AcademicNotificationPayload = {
      courseSubjectId: item.courseSubjectId,
      learningItemId: item.id,
      learningItemTitle: item.title,
      subjectName: item.courseSubject.subject.name,
      dueAt: item.dueAt?.toISOString() ?? null,
      targetPath: `/estudiante/asignaturas/${item.courseSubjectId}/items/${item.id}`,
    };
    const eventId = `learning-publication:${input.tenantId}:${item.id}:${input.occurredAt.toISOString()}`;
    const recipients = await this.learningStudentRecipients(
      tx,
      input.tenantId,
      item.courseSubjectId,
    );
    await this.createEventAndDeliveries(tx, {
      tenantId: input.tenantId,
      eventId,
      eventType: input.eventType,
      aggregateType: 'LearningItem',
      aggregateId: item.id,
      payload,
      occurredAt: input.occurredAt,
      notBefore: input.notBefore,
      requestId: input.requestId,
    }, recipients);
  }

  async createSubmissionIntent(
    tx: TransactionClient,
    input: {
      tenantId: string;
      submissionRevisionId: string;
      eventType: 'SUBMISSION_RECEIVED' | 'RESUBMISSION_RECEIVED';
      occurredAt: Date;
      requestId?: string | undefined;
    },
  ): Promise<void> {
    const revision = await tx.submissionRevision.findUnique({
      where: {
        tenantId_id: {
          tenantId: input.tenantId,
          id: input.submissionRevisionId,
        },
      },
      include: {
        submission: {
          include: {
            learningItem: { include: { courseSubject: { include: { subject: true } } } },
          },
        },
      },
    });
    if (!revision) return;
    const item = revision.submission.learningItem;
    const payload: AcademicNotificationPayload = {
      courseSubjectId: item.courseSubjectId,
      learningItemId: item.id,
      learningItemTitle: item.title,
      subjectName: item.courseSubject.subject.name,
      targetPath: `/docente/revisiones?learningItemId=${item.id}`,
      submissionId: revision.submissionId,
      submissionRevisionId: revision.id,
    };
    const recipients = await this.learningTeacherRecipients(
      tx,
      input.tenantId,
      item.courseSubjectId,
    );
    await this.createEventAndDeliveries(tx, {
      tenantId: input.tenantId,
      eventId: `submission:${input.tenantId}:${revision.id}:${input.eventType}`,
      eventType: input.eventType,
      aggregateType: 'SubmissionRevision',
      aggregateId: revision.id,
      payload,
      occurredAt: input.occurredAt,
      notBefore: input.occurredAt,
      requestId: input.requestId,
    }, recipients, ['IN_APP']);
  }

  async createReviewIntent(
    tx: TransactionClient,
    input: {
      tenantId: string;
      reviewId: string;
      eventType: 'SUBMISSION_REVIEWED' | 'CHANGES_REQUESTED';
      occurredAt: Date;
      requestId?: string | undefined;
    },
  ): Promise<void> {
    const review = await tx.review.findUnique({
      where: { tenantId_id: { tenantId: input.tenantId, id: input.reviewId } },
      include: {
        submissionRevision: {
          include: {
            submission: {
              include: {
                student: true,
                learningItem: { include: { courseSubject: { include: { subject: true } } } },
              },
            },
          },
        },
      },
    });
    if (!review) return;
    const item = review.submissionRevision.submission.learningItem;
    const payload: AcademicNotificationPayload = {
      courseSubjectId: item.courseSubjectId,
      learningItemId: item.id,
      learningItemTitle: item.title,
      subjectName: item.courseSubject.subject.name,
      targetPath: `/estudiante/asignaturas/${item.courseSubjectId}/items/${item.id}`,
      submissionId: review.submissionRevision.submission.id,
      submissionRevisionId: review.submissionRevision.id,
      reviewStatus:
        input.eventType === 'SUBMISSION_REVIEWED'
          ? 'REVIEWED'
          : 'CHANGES_REQUESTED',
    };
    const student = review.submissionRevision.submission.student;
    await this.createEventAndDeliveries(tx, {
      tenantId: input.tenantId,
      eventId: `review:${input.tenantId}:${review.id}:${input.eventType}`,
      eventType: input.eventType,
      aggregateType: 'Review',
      aggregateId: review.id,
      payload,
      occurredAt: input.occurredAt,
      notBefore: input.occurredAt,
      requestId: input.requestId,
    }, [{
      key: student.identityUserId ?? `student:${student.id}`,
      identityUserId: student.identityUserId,
      email: student.email,
    }]);
  }

  async materializeDueScheduledLearningEvents(limit = 50): Promise<number> {
    const now = new Date();
    const items = await this.prisma.learningItem.findMany({
      where: {
        publicationStatus: 'SCHEDULED',
        publishAt: { lte: now },
        courseSubject: { status: 'ACTIVE' },
        learningUnit: {
          status: 'ACTIVE',
          AND: [
            { OR: [{ startAt: null }, { startAt: { lte: now } }] },
            { OR: [{ endAt: null }, { endAt: { gte: now } }] },
          ],
        },
        type: { in: ['ASSIGNMENT', 'ASSESSMENT', 'ANNOUNCEMENT'] },
      },
      orderBy: [{ publishAt: 'asc' }, { id: 'asc' }],
      take: limit,
      select: { tenantId: true, id: true, type: true, publishAt: true },
    });

    let materialized = 0;
    for (const item of items) {
      if (!item.publishAt) continue;
      const eventType = this.learningEventType(item.type);
      await this.prisma.$transaction(async (tx) => {
        const current = await tx.learningItem.findUnique({
          where: { tenantId_id: { tenantId: item.tenantId, id: item.id } },
          select: { publicationStatus: true, publishAt: true },
        });
        if (
          !current ||
          current.publicationStatus !== 'SCHEDULED' ||
          !current.publishAt ||
          current.publishAt > now
        ) {
          return;
        }
        await this.createLearningPublicationIntent(tx, {
          tenantId: item.tenantId,
          learningItemId: item.id,
          eventType,
          occurredAt: current.publishAt,
          notBefore: current.publishAt,
        });
        materialized += 1;
      });
    }
    return materialized;
  }

  async listCurrent(
    context: AcademicRequestContext,
    input: { cursor?: string; limit: number },
  ): Promise<NotificationPage> {
    const tenantId = this.tenantId(context);
    const boundary = input.cursor ? this.decodeCursor(input.cursor) : undefined;
    const notifications = await this.prisma.inAppNotification.findMany({
      where: {
        tenantId,
        recipientIdentityUserId: context.principal.identityUserId,
        ...(boundary
          ? {
              OR: [
                { createdAt: { lt: boundary.createdAt } },
                { createdAt: boundary.createdAt, id: { lt: boundary.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
    });
    const hasMore = notifications.length > input.limit;
    const pageItems = hasMore ? notifications.slice(0, input.limit) : notifications;
    const last = pageItems.at(-1);
    return {
      items: pageItems.map(this.mapNotification),
      nextCursor: hasMore && last ? this.encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async markRead(
    context: AcademicRequestContext,
    notificationId: string,
  ): Promise<InAppNotificationContract> {
    const tenantId = this.tenantId(context);
    const record = await this.prisma.inAppNotification.findUnique({
      where: { tenantId_id: { tenantId, id: notificationId } },
    });
    if (!record || record.recipientIdentityUserId !== context.principal.identityUserId) {
      throw new NotFoundException('The requested notification was not found.');
    }
    const updated = await this.prisma.inAppNotification.update({
      where: { tenantId_id: { tenantId, id: notificationId } },
      data: { readAt: record.readAt ?? new Date() },
    });
    return this.mapNotification(updated);
  }

  async markAllRead(context: AcademicRequestContext): Promise<{ updatedCount: number }> {
    const tenantId = this.tenantId(context);
    const result = await this.prisma.inAppNotification.updateMany({
      where: {
        tenantId,
        recipientIdentityUserId: context.principal.identityUserId,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return { updatedCount: result.count };
  }

  async unreadCount(context: AcademicRequestContext): Promise<{ count: number }> {
    const tenantId = this.tenantId(context);
    const count = await this.prisma.inAppNotification.count({
      where: {
        tenantId,
        recipientIdentityUserId: context.principal.identityUserId,
        readAt: null,
      },
    });
    return { count };
  }

  private async createEventAndDeliveries(
    tx: TransactionClient,
    input: EventInput,
    recipients: readonly Recipient[],
    channels?: readonly NotificationChannel[],
  ): Promise<void> {
    await tx.notificationEvent.upsert({
      where: { tenantId_id: { tenantId: input.tenantId, id: input.eventId } },
      create: {
        tenantId: input.tenantId,
        id: input.eventId,
        eventType: input.eventType,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        payload: input.payload as unknown as Prisma.InputJsonValue,
        occurredAt: input.occurredAt,
        notBefore: input.notBefore,
        requestId: input.requestId ?? null,
      },
      update: {},
    });

    const selectedChannels = channels ?? this.channelsFor(input.eventType);
    const deliveryData = recipients.flatMap((recipient) =>
      selectedChannels.map((channel) => {
        const missingIdentity = recipient.identityUserId === null;
        const missingEmail = channel === 'EMAIL' && !recipient.email;
        const skipped = missingIdentity || missingEmail;
        const id = randomUUID();
        return {
          id,
          tenantId: input.tenantId,
          eventId: input.eventId,
          recipientKey: recipient.key,
          recipientIdentityUserId: recipient.identityUserId,
          recipientEmail: recipient.email,
          channel,
          templateVersion: ACADEMIC_NOTIFICATION_TEMPLATE_VERSION,
          idempotencyKey: `${input.eventId}:${recipient.key}:${channel}:${ACADEMIC_NOTIFICATION_TEMPLATE_VERSION}`,
          status: skipped ? 'SKIPPED' as const : 'PENDING' as const,
          ...(skipped
            ? {
                skipReason: missingIdentity
                  ? 'IDENTITY_LINK_MISSING'
                  : 'EMAIL_ADDRESS_MISSING',
              }
            : {}),
        };
      }),
    );
    if (deliveryData.length === 0) return;

    const existing = await tx.notificationDelivery.findMany({
      where: { tenantId: input.tenantId, eventId: input.eventId },
      select: { recipientKey: true, channel: true, templateVersion: true, id: true },
    });
    const existingKeys = new Set(
      existing.map((delivery) =>
        `${delivery.recipientKey}:${delivery.channel}:${delivery.templateVersion}`,
      ),
    );
    const missing = deliveryData.filter(
      (delivery) =>
        !existingKeys.has(
          `${delivery.recipientKey}:${delivery.channel}:${delivery.templateVersion}`,
        ),
    );
    if (missing.length > 0) {
      await tx.notificationDelivery.createMany({ data: missing, skipDuplicates: true });
    }

    const inApp = missing.filter(
      (delivery) => delivery.channel === 'IN_APP' && delivery.status === 'PENDING' && delivery.recipientIdentityUserId,
    );
    if (inApp.length > 0) {
      const copy = notificationCopy(input.eventType, input.payload);
      await tx.inAppNotification.createMany({
        data: inApp.map((delivery) => ({
          id: randomUUID(),
          tenantId: input.tenantId,
          notificationDeliveryId: delivery.id,
          recipientIdentityUserId: delivery.recipientIdentityUserId as string,
          type: input.eventType,
          title: copy.title,
          body: copy.body,
          targetPath: input.payload.targetPath,
          eventId: input.eventId,
        })),
        skipDuplicates: true,
      });
      await tx.notificationDelivery.updateMany({
        where: {
          tenantId: input.tenantId,
          id: { in: inApp.map((delivery) => delivery.id) },
          status: 'PENDING',
        },
        data: { status: 'DELIVERED', sentAt: new Date() },
      });
    }
  }

  private async learningStudentRecipients(
    tx: TransactionClient,
    tenantId: string,
    courseSubjectId: string,
  ): Promise<Recipient[]> {
    const students = await tx.student.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        OR: [
          {
            subjectEnrollments: {
              some: { courseSubjectId, status: 'ACTIVE' },
            },
          },
          {
            courseEnrollments: {
              some: {
                status: 'ACTIVE',
                course: {
                  courseSubjects: {
                    some: { id: courseSubjectId, status: 'ACTIVE', defaultForCourse: true },
                  },
                },
              },
            },
          },
        ],
      },
      select: { id: true, identityUserId: true, email: true },
    });
    return students.map((student) => ({
      key: student.identityUserId ?? `student:${student.id}`,
      identityUserId: student.identityUserId,
      email: student.email,
    }));
  }

  private async learningTeacherRecipients(
    tx: TransactionClient,
    tenantId: string,
    courseSubjectId: string,
  ): Promise<Recipient[]> {
    const assignments = await tx.courseSubjectTeacher.findMany({
      where: {
        tenantId,
        courseSubjectId,
        status: 'ACTIVE',
        teacher: { status: 'ACTIVE' },
      },
      select: { teacher: { select: { id: true, identityUserId: true, email: true } } },
    });
    return assignments.map(({ teacher }) => ({
      key: teacher.identityUserId ?? `teacher:${teacher.id}`,
      identityUserId: teacher.identityUserId,
      email: teacher.email,
    }));
  }

  private channelsFor(eventType: NotificationEventType): NotificationChannel[] {
    if (eventType === 'SUBMISSION_RECEIVED' || eventType === 'RESUBMISSION_RECEIVED') {
      return ['IN_APP'];
    }
    if (eventType === 'ANNOUNCEMENT_PUBLISHED') return ['IN_APP'];
    return ['IN_APP', 'EMAIL'];
  }

  private learningEventType(type: 'MATERIAL' | 'ASSIGNMENT' | 'ASSESSMENT' | 'ANNOUNCEMENT'): NotificationEventType {
    if (type === 'ASSIGNMENT') return 'ASSIGNMENT_PUBLISHED';
    if (type === 'ASSESSMENT') return 'ASSESSMENT_PUBLISHED';
    return 'ANNOUNCEMENT_PUBLISHED';
  }

  private tenantId(context: AcademicRequestContext): string {
    if (context.principal.roles.includes('SYSTEM_ADMIN')) {
      throw new ForbiddenException('The requested action is not authorized.');
    }
    return TenantQueryScope.fromTrustedContext(context.tenant).tenantId;
  }

  private decodeCursor(cursor: string): { createdAt: Date; id: string } {
    try {
      const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
        createdAt?: unknown;
        id?: unknown;
      };
      if (typeof value.createdAt !== 'string' || typeof value.id !== 'string') throw new Error();
      const createdAt = new Date(value.createdAt);
      if (Number.isNaN(createdAt.getTime()) || !value.id) throw new Error();
      return { createdAt, id: value.id };
    } catch {
      throw new BadRequestException('The notification cursor is invalid.');
    }
  }

  private encodeCursor(createdAt: Date, id: string): string {
    return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString('base64url');
  }

  private mapNotification = (record: {
    id: string;
    eventId: string;
    type: NotificationEventType;
    title: string;
    body: string;
    targetPath: string;
    createdAt: Date;
    readAt: Date | null;
  }): InAppNotificationContract => ({
    id: record.id,
    eventId: record.eventId,
    type: record.type,
    title: record.title,
    body: record.body,
    targetPath: record.targetPath,
    createdAt: record.createdAt.toISOString(),
    readAt: record.readAt?.toISOString() ?? null,
  });
}
