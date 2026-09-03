import { Injectable, Logger } from '@nestjs/common';
import {
  ACADEMIC_FINANCIAL_PROJECTION_SCHEMA_VERSION,
  academicFinancialProjectionEventSchema,
} from '@edupay/contracts';
import type { FinancialProjectionOutboxStatus } from '../generated/prisma/client';

import { PrismaService } from '../persistence/prisma.service';
import { FinancialProjectionConfigService } from './financial-projection-config.service';

const publishableStatuses: FinancialProjectionOutboxStatus[] = [
  'PENDING',
  'RETRY',
];

@Injectable()
export class FinancialProjectionPublisherService {
  private readonly logger = new Logger(
    FinancialProjectionPublisherService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: FinancialProjectionConfigService,
  ) {}

  /** Runs one bounded outbox drain. It is safe to invoke repeatedly or after a restart. */
  async publishPending(
    limit = 50,
  ): Promise<{ published: number; attempted: number }> {
    if (!this.config.publisherEnabled()) return { published: 0, attempted: 0 };
    const settings = this.config.publisherConfiguration();
    const now = new Date();
    await this.prisma.financialProjectionOutboxEvent.updateMany({
      where: {
        status: 'PUBLISHING',
        publishingAt: { lt: new Date(now.getTime() - settings.timeoutMs * 3) },
      },
      data: {
        status: 'RETRY',
        nextAttemptAt: now,
        publishingAt: null,
        lastErrorCode: 'LEASE_RECOVERED',
      },
    });
    const candidates =
      await this.prisma.financialProjectionOutboxEvent.findMany({
        where: {
          status: { in: publishableStatuses },
          nextAttemptAt: { lte: now },
        },
        orderBy: [{ nextAttemptAt: 'asc' }, { sequence: 'asc' }],
        take: Math.min(Math.max(limit, 1), 100),
        select: { id: true },
      });
    let published = 0;
    for (const candidate of candidates) {
      const claimed =
        await this.prisma.financialProjectionOutboxEvent.updateMany({
          where: {
            id: candidate.id,
            status: { in: publishableStatuses },
            nextAttemptAt: { lte: now },
          },
          data: {
            status: 'PUBLISHING',
            publishingAt: new Date(),
            attemptCount: { increment: 1 },
          },
        });
      if (claimed.count !== 1) continue;
      const event =
        await this.prisma.financialProjectionOutboxEvent.findUniqueOrThrow({
          where: { id: candidate.id },
        });
      try {
        const body = academicFinancialProjectionEventSchema.parse({
          eventId: event.id,
          eventType: event.eventType,
          schemaVersion: ACADEMIC_FINANCIAL_PROJECTION_SCHEMA_VERSION,
          canonicalTenantId: event.tenantId,
          aggregateType: 'ACADEMIC_ENROLLMENT',
          aggregateId: event.aggregateId,
          entityVersion: Number(event.entityVersion),
          occurredAt: event.occurredAt.toISOString(),
          correlationId: event.correlationId,
          payload: event.payload,
        });
        const response = await this.post(settings, body);
        if (!response.ok) throw new Error(`HTTP_${response.status}`);
        await this.prisma.financialProjectionOutboxEvent.updateMany({
          where: { id: event.id, status: 'PUBLISHING' },
          data: {
            status: 'PUBLISHED',
            publishedAt: new Date(),
            publishingAt: null,
            lastErrorCode: null,
          },
        });
        published += 1;
      } catch (error) {
        const attempt = event.attemptCount;
        const terminal = attempt >= settings.maxAttempts;
        const delay =
          settings.retryScheduleSeconds[
            Math.min(
              Math.max(attempt - 1, 0),
              settings.retryScheduleSeconds.length - 1,
            )
          ] ?? 60;
        const code = this.safeErrorCode(error);
        await this.prisma.financialProjectionOutboxEvent.updateMany({
          where: { id: event.id, status: 'PUBLISHING' },
          data: {
            status: terminal ? 'FAILED' : 'RETRY',
            publishingAt: null,
            nextAttemptAt: new Date(Date.now() + delay * 1_000),
            lastErrorCode: code,
          },
        });
        this.logger.warn({
          action: 'FINANCIAL_PROJECTION_PUBLISH_FAILED',
          eventId: event.id,
          attempt,
          terminal,
          code,
        });
      }
    }
    return { published, attempted: candidates.length };
  }

  private async post(
    settings: ReturnType<
      FinancialProjectionConfigService['publisherConfiguration']
    >,
    body: unknown,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), settings.timeoutMs);
    try {
      return await fetch(
        `${settings.baseUrl}/api/integrations/academic-financial-projection/events`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${settings.token}`,
            'Content-Type': 'application/json',
            'X-EduPay-Service': 'ACADEMIC_PRODUCER',
            'X-EduPay-Service-Key-Id': settings.keyId,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private safeErrorCode(error: unknown): string {
    const raw = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
    return raw.replace(/[^A-Z0-9_:-]/gi, '_').slice(0, 80) || 'UNKNOWN_ERROR';
  }
}
