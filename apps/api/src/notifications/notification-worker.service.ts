import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../persistence/prisma.service';
import { renderAcademicEmail, type AcademicNotificationPayload } from './notification-templates';
import {
  ACADEMIC_EMAIL_ADAPTER,
  AcademicEmailDeliveryError,
  type AcademicEmailAdapter,
} from './notification.types';
import { NotificationService } from './notification.service';

interface ClaimedDelivery {
  tenantId: string;
  id: string;
}

@Injectable()
export class NotificationWorkerService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(ConfigService)
    private readonly config: ConfigService,
    @Inject(NotificationService)
    private readonly notifications: NotificationService,
    @Inject(ACADEMIC_EMAIL_ADAPTER)
    private readonly emailAdapter: AcademicEmailAdapter,
  ) {}

  async runOnce(): Promise<{ materialized: number; claimed: number }> {
    const materialized = await this.notifications.materializeDueScheduledLearningEvents(
      this.batchSize(),
    );
    const claimed = await this.claimDeliveries();
    for (const delivery of claimed) {
      await this.processClaim(delivery);
    }
    return { materialized, claimed: claimed.length };
  }

  async runForever(): Promise<void> {
    let stopping = false;
    const stop = () => {
      stopping = true;
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    try {
      while (!stopping) {
        await this.runOnce();
        if (stopping) break;
        await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs()));
      }
    } finally {
      process.removeListener('SIGINT', stop);
      process.removeListener('SIGTERM', stop);
    }
  }

  async operationalSummary(): Promise<Record<string, number | string | null>> {
    const rows = await this.prisma.$queryRaw<Array<{ status: string; count: bigint }>>`
      SELECT status::text AS status, COUNT(*)::bigint AS count
      FROM notification_deliveries
      GROUP BY status
    `;
    const latestFailure = await this.prisma.notificationDelivery.findFirst({
      where: { status: { in: ['RETRY', 'FAILED'] } },
      orderBy: { lastAttemptAt: 'desc' },
      select: { lastErrorCategory: true, lastAttemptAt: true },
    });
    return {
      ...Object.fromEntries(rows.map((row) => [row.status, Number(row.count)])),
      lastErrorCategory: latestFailure?.lastErrorCategory ?? null,
      lastAttemptAt: latestFailure?.lastAttemptAt?.toISOString() ?? null,
    };
  }

  private async claimDeliveries(): Promise<ClaimedDelivery[]> {
    const leaseSeconds = this.config.get<number>('NOTIFICATION_PROCESSING_LEASE_SECONDS', 900);
    return this.prisma.$queryRaw<ClaimedDelivery[]>`
      WITH candidates AS (
        SELECT delivery.tenant_id, delivery.id
        FROM notification_deliveries AS delivery
        INNER JOIN notification_events AS event
          ON event.tenant_id = delivery.tenant_id
         AND event.id = delivery.event_id
        WHERE (
          delivery.status IN ('PENDING', 'RETRY')
          AND delivery.next_attempt_at <= CURRENT_TIMESTAMP
          AND event.not_before <= CURRENT_TIMESTAMP
        ) OR (
          delivery.status = 'PROCESSING'
          AND delivery.locked_at IS NOT NULL
          AND delivery.locked_at <= CURRENT_TIMESTAMP - (${leaseSeconds} * INTERVAL '1 second')
          AND event.not_before <= CURRENT_TIMESTAMP
        )
        ORDER BY delivery.next_attempt_at ASC, delivery.id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${this.batchSize()}
      )
      UPDATE notification_deliveries AS delivery
      SET status = 'PROCESSING',
          locked_at = CURRENT_TIMESTAMP,
          attempt_count = delivery.attempt_count + 1,
          last_attempt_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      FROM candidates
      WHERE delivery.tenant_id = candidates.tenant_id
        AND delivery.id = candidates.id
      RETURNING delivery.tenant_id AS "tenantId", delivery.id::text AS id
    `;
  }

  private async processClaim(claim: ClaimedDelivery): Promise<void> {
    const delivery = await this.prisma.notificationDelivery.findUnique({
      where: { tenantId_id: { tenantId: claim.tenantId, id: claim.id } },
      include: { event: true },
    });
    if (!delivery || delivery.status !== 'PROCESSING') return;

    if (delivery.channel !== 'EMAIL' || !delivery.recipientEmail) {
      await this.prisma.notificationDelivery.updateMany({
        where: {
          tenantId: claim.tenantId,
          id: claim.id,
          status: 'PROCESSING',
        },
        data: {
          status: 'SKIPPED',
          skipReason: delivery.recipientEmail ? 'UNSUPPORTED_CHANNEL' : 'EMAIL_ADDRESS_MISSING',
          lockedAt: null,
        },
      });
      return;
    }

    try {
      const payload = delivery.event.payload as unknown as AcademicNotificationPayload;
      const content = renderAcademicEmail(
        delivery.event.eventType,
        payload,
        this.config.get<string>('ACADEMIC_PUBLIC_BASE_URL', 'http://localhost:3001'),
      );
      const result = await this.emailAdapter.send({
        deliveryId: delivery.id,
        to: delivery.recipientEmail,
        subject: content.subject,
        text: content.text,
        html: content.html,
      });
      await this.prisma.notificationDelivery.updateMany({
        where: { tenantId: claim.tenantId, id: claim.id, status: 'PROCESSING' },
        data: {
          status: 'DELIVERED',
          sentAt: new Date(),
          lockedAt: null,
          providerMessageId: result.providerMessageId ?? null,
          lastErrorCategory: null,
          lastErrorMessage: null,
        },
      });
    } catch (error) {
      await this.recordFailure(delivery, error);
    }
  }

  private async recordFailure(
    delivery: Prisma.NotificationDeliveryGetPayload<{ include: { event: true } }>,
    error: unknown,
  ): Promise<void> {
    const providerError = error instanceof AcademicEmailDeliveryError
      ? error
      : new AcademicEmailDeliveryError('unknown', true, 'The academic email delivery failed.');
    const maxAttempts = this.config.get<number>('NOTIFICATION_MAX_DELIVERY_ATTEMPTS', 5);
    const terminal = !providerError.retryable || delivery.attemptCount >= maxAttempts;
    const schedule = this.config.get<number[]>('NOTIFICATION_RETRY_SCHEDULE_SECONDS', [60, 300, 900, 3600, 21600]);
    const delaySeconds = schedule[Math.min(Math.max(delivery.attemptCount - 1, 0), schedule.length - 1)] ?? 60;
    await this.prisma.notificationDelivery.updateMany({
      where: { tenantId: delivery.tenantId, id: delivery.id, status: 'PROCESSING' },
      data: {
        status: terminal ? 'FAILED' : 'RETRY',
        nextAttemptAt: terminal ? new Date() : new Date(Date.now() + delaySeconds * 1_000),
        lockedAt: null,
        lastErrorCategory: providerError.category,
        lastErrorMessage: providerError.message.slice(0, 500),
      },
    });
  }

  private pollIntervalMs(): number {
    return this.config.get<number>('NOTIFICATION_WORKER_POLL_INTERVAL_MS', 5_000);
  }

  private batchSize(): number {
    return this.config.get<number>('NOTIFICATION_WORKER_BATCH_SIZE', 50);
  }
}
