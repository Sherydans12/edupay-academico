import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../persistence/prisma.service';
import { EDUPAY_SOURCE } from './sync.constants';

@Injectable()
export class SyncStatusService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async forTenant(tenantId: string): Promise<object> {
    const [configuration, lastRun, lastIncremental, lastFull, conflicts] =
      await Promise.all([
        this.prisma.syncConfiguration.findUnique({
          where: {
            tenantId_source: { tenantId, source: EDUPAY_SOURCE },
          },
          include: { academicYear: { select: { label: true } } },
        }),
        this.prisma.syncRun.findFirst({
          where: { tenantId, source: EDUPAY_SOURCE },
          orderBy: { startedAt: 'desc' },
        }),
        this.prisma.syncRun.findFirst({
          where: {
            tenantId,
            source: EDUPAY_SOURCE,
            mode: 'INCREMENTAL',
            status: 'SUCCEEDED',
          },
          orderBy: { finishedAt: 'desc' },
          select: { finishedAt: true },
        }),
        this.prisma.syncRun.findFirst({
          where: {
            tenantId,
            source: EDUPAY_SOURCE,
            mode: 'FULL',
            status: 'SUCCEEDED',
          },
          orderBy: { finishedAt: 'desc' },
          select: { finishedAt: true },
        }),
        this.prisma.syncItemResult.count({
          where: { tenantId, resolvedAt: null },
        }),
      ]);
    return {
      source: EDUPAY_SOURCE,
      configured: configuration !== null,
      configuration: configuration
        ? {
            sourceTenantId: configuration.sourceTenantId,
            academicYearId: configuration.academicYearId,
            academicYearLabel: configuration.academicYear.label,
            enabled: configuration.enabled,
          }
        : null,
      lastIncrementalSuccessAt:
        lastIncremental?.finishedAt?.toISOString() ?? null,
      lastFullSuccessAt: lastFull?.finishedAt?.toISOString() ?? null,
      lastRun: lastRun
        ? {
            id: lastRun.id,
            mode: lastRun.mode,
            status: lastRun.status,
            startedAt: lastRun.startedAt.toISOString(),
            finishedAt: lastRun.finishedAt?.toISOString() ?? null,
            counts: {
              seen: lastRun.seenCount,
              created: lastRun.createdCount,
              updated: lastRun.updatedCount,
              unchanged: lastRun.unchangedCount,
              deactivated: lastRun.deactivatedCount,
              conflicted: lastRun.conflictedCount,
              failed: lastRun.failedCount,
            },
            errorCode: lastRun.errorCode,
          }
        : null,
      currentConflictCount: conflicts,
    };
  }
}
