import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import type { Environment } from '../config/environment';
import { Prisma } from '../generated/prisma/client';
import type {
  SyncEntity,
  SyncMode,
  SyncTrigger,
} from '../generated/prisma/client';
import { PrismaService } from '../persistence/prisma.service';
import {
  EduPayIntegrationClient,
  EduPayIntegrationError,
} from './edupay-integration.client';
import type {
  EduPayCourseItem,
  EduPayStudentItem,
} from './edupay-source.contract';
import { EDUPAY_SCHEMA_VERSION, EDUPAY_SOURCE } from './sync.constants';
import {
  safeSyncItemErrorCode,
  SyncItemApplicationService,
} from './sync-item-application.service';

type RunCounters = {
  seenCount: number;
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  deactivatedCount: number;
  conflictedCount: number;
  failedCount: number;
  pageCount: number;
  evidenceTruncated: boolean;
};

type DrainedEntity = {
  readonly safeToAdvance: boolean;
  readonly terminalWatermark: string;
};

type LeaseHeartbeat = {
  readonly renewAfterMs: number;
  readonly runId: string;
  readonly tenantId: string;
  lastRenewedAtMs: number;
};

type SourceConflict = {
  readonly code: string;
  readonly entity: 'COURSE' | 'STUDENT';
  readonly integrationId: string;
  readonly sourceTenantId: string;
};

export type SyncExecutionResult = {
  readonly runId: string;
  readonly status: 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'SOURCE_UNAVAILABLE';
  readonly retryable: boolean;
  readonly counts: Omit<RunCounters, 'evidenceTruncated'>;
};

export class SyncConfigurationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

