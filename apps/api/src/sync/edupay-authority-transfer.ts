import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  ACADEMIC_AUDIT_PORT,
  type AcademicAuditPort,
} from '../academic/academic-audit.port';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../persistence/prisma.service';
import { EDUPAY_SOURCE, MANUAL_SOURCE } from './sync.constants';

/**
 * ADR-0026: moves the authority over records created by the EduPay sync v1
 * (`source = EDUPAY`) to Académico. Records keep their `externalReference`,
 * which stays the legacy link used by BL-002 and marks them as transferred.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const AUTHORITY_TRANSFER_USAGE =
  'Usage: pnpm sync:transfer-authority -- --tenant-id <canonical-uuid> ' +
  '[--apply --expect-students <n> --expect-courses <n> --expect-enrollments <n>]';

export class AuthorityTransferUsageError extends Error {}

export class AuthorityTransferConflictError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface AuthorityTransferCounts {
  readonly students: number;
  readonly courses: number;
  readonly enrollments: number;
}

export interface AuthorityTransferArguments {
  readonly tenantId: string;
  readonly apply: boolean;
  readonly expected: AuthorityTransferCounts | null;
}

export interface AuthorityTransferPlan {
  readonly tenantId: string;
  readonly toTransfer: AuthorityTransferCounts;
  readonly activeStudents: number;
  readonly activeEnrollments: number;
  readonly alreadyTransferred: AuthorityTransferCounts;
  readonly syncConfiguration: 'ENABLED' | 'DISABLED' | 'ABSENT';
  readonly syncLeaseHeld: boolean;
  readonly blockers: readonly string[];
}

export interface AuthorityTransferResult extends AuthorityTransferPlan {
  readonly applied: boolean;
  readonly transferred: AuthorityTransferCounts;
  readonly correlationId: string;
}

const EXPECT_OPTIONS = {
  '--expect-students': 'students',
  '--expect-courses': 'courses',
  '--expect-enrollments': 'enrollments',
} as const;

export function parseAuthorityTransferArguments(
  args: readonly string[],
): AuthorityTransferArguments {
  let tenantId: string | undefined;
  let apply = false;
  const expected: Partial<Record<keyof AuthorityTransferCounts, number>> = {};
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (option === '--apply' && !apply) {
      apply = true;
      continue;
    }
    const value = args[index + 1];
    index += 1;
    if (!option || !value) {
      throw new AuthorityTransferUsageError(AUTHORITY_TRANSFER_USAGE);
    }
    if (option === '--tenant-id' && !tenantId) {
      tenantId = value.toLowerCase();
    } else if (option in EXPECT_OPTIONS) {
      const key = EXPECT_OPTIONS[option as keyof typeof EXPECT_OPTIONS];
      if (expected[key] !== undefined || !/^\d+$/.test(value)) {
        throw new AuthorityTransferUsageError(AUTHORITY_TRANSFER_USAGE);
      }
      expected[key] = Number(value);
    } else {
      throw new AuthorityTransferUsageError(AUTHORITY_TRANSFER_USAGE);
    }
  }
  if (!tenantId || !UUID_PATTERN.test(tenantId)) {
    throw new AuthorityTransferUsageError(AUTHORITY_TRANSFER_USAGE);
  }
  const expectedCount = Object.keys(expected).length;
  if (apply && expectedCount !== 3) {
    throw new AuthorityTransferUsageError(
      '--apply requires --expect-students, --expect-courses and --expect-enrollments from the dry run.',
    );
  }
  if (!apply && expectedCount > 0) {
    throw new AuthorityTransferUsageError(AUTHORITY_TRANSFER_USAGE);
  }
  return {
    tenantId,
    apply,
    expected: apply ? (expected as AuthorityTransferCounts) : null,
  };
}

type Client = PrismaService | Prisma.TransactionClient;

/**
 * True once any EduPay record of the tenant was transferred to Académico.
 * The sync v1 must not run again for that tenant: it would recreate the
 * transferred records as new `EDUPAY` rows.
 */
