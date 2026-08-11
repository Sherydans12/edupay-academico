import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Environment } from '../config/environment';
import { PrismaService } from '../persistence/prisma.service';
import { EDUPAY_SOURCE } from './sync.constants';
import { EduPaySyncService } from './sync.service';

@Injectable()
export class SyncWorkerService {
  private readonly logger = new Logger(SyncWorkerService.name);

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(EduPaySyncService)
    private readonly sync: EduPaySyncService,
    @Inject(ConfigService)
    private readonly config: ConfigService<Environment, true>,
  ) {}

  async runOnce(): Promise<{ due: number; attempted: number }> {
    const now = new Date();
    const configurations = await this.prisma.syncConfiguration.findMany({
      where: {
        source: EDUPAY_SOURCE,
        enabled: true,
        OR: [{ nextIncrementalAt: { lte: now } }, { nextFullAt: { lte: now } }],
      },
      orderBy: [{ nextFullAt: 'asc' }, { nextIncrementalAt: 'asc' }],
    });
    let attempted = 0;
    for (const configuration of configurations) {
      const mode = configuration.nextFullAt <= now ? 'FULL' : 'INCREMENTAL';
      await this.executeWithBoundedRetry(configuration.tenantId, mode);
      attempted += 1;
      await this.scheduleNext(configuration.tenantId, mode);
    }
    return { due: configurations.length, attempted };
  }

  async checkReadiness(): Promise<{ database: 'ok' }> {
    await this.prisma.$queryRaw<[{ ok: number }]>`SELECT 1 AS ok`;
    return { database: 'ok' };
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
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            this.config.get('EDUPAY_SYNC_WORKER_POLL_INTERVAL_MS', 60_000),
          ),
        );
      }
    } finally {
      process.removeListener('SIGINT', stop);
      process.removeListener('SIGTERM', stop);
    }
  }

  private async executeWithBoundedRetry(
    tenantId: string,
    mode: 'INCREMENTAL' | 'FULL',
  ): Promise<void> {
    const attempts = this.config.get('EDUPAY_SYNC_MAX_RUN_ATTEMPTS', 3);
    const schedule = this.config.get(
      'EDUPAY_SYNC_RETRY_SCHEDULE_SECONDS',
      [60, 300, 900, 3600, 21_600],
    );
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const result = await this.sync.execute(tenantId, mode, 'SCHEDULED');
        if (!result.retryable || attempt === attempts) return;
      } catch {
        this.logger.error({
          event: 'edupay_sync_orchestration_failed',
          mode,
          tenantId,
        });
        return;
      }
      const delaySeconds =
        schedule[Math.min(attempt - 1, schedule.length - 1)] ?? 60;
      await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1_000));
    }
  }

  private async scheduleNext(
    tenantId: string,
    mode: 'INCREMENTAL' | 'FULL',
  ): Promise<void> {
    const now = new Date();
    if (mode === 'INCREMENTAL') {
      const interval = this.config.get(
        'EDUPAY_SYNC_INCREMENTAL_INTERVAL_MINUTES',
        60,
      );
      await this.prisma.syncConfiguration.update({
        where: { tenantId_source: { tenantId, source: EDUPAY_SOURCE } },
        data: {
          nextIncrementalAt: new Date(now.getTime() + interval * 60_000),
        },
      });
      return;
    }
    const nextFullAt = this.nextUtcFull(now);
    const interval = this.config.get(
      'EDUPAY_SYNC_INCREMENTAL_INTERVAL_MINUTES',
      60,
    );
    await this.prisma.syncConfiguration.update({
      where: { tenantId_source: { tenantId, source: EDUPAY_SOURCE } },
      data: {
        nextFullAt,
        nextIncrementalAt: new Date(now.getTime() + interval * 60_000),
      },
    });
  }

  private nextUtcFull(now: Date): Date {
    const hour = this.config.get('EDUPAY_SYNC_FULL_HOUR_UTC', 2);
    const next = new Date(now);
    next.setUTCMinutes(0, 0, 0);
    next.setUTCHours(hour);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }
}