@Injectable()
export class EduPaySyncService {
  private readonly logger = new Logger(EduPaySyncService.name);

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(EduPayIntegrationClient)
    private readonly client: EduPayIntegrationClient,
    @Inject(SyncItemApplicationService)
    private readonly items: SyncItemApplicationService,
    @Inject(ConfigService)
    private readonly config: ConfigService<Environment, true>,
  ) {}

  async execute(
    tenantId: string,
    mode: SyncMode,
    trigger: SyncTrigger,
  ): Promise<SyncExecutionResult> {
    const configuration = await this.configuration(tenantId);
    const runId = randomUUID();
    const correlationId = `edupay-sync:${runId}`;
    const counters = this.emptyCounters();
    let retryable = false;
    let errorCode: string | null = null;
    let status: SyncExecutionResult['status'] = 'FAILED';
    let watermarkAdvanced = false;
    let snapshotComplete = false;

    await this.prisma.syncRun.create({
      data: {
        id: runId,
        tenantId,
        source: EDUPAY_SOURCE,
        mode,
        trigger,
        correlationId,
        sourceSchemaVersion: EDUPAY_SCHEMA_VERSION,
        sourceTenantId: configuration.sourceTenantId,
      },
    });

    const acquired = await this.acquireLease(tenantId, runId);
    if (!acquired) {
      errorCode = 'SYNC_ALREADY_RUNNING';
      await this.finalizeRun({
        tenantId,
        runId,
        counters,
        status: 'FAILED',
        errorCode,
        retryable: false,
        watermarkAdvanced: false,
        snapshotComplete: false,
      });
      return {
        runId,
        status: 'FAILED',
        retryable: false,
        counts: this.publicCounts(counters),
      };
    }
    const heartbeat = this.createLeaseHeartbeat(tenantId, runId);

    this.logger.log({
      event: 'edupay_sync_started',
      correlationId,
      mode,
      runId,
      sourceTenantId: configuration.sourceTenantId,
      tenantId,
    });

    try {
      if (mode === 'INCREMENTAL') {
        const result = await this.incremental(
          configuration,
          runId,
          correlationId,
          counters,
          heartbeat,
        );
        watermarkAdvanced = result.watermarkAdvanced;
      } else {
        const result = await this.full(
          configuration,
          runId,
          correlationId,
          counters,
          heartbeat,
        );
        watermarkAdvanced = result.watermarkAdvanced;
        snapshotComplete = result.snapshotComplete;
      }
      status =
        mode === 'FULL' &&
        snapshotComplete &&
        watermarkAdvanced &&
        counters.failedCount === 0
          ? 'SUCCEEDED'
          : counters.failedCount > 0 || counters.conflictedCount > 0
            ? 'PARTIAL'
            : 'SUCCEEDED';
    } catch (error) {
      if (error instanceof EduPayIntegrationError) {
        errorCode = error.code;
        retryable = error.retryable;
        status = error.sourceUnavailable ? 'SOURCE_UNAVAILABLE' : 'FAILED';
      } else if (error instanceof SyncConfigurationError) {
        errorCode = error.code;
        status = 'FAILED';
      } else {
        errorCode = 'SYNC_RUN_FAILED';
        status = 'FAILED';
      }
    } finally {
      await this.prisma.syncFullPresence.deleteMany({
        where: { tenantId, runId },
      });
      await this.releaseLease(tenantId, runId);
      await this.finalizeRun({
        tenantId,
        runId,
        counters,
        status,
        errorCode,
        retryable,
        watermarkAdvanced,
        snapshotComplete,
      });
      await this.pruneEvidence(tenantId);
    }

    this.logger.log({
      event: 'edupay_sync_completed',
      correlationId,
      durationMs: await this.runDuration(runId, tenantId),
      errorCode,
      mode,
      pageCount: counters.pageCount,
      resultCounts: this.publicCounts(counters),
      runId,
      snapshotComplete,
      sourceTenantId: configuration.sourceTenantId,
      status,
      tenantId,
      watermarkAdvanced,
    });

    return {
      runId,
      status,
      retryable,
      counts: this.publicCounts(counters),
    };
  }

  private async incremental(
    configuration: Awaited<ReturnType<EduPaySyncService['configuration']>>,
    runId: string,
    correlationId: string,
    counters: RunCounters,
    heartbeat: LeaseHeartbeat,
  ): Promise<{ watermarkAdvanced: boolean }> {
    const states = await this.prisma.syncState.findMany({
      where: {
        tenantId: configuration.tenantId,
        source: EDUPAY_SOURCE,
        entity: { in: ['COURSE', 'STUDENT'] },
      },
    });
    const watermarks = new Map(
      states.map((state) => [state.entity, state.watermark]),
    );
    let watermarkAdvanced = false;

    const courses = await this.drainCourses({
      configuration,
      correlationId,
      counters,
      mode: 'incremental',
      runId,
      watermark: watermarks.get('COURSE') ?? undefined,
      heartbeat,
    });
    if (courses.safeToAdvance) {
      await this.heartbeatLease(heartbeat, true);
      await this.persistWatermark(
        configuration.tenantId,
        'COURSE',
        courses.terminalWatermark,
      );
      watermarkAdvanced = true;
    }

    const students = await this.drainStudents({
      configuration,
      correlationId,
      counters,
      mode: 'incremental',
      runId,
      watermark: watermarks.get('STUDENT') ?? undefined,
      heartbeat,
    });
    if (students.safeToAdvance) {
      await this.heartbeatLease(heartbeat, true);
      await this.persistWatermark(
        configuration.tenantId,
        'STUDENT',
        students.terminalWatermark,
      );
      watermarkAdvanced = true;
    }
    return { watermarkAdvanced };
  }

  private async full(
    configuration: Awaited<ReturnType<EduPaySyncService['configuration']>>,
    runId: string,
    correlationId: string,
    counters: RunCounters,
    heartbeat: LeaseHeartbeat,
  ): Promise<{ watermarkAdvanced: boolean; snapshotComplete: boolean }> {
    await this.heartbeatLease(heartbeat, true);
    const snapshot = await this.client.createSnapshot(
      configuration.sourceTenantId,
      correlationId,
    );
    await this.heartbeatLease(heartbeat, true);
    const courses = await this.drainCourses({
      configuration,
      correlationId,
      counters,
      mode: 'full',
      runId,
      snapshot: snapshot.snapshotToken,
      snapshotRunId: snapshot.snapshot.runId,
      heartbeat,
    });
    const students = await this.drainStudents({
      configuration,
      correlationId,
      counters,
      mode: 'full',
      runId,
      snapshot: snapshot.snapshotToken,
      snapshotRunId: snapshot.snapshot.runId,
      heartbeat,
    });
    await this.heartbeatLease(heartbeat, true);
    const completed = await this.client.completeSnapshot(
      configuration.sourceTenantId,
      correlationId,
      {
        snapshot: snapshot.snapshotToken,
        courseWatermark: courses.terminalWatermark,
        studentWatermark: students.terminalWatermark,
      },
    );
    await this.heartbeatLease(heartbeat, true);
    if (
      completed.snapshot.runId !== snapshot.snapshot.runId ||
      !completed.snapshot.complete
    ) {
      throw new EduPayIntegrationError('INCOMPLETE_SNAPSHOT', false, false);
    }

    const targetComplete =
      courses.safeToAdvance &&
      students.safeToAdvance &&
      counters.failedCount === 0;
    if (!targetComplete) {
      return { watermarkAdvanced: false, snapshotComplete: true };
    }

    await this.heartbeatLease(heartbeat, true);
    const absenceDeactivated = await this.applyCompleteFullGeneration(
      configuration.tenantId,
      runId,
      courses.terminalWatermark,
      students.terminalWatermark,
    );
    counters.deactivatedCount += absenceDeactivated;
    return { watermarkAdvanced: true, snapshotComplete: true };
  }

  private async drainCourses(input: {
    configuration: Awaited<ReturnType<EduPaySyncService['configuration']>>;
    correlationId: string;
    counters: RunCounters;
    heartbeat: LeaseHeartbeat;
    mode: 'incremental' | 'full';
    runId: string;
    snapshot?: string | undefined;
    snapshotRunId?: string | undefined;
    watermark?: string | undefined;
  }): Promise<DrainedEntity> {
    const items: EduPayCourseItem[] = [];
    const conflicts: SourceConflict[] = [];
    let cursor: string | undefined;
    let terminalWatermark: string | null = null;
    let sourceRunId: string | undefined;
    do {
      await this.heartbeatLease(input.heartbeat, true);
      const page =
        input.mode === 'full'
          ? await this.client.courseFeed(
              input.configuration.sourceTenantId,
              input.correlationId,
              {
                mode: 'full',
                ...(cursor ? { cursor } : { snapshot: input.snapshot }),
              },
            )
          : await this.client.courseFeed(
              input.configuration.sourceTenantId,
              input.correlationId,
              {
                mode: 'incremental',
                ...(cursor ? { cursor } : { watermark: input.watermark }),
              },
            );
      await this.heartbeatLease(input.heartbeat, true);
      this.assertPageScope(
        page.sourceTenantId,
        input.configuration.sourceTenantId,
      );
      const descriptorRunId =
        page.mode === 'full' ? page.snapshot.runId : page.run.runId;
      sourceRunId ??= descriptorRunId;
      if (
        descriptorRunId !== sourceRunId ||
        (input.snapshotRunId && descriptorRunId !== input.snapshotRunId)
      ) {
        throw new EduPayIntegrationError('SOURCE_RUN_MISMATCH', false, false);
      }
      items.push(...page.items);
      conflicts.push(...page.conflicts);
      input.counters.pageCount += 1;
      cursor = page.page.nextCursor ?? undefined;
      terminalWatermark = page.watermark.next;
    } while (cursor);
    if (!terminalWatermark) {
      throw new EduPayIntegrationError(
        'SOURCE_TERMINAL_WATERMARK_MISSING',
        false,
        false,
      );
    }

    const duplicates = this.duplicateIds(items);
    let safeToAdvance = true;
    for (const conflict of conflicts) {
      await this.heartbeatLease(input.heartbeat);
      await this.processSourceConflict(
        input.configuration.tenantId,
        input.configuration.sourceTenantId,
        input.runId,
        input.mode,
        conflict,
        input.counters,
      );
      await this.heartbeatLease(input.heartbeat);
    }
    for (const item of items) {
      await this.heartbeatLease(input.heartbeat);
      this.assertPageScope(
        item.sourceTenantId,
        input.configuration.sourceTenantId,
      );
      input.counters.seenCount += 1;
      if (input.mode === 'full') {
        await this.markPresence(
          input.configuration.tenantId,
          input.runId,
          'COURSE',
          item.integrationId,
        );
      }
      if (duplicates.has(item.integrationId)) {
        safeToAdvance = false;
        await this.recordEvidence(
          input.configuration.tenantId,
          input.runId,
          'COURSE',
          item.integrationId,
          null,
          'CONFLICT',
          'SOURCE_DUPLICATE_INTEGRATION_ID',
          false,
          input.counters,
        );
        input.counters.conflictedCount += 1;
        await this.heartbeatLease(input.heartbeat);
        continue;
      }
      if (!(await this.applyCourseItem(input, item))) safeToAdvance = false;
      await this.heartbeatLease(input.heartbeat);
    }
    return { safeToAdvance, terminalWatermark };
  }

  private async drainStudents(input: {
    configuration: Awaited<ReturnType<EduPaySyncService['configuration']>>;
    correlationId: string;
    counters: RunCounters;
    heartbeat: LeaseHeartbeat;
    mode: 'incremental' | 'full';
    runId: string;
    snapshot?: string | undefined;
    snapshotRunId?: string | undefined;
    watermark?: string | undefined;
  }): Promise<DrainedEntity> {
    const items: EduPayStudentItem[] = [];
    const conflicts: SourceConflict[] = [];
    let cursor: string | undefined;
    let terminalWatermark: string | null = null;
    let sourceRunId: string | undefined;
    do {
      await this.heartbeatLease(input.heartbeat, true);
      const page =
        input.mode === 'full'
          ? await this.client.studentFeed(
              input.configuration.sourceTenantId,
              input.correlationId,
              {
                mode: 'full',
                ...(cursor ? { cursor } : { snapshot: input.snapshot }),
              },
            )
          : await this.client.studentFeed(
              input.configuration.sourceTenantId,
              input.correlationId,
              {
                mode: 'incremental',
                ...(cursor ? { cursor } : { watermark: input.watermark }),
              },
            );
      await this.heartbeatLease(input.heartbeat, true);
      this.assertPageScope(
        page.sourceTenantId,
        input.configuration.sourceTenantId,
      );
      const descriptorRunId =
        page.mode === 'full' ? page.snapshot.runId : page.run.runId;
      sourceRunId ??= descriptorRunId;
      if (
        descriptorRunId !== sourceRunId ||
        (input.snapshotRunId && descriptorRunId !== input.snapshotRunId)
      ) {
        throw new EduPayIntegrationError('SOURCE_RUN_MISMATCH', false, false);
      }
      items.push(...page.items);
      conflicts.push(...page.conflicts);
      input.counters.pageCount += 1;
      cursor = page.page.nextCursor ?? undefined;
      terminalWatermark = page.watermark.next;
    } while (cursor);
    if (!terminalWatermark) {
      throw new EduPayIntegrationError(
        'SOURCE_TERMINAL_WATERMARK_MISSING',
        false,
        false,
      );
    }

    let safeToAdvance = true;
    const duplicates = this.duplicateIds(items);
    for (const conflict of conflicts) {
      await this.heartbeatLease(input.heartbeat);
      await this.processSourceConflict(
        input.configuration.tenantId,
        input.configuration.sourceTenantId,
        input.runId,
        input.mode,
        conflict,
        input.counters,
      );
      await this.heartbeatLease(input.heartbeat);
    }
    for (const item of items) {
      await this.heartbeatLease(input.heartbeat);
      this.assertPageScope(
        item.sourceTenantId,
        input.configuration.sourceTenantId,
      );
      input.counters.seenCount += 1;
      if (input.mode === 'full') {
        await this.markPresence(
          input.configuration.tenantId,
          input.runId,
          'STUDENT',
          item.integrationId,
        );
      }
      if (duplicates.has(item.integrationId)) {
        safeToAdvance = false;
        await this.recordEvidence(
          input.configuration.tenantId,
          input.runId,
          'STUDENT',
          item.integrationId,
          null,
          'CONFLICT',
          'SOURCE_DUPLICATE_INTEGRATION_ID',
          false,
          input.counters,
        );
        input.counters.conflictedCount += 1;
        await this.heartbeatLease(input.heartbeat);
        continue;
      }
      if (!(await this.applyStudentItem(input, item))) safeToAdvance = false;
      await this.heartbeatLease(input.heartbeat);
    }
    return { safeToAdvance, terminalWatermark };
  }

  private async applyCourseItem(
    input: Parameters<EduPaySyncService['drainCourses']>[0],
    item: EduPayCourseItem,
  ): Promise<boolean> {
    try {
      const result = await this.items.applyCourse(
        {
          academicYearId: input.configuration.academicYearId,
          correlationId: input.correlationId,
          source: EDUPAY_SOURCE,
          tenantId: input.configuration.tenantId,
        },
        item,
      );
      this.countApplied(input.counters, result);
      if (result.error) {
        input.counters.failedCount += 1;
        await this.recordEvidence(
          input.configuration.tenantId,
          input.runId,
          'COURSE',
          item.integrationId,
          result.targetId,
          'FAILED',
          result.error.code,
          result.error.retryable,
          input.counters,
        );
        return false;
      } else {
        await this.resolveEvidence(
          input.configuration.tenantId,
          'COURSE',
          item.integrationId,
        );
      }
      return true;
    } catch (error) {
      input.counters.failedCount += 1;
      await this.recordEvidence(
        input.configuration.tenantId,
        input.runId,
        'COURSE',
        item.integrationId,
        null,
        'FAILED',
        safeSyncItemErrorCode(error),
        true,
        input.counters,
      );
      return false;
    }
  }

  private async applyStudentItem(
    input: Parameters<EduPaySyncService['drainStudents']>[0],
    item: EduPayStudentItem,
  ): Promise<boolean> {
    try {
      const result = await this.items.applyStudent(
        {
          academicYearId: input.configuration.academicYearId,
          correlationId: input.correlationId,
          source: EDUPAY_SOURCE,
          tenantId: input.configuration.tenantId,
        },
        item,
      );
      this.countApplied(input.counters, result);
      if (result.error) {
        input.counters.failedCount += 1;
        await this.recordEvidence(
          input.configuration.tenantId,
          input.runId,
          'STUDENT',
          item.integrationId,
          result.targetId,
          'FAILED',
          result.error.code,
          result.error.retryable,
          input.counters,
        );
        return false;
      }
      await this.resolveEvidence(
        input.configuration.tenantId,
        'STUDENT',
        item.integrationId,
      );
      return true;
    } catch (error) {
      input.counters.failedCount += 1;
      await this.recordEvidence(
        input.configuration.tenantId,
        input.runId,
        'STUDENT',
        item.integrationId,
        null,
        'FAILED',
        safeSyncItemErrorCode(error),
        true,
        input.counters,
      );
      return false;
    }
  }

  private async processSourceConflict(
    tenantId: string,
    expectedSourceTenantId: string,
    runId: string,
    mode: 'incremental' | 'full',
    conflict: SourceConflict,
    counters: RunCounters,
  ): Promise<void> {
    this.assertPageScope(conflict.sourceTenantId, expectedSourceTenantId);
    counters.seenCount += 1;
    counters.conflictedCount += 1;
    if (mode === 'full') {
      await this.markPresence(
        tenantId,
        runId,
        conflict.entity,
        conflict.integrationId,
      );
    }
    await this.recordEvidence(
      tenantId,
      runId,
      conflict.entity,
      conflict.integrationId,
      null,
      'CONFLICT',
      conflict.code,
      false,
      counters,
    );
  }

  private async applyCompleteFullGeneration(
    tenantId: string,
    runId: string,
    courseWatermark: string,
    studentWatermark: string,
  ): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      await this.renewLeaseInTransaction(tx, tenantId, runId);
      const configuration = await tx.syncConfiguration.update({
        where: { tenantId_source: { tenantId, source: EDUPAY_SOURCE } },
        data: { fullGeneration: { increment: 1 } },
        select: { fullGeneration: true },
      });
      const generation = configuration.fullGeneration;

      await tx.$executeRaw(Prisma.sql`
        UPDATE courses AS course
        SET last_seen_full_generation = ${generation},
            consecutive_absences = 0,
            updated_at = CURRENT_TIMESTAMP
        WHERE course.tenant_id = ${tenantId}
          AND course.source = ${EDUPAY_SOURCE}
          AND EXISTS (
            SELECT 1 FROM sync_full_presences AS presence
            WHERE presence.tenant_id = ${tenantId}
              AND presence.run_id = ${runId}::uuid
              AND presence.entity = 'COURSE'::"SyncEntity"
              AND presence.external_reference = course.external_reference
          )
      `);
      await tx.$executeRaw(Prisma.sql`
        UPDATE students AS student
        SET last_seen_full_generation = ${generation},
            consecutive_absences = 0,
            updated_at = CURRENT_TIMESTAMP
        WHERE student.tenant_id = ${tenantId}
          AND student.source = ${EDUPAY_SOURCE}
          AND EXISTS (
            SELECT 1 FROM sync_full_presences AS presence
            WHERE presence.tenant_id = ${tenantId}
              AND presence.run_id = ${runId}::uuid
              AND presence.entity = 'STUDENT'::"SyncEntity"
              AND presence.external_reference = student.external_reference
          )
      `);
      await tx.$executeRaw(Prisma.sql`
        UPDATE courses AS course
        SET consecutive_absences = course.consecutive_absences + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE course.tenant_id = ${tenantId}
          AND course.source = ${EDUPAY_SOURCE}
          AND NOT EXISTS (
            SELECT 1 FROM sync_full_presences AS presence
            WHERE presence.tenant_id = ${tenantId}
              AND presence.run_id = ${runId}::uuid
              AND presence.entity = 'COURSE'::"SyncEntity"
              AND presence.external_reference = course.external_reference
          )
      `);
      await tx.$executeRaw(Prisma.sql`
        UPDATE students AS student
        SET consecutive_absences = student.consecutive_absences + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE student.tenant_id = ${tenantId}
          AND student.source = ${EDUPAY_SOURCE}
          AND NOT EXISTS (
            SELECT 1 FROM sync_full_presences AS presence
            WHERE presence.tenant_id = ${tenantId}
              AND presence.run_id = ${runId}::uuid
              AND presence.entity = 'STUDENT'::"SyncEntity"
              AND presence.external_reference = student.external_reference
          )
      `);
      const archivedCourses = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          UPDATE courses
          SET status = 'ARCHIVED'::"CourseStatus", updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = ${tenantId}
            AND source = ${EDUPAY_SOURCE}
            AND consecutive_absences >= 2
            AND status <> 'ARCHIVED'::"CourseStatus"
          RETURNING id::text AS id
        `,
      );
      const inactiveStudents = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          UPDATE students
          SET status = 'INACTIVE'::"PersonStatus", updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = ${tenantId}
            AND source = ${EDUPAY_SOURCE}
            AND consecutive_absences >= 2
            AND status <> 'INACTIVE'::"PersonStatus"
          RETURNING id::text AS id
        `,
      );
      const enrollments = await tx.courseEnrollment.updateMany({
        where: {
          tenantId,
          source: EDUPAY_SOURCE,
          status: 'ACTIVE',
          OR: [
            { course: { status: 'ARCHIVED' } },
            { student: { status: 'INACTIVE' } },
          ],
        },
        data: { status: 'INACTIVE', lastSyncedAt: new Date() },
      });
      for (const [entity, watermark] of [
        ['COURSE', courseWatermark],
        ['STUDENT', studentWatermark],
      ] as const) {
        await tx.syncState.upsert({
          where: {
            tenantId_source_entity: {
              tenantId,
              source: EDUPAY_SOURCE,
              entity,
            },
          },
          create: {
            tenantId,
            source: EDUPAY_SOURCE,
            entity,
            watermark,
            lastSuccessAt: new Date(),
          },
          update: { watermark, lastSuccessAt: new Date() },
        });
      }
      await tx.syncFullPresence.deleteMany({ where: { tenantId, runId } });
      return (
        archivedCourses.length + inactiveStudents.length + enrollments.count
      );
    });
  }

  private async configuration(tenantId: string) {
    const configuration = await this.prisma.syncConfiguration.findUnique({
      where: { tenantId_source: { tenantId, source: EDUPAY_SOURCE } },
      include: { academicYear: true },
    });
    if (!configuration || !configuration.enabled) {
      throw new SyncConfigurationError(
        'SYNC_CONFIGURATION_DISABLED',
        'The tenant does not have an enabled EduPay synchronization configuration.',
      );
    }
    if (configuration.academicYear.status !== 'ACTIVE') {
      throw new SyncConfigurationError(
        'SYNC_ACADEMIC_YEAR_NOT_ACTIVE',
        'The configured AcademicYear must be active.',
      );
    }
    return configuration;
  }

  private async acquireLease(
    tenantId: string,
    runId: string,
  ): Promise<boolean> {
    const leaseSeconds = this.config.get('EDUPAY_SYNC_LEASE_SECONDS', 900);
    const rows = await this.prisma.$queryRaw<Array<{ ownerRunId: string }>>(
      Prisma.sql`
        INSERT INTO sync_leases (
          tenant_id, source, owner_run_id, locked_until, updated_at
        ) VALUES (
          ${tenantId}, ${EDUPAY_SOURCE}, ${runId}::uuid,
          CURRENT_TIMESTAMP + (${leaseSeconds} * INTERVAL '1 second'),
          CURRENT_TIMESTAMP
        )
        ON CONFLICT (tenant_id, source) DO UPDATE
        SET owner_run_id = EXCLUDED.owner_run_id,
            locked_until = EXCLUDED.locked_until,
            updated_at = CURRENT_TIMESTAMP
        WHERE sync_leases.locked_until <= CURRENT_TIMESTAMP
        RETURNING owner_run_id::text AS "ownerRunId"
      `,
    );
    return rows[0]?.ownerRunId === runId;
  }

  private createLeaseHeartbeat(
    tenantId: string,
    runId: string,
  ): LeaseHeartbeat {
    const leaseSeconds = this.config.get('EDUPAY_SYNC_LEASE_SECONDS', 900);
    return {
      tenantId,
      runId,
      renewAfterMs: Math.max(1_000, Math.floor((leaseSeconds * 1_000) / 3)),
      lastRenewedAtMs: this.heartbeatNow(),
    };
  }

  private heartbeatNow(): number {
    return performance.now();
  }

  private async heartbeatLease(
    heartbeat: LeaseHeartbeat,
    force = false,
  ): Promise<void> {
    const now = this.heartbeatNow();
    if (!force && now - heartbeat.lastRenewedAtMs < heartbeat.renewAfterMs) {
      return;
    }
    await this.renewLease(heartbeat.tenantId, heartbeat.runId);
    heartbeat.lastRenewedAtMs = this.heartbeatNow();
  }

  private async renewLease(tenantId: string, runId: string): Promise<void> {
    const leaseSeconds = this.config.get('EDUPAY_SYNC_LEASE_SECONDS', 900);
    const renewed = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE sync_leases
      SET locked_until = CURRENT_TIMESTAMP + (${leaseSeconds} * INTERVAL '1 second'),
          updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = ${tenantId}
        AND source = ${EDUPAY_SOURCE}
        AND owner_run_id = ${runId}::uuid
        AND locked_until > CURRENT_TIMESTAMP
    `);
    this.assertLeaseRenewed(renewed);
  }

  private async renewLeaseInTransaction(
    tx: Prisma.TransactionClient,
    tenantId: string,
    runId: string,
  ): Promise<void> {
    const leaseSeconds = this.config.get('EDUPAY_SYNC_LEASE_SECONDS', 900);
    const renewed = await tx.$executeRaw(Prisma.sql`
      UPDATE sync_leases
      SET locked_until = CURRENT_TIMESTAMP + (${leaseSeconds} * INTERVAL '1 second'),
          updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = ${tenantId}
        AND source = ${EDUPAY_SOURCE}
        AND owner_run_id = ${runId}::uuid
        AND locked_until > CURRENT_TIMESTAMP
    `);
    this.assertLeaseRenewed(renewed);
  }

  private assertLeaseRenewed(renewed: number): void {
    if (renewed === 1) return;
    throw new SyncConfigurationError(
      'SYNC_LEASE_LOST',
      'The synchronization execution lease was lost.',
    );
  }

  private async releaseLease(tenantId: string, runId: string): Promise<void> {
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE sync_leases
      SET locked_until = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = ${tenantId}
        AND source = ${EDUPAY_SOURCE}
        AND owner_run_id = ${runId}::uuid
    `);
  }

  private async persistWatermark(
    tenantId: string,
    entity: SyncEntity,
    watermark: string,
  ): Promise<void> {
    await this.prisma.syncState.upsert({
      where: {
        tenantId_source_entity: {
          tenantId,
          source: EDUPAY_SOURCE,
          entity,
        },
      },
      create: {
        tenantId,
        source: EDUPAY_SOURCE,
        entity,
        watermark,
        lastSuccessAt: new Date(),
      },
      update: { watermark, lastSuccessAt: new Date() },
    });
  }

  private async markPresence(
    tenantId: string,
    runId: string,
    entity: SyncEntity,
    externalReference: string,
  ): Promise<void> {
    await this.prisma.syncFullPresence.upsert({
      where: {
        tenantId_runId_entity_externalReference: {
          tenantId,
          runId,
          entity,
          externalReference,
        },
      },
      create: { tenantId, runId, entity, externalReference },
      update: {},
    });
  }

  private async recordEvidence(
    tenantId: string,
    runId: string,
    entity: SyncEntity,
    externalReference: string | null,
    targetId: string | null,
    outcome: 'CONFLICT' | 'FAILED',
    code: string,
    retryable: boolean,
    counters: RunCounters,
  ): Promise<void> {
    const limit = this.config.get('EDUPAY_SYNC_ITEM_EVIDENCE_LIMIT', 500);
    const currentEvidence = counters.conflictedCount + counters.failedCount;
    if (currentEvidence > limit) {
      counters.evidenceTruncated = true;
      return;
    }
    await this.prisma.syncItemResult.create({
      data: {
        tenantId,
        runId,
        entity,
        externalReference,
        targetId,
        outcome,
        code,
        retryable,
      },
    });
  }

  private async resolveEvidence(
    tenantId: string,
    entity: SyncEntity,
    externalReference: string,
  ): Promise<void> {
    await this.prisma.syncItemResult.updateMany({
      where: { tenantId, entity, externalReference, resolvedAt: null },
      data: { resolvedAt: new Date() },
    });
  }

  private async finalizeRun(input: {
    tenantId: string;
    runId: string;
    counters: RunCounters;
    status: SyncExecutionResult['status'];
    errorCode: string | null;
    retryable: boolean;
    watermarkAdvanced: boolean;
    snapshotComplete: boolean;
  }): Promise<void> {
    await this.prisma.syncRun.update({
      where: {
        tenantId_id: { tenantId: input.tenantId, id: input.runId },
      },
      data: {
        status: input.status,
        seenCount: input.counters.seenCount,
        createdCount: input.counters.createdCount,
        updatedCount: input.counters.updatedCount,
        unchangedCount: input.counters.unchangedCount,
        deactivatedCount: input.counters.deactivatedCount,
        conflictedCount: input.counters.conflictedCount,
        failedCount: input.counters.failedCount,
        pageCount: input.counters.pageCount,
        evidenceTruncated: input.counters.evidenceTruncated,
        errorCode: input.errorCode,
        retryable: input.retryable,
        watermarkAdvanced: input.watermarkAdvanced,
        snapshotComplete: input.snapshotComplete,
        finishedAt: new Date(),
      },
    });
  }

  private async pruneEvidence(tenantId: string): Promise<void> {
    const retentionDays = this.config.get(
      'EDUPAY_SYNC_EVIDENCE_RETENTION_DAYS',
      30,
    );
    await this.prisma.syncItemResult.deleteMany({
      where: {
        tenantId,
        createdAt: {
          lt: new Date(Date.now() - retentionDays * 86_400_000),
        },
      },
    });
  }

  private countApplied(
    counters: RunCounters,
    result: {
      change: 'created' | 'updated' | 'unchanged';
      deactivated: number;
    },
  ): void {
    if (result.change === 'created') counters.createdCount += 1;
    else if (result.change === 'updated') counters.updatedCount += 1;
    else counters.unchangedCount += 1;
    counters.deactivatedCount += result.deactivated;
  }

  private duplicateIds<T extends { integrationId: string }>(
    items: T[],
  ): Set<string> {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const item of items) {
      if (seen.has(item.integrationId)) duplicates.add(item.integrationId);
      seen.add(item.integrationId);
    }
    return duplicates;
  }

  private assertPageScope(actual: string, expected: string): void {
    if (actual !== expected) {
      throw new EduPayIntegrationError('SOURCE_TENANT_MISMATCH', false, false);
    }
  }

  private emptyCounters(): RunCounters {
    return {
      seenCount: 0,
      createdCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      deactivatedCount: 0,
      conflictedCount: 0,
      failedCount: 0,
      pageCount: 0,
      evidenceTruncated: false,
    };
  }

  private publicCounts(
    counters: RunCounters,
  ): Omit<RunCounters, 'evidenceTruncated'> {
    return {
      seenCount: counters.seenCount,
      createdCount: counters.createdCount,
      updatedCount: counters.updatedCount,
      unchangedCount: counters.unchangedCount,
      deactivatedCount: counters.deactivatedCount,
      conflictedCount: counters.conflictedCount,
      failedCount: counters.failedCount,
      pageCount: counters.pageCount,
    };
  }

  private async runDuration(runId: string, tenantId: string): Promise<number> {
    const run = await this.prisma.syncRun.findUnique({
      where: { tenantId_id: { tenantId, id: runId } },
      select: { startedAt: true, finishedAt: true },
    });
    return run?.finishedAt
      ? run.finishedAt.getTime() - run.startedAt.getTime()
      : 0;
  }
}