export async function hasTransferredEduPayAuthority(
  client: Client,
  tenantId: string,
): Promise<boolean> {
  const transferred = { tenantId, source: MANUAL_SOURCE };
  const [student, course] = await Promise.all([
    client.student.findFirst({
      where: { ...transferred, externalReference: { not: null } },
      select: { id: true },
    }),
    client.course.findFirst({
      where: { ...transferred, externalReference: { not: null } },
      select: { id: true },
    }),
  ]);
  return Boolean(student ?? course);
}

@Injectable()
export class EduPayAuthorityTransferService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ACADEMIC_AUDIT_PORT) private readonly audit: AcademicAuditPort,
  ) {}

  plan(tenantId: string): Promise<AuthorityTransferPlan> {
    return this.inspect(this.prisma, tenantId);
  }

  async apply(
    tenantId: string,
    expected: AuthorityTransferCounts,
  ): Promise<AuthorityTransferResult> {
    const correlationId = randomUUID();
    const result = await this.prisma.$transaction(
      async (tx) => {
        const lease = await tx.$queryRaw<Array<{ ownerRunId: string }>>(
          Prisma.sql`
            INSERT INTO sync_leases (
              tenant_id, source, owner_run_id, locked_until, updated_at
            ) VALUES (
              ${tenantId}, ${EDUPAY_SOURCE}, ${correlationId}::uuid,
              CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
            ON CONFLICT (tenant_id, source) DO UPDATE
            SET owner_run_id = EXCLUDED.owner_run_id,
                locked_until = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE sync_leases.locked_until <= CURRENT_TIMESTAMP
            RETURNING owner_run_id::text AS "ownerRunId"
          `,
        );
        if (lease[0]?.ownerRunId !== correlationId) {
          throw new AuthorityTransferConflictError(
            'SYNC_RUN_IN_PROGRESS',
            'An EduPay sync run holds the tenant lease. Retry after it finishes.',
          );
        }
        const plan = await this.inspect(tx, tenantId, false);
        if (plan.blockers.length > 0) {
          throw new AuthorityTransferConflictError(
            plan.blockers[0] as string,
            `The transfer is blocked: ${plan.blockers.join(', ')}.`,
          );
        }
        const nothingLeft =
          plan.toTransfer.students === 0 &&
          plan.toTransfer.courses === 0 &&
          plan.toTransfer.enrollments === 0;
        if (
          !nothingLeft &&
          (plan.toTransfer.students !== expected.students ||
            plan.toTransfer.courses !== expected.courses ||
            plan.toTransfer.enrollments !== expected.enrollments)
        ) {
          throw new AuthorityTransferConflictError(
            'TRANSFER_COUNTS_CHANGED',
            `Expected ${JSON.stringify(expected)} but found ${JSON.stringify(plan.toTransfer)}. Run the dry run again.`,
          );
        }
        // Only this transaction may pass the EDUPAY identity trigger
        // (migration 20261120120000_edupay_authority_transfer).
        await tx.$executeRaw`SELECT set_config('edupay.authority_transfer', 'on', true)`;
        await tx.syncConfiguration.updateMany({
          where: { tenantId, source: EDUPAY_SOURCE, enabled: true },
          data: { enabled: false },
        });
        const edupay = { tenantId, source: EDUPAY_SOURCE };
        const manual = { source: MANUAL_SOURCE };
        const [enrollments, students, courses] = [
          await tx.courseEnrollment.updateMany({ where: edupay, data: manual }),
          await tx.student.updateMany({ where: edupay, data: manual }),
          await tx.course.updateMany({ where: edupay, data: manual }),
        ];
        return {
          plan,
          transferred: {
            students: students.count,
            courses: courses.count,
            enrollments: enrollments.count,
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    await this.audit.recordSystem?.({
      action: 'EDUPAY_AUTHORITY_TRANSFERRED',
      actorType: 'SYSTEM_INTEGRATION',
      correlationId,
      resourceId: tenantId,
      resourceType: 'Tenant',
      source: EDUPAY_SOURCE,
      summary: { ...result.transferred },
      tenantId,
    });
    return {
      ...result.plan,
      syncConfiguration:
        result.plan.syncConfiguration === 'ABSENT' ? 'ABSENT' : 'DISABLED',
      applied: true,
      transferred: result.transferred,
      correlationId,
    };
  }

  private async inspect(
    client: Client,
    tenantId: string,
    readLease = true,
  ): Promise<AuthorityTransferPlan> {
    const tenant = await client.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) {
      throw new AuthorityTransferConflictError(
        'TENANT_NOT_FOUND',
        'The canonical Académico tenant does not exist.',
      );
    }
    const edupay = { tenantId, source: EDUPAY_SOURCE };
    const transferred = {
      tenantId,
      source: MANUAL_SOURCE,
      externalReference: { not: null },
    };
    const [
      students,
      courses,
      enrollments,
      activeStudents,
      activeEnrollments,
      transferredStudents,
      transferredCourses,
      transferredEnrollments,
      teachers,
      withoutReference,
      configuration,
      lease,
    ] = await Promise.all([
      client.student.count({ where: edupay }),
      client.course.count({ where: edupay }),
      client.courseEnrollment.count({ where: edupay }),
      client.student.count({ where: { ...edupay, status: 'ACTIVE' } }),
      client.courseEnrollment.count({ where: { ...edupay, status: 'ACTIVE' } }),
      client.student.count({ where: transferred }),
      client.course.count({ where: transferred }),
      client.courseEnrollment.count({ where: transferred }),
      client.teacher.count({ where: edupay }),
      Promise.all([
        client.student.count({ where: { ...edupay, externalReference: null } }),
        client.course.count({ where: { ...edupay, externalReference: null } }),
        client.courseEnrollment.count({
          where: { ...edupay, externalReference: null },
        }),
      ]),
      client.syncConfiguration.findUnique({
        where: { tenantId_source: edupay },
        select: { enabled: true },
      }),
      readLease
        ? client.syncLease.findUnique({
            where: { tenantId_source: edupay },
            select: { lockedUntil: true },
          })
        : Promise.resolve(null),
    ]);
    const collisions = await this.referenceCollisions(client, tenantId);
    const blockers: string[] = [];
    if (teachers > 0) blockers.push('EDUPAY_TEACHERS_PRESENT');
    if (withoutReference.some((count) => count > 0)) {
      blockers.push('EDUPAY_RECORD_WITHOUT_REFERENCE');
    }
    if (collisions > 0) blockers.push('MANUAL_REFERENCE_COLLISION');
    const syncLeaseHeld = Boolean(lease && lease.lockedUntil > new Date());
    if (syncLeaseHeld) blockers.push('SYNC_RUN_IN_PROGRESS');
    return {
      tenantId,
      toTransfer: { students, courses, enrollments },
      activeStudents,
      activeEnrollments,
      alreadyTransferred: {
        students: transferredStudents,
        courses: transferredCourses,
        enrollments: transferredEnrollments,
      },
      syncConfiguration: !configuration
        ? 'ABSENT'
        : configuration.enabled
          ? 'ENABLED'
          : 'DISABLED',
      syncLeaseHeld,
      blockers,
    };
  }

  /** MANUAL rows that already use the reference of an EDUPAY row. */
  private async referenceCollisions(
    client: Client,
    tenantId: string,
  ): Promise<number> {
    const rows = await client.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
      SELECT (
        (SELECT count(*) FROM students e JOIN students m
           ON m.tenant_id = e.tenant_id
          AND m.external_reference = e.external_reference
          AND m.source = ${MANUAL_SOURCE}
         WHERE e.tenant_id = ${tenantId} AND e.source = ${EDUPAY_SOURCE})
      + (SELECT count(*) FROM courses e JOIN courses m
           ON m.tenant_id = e.tenant_id
          AND m.external_reference = e.external_reference
          AND m.source = ${MANUAL_SOURCE}
         WHERE e.tenant_id = ${tenantId} AND e.source = ${EDUPAY_SOURCE})
      + (SELECT count(*) FROM course_enrollments e JOIN course_enrollments m
           ON m.tenant_id = e.tenant_id
          AND m.external_reference = e.external_reference
          AND m.source = ${MANUAL_SOURCE}
         WHERE e.tenant_id = ${tenantId} AND e.source = ${EDUPAY_SOURCE})
      ) AS total
    `);
    return Number(rows[0]?.total ?? 0);
  }
}
