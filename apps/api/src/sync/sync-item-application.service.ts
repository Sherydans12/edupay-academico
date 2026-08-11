import { Inject, Injectable } from '@nestjs/common';

import {
  ACADEMIC_AUDIT_PORT,
  type AcademicAuditPort,
} from '../academic/academic-audit.port';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../persistence/prisma.service';
import type {
  EduPayCourseItem,
  EduPayStudentItem,
} from './edupay-source.contract';
import { EDUPAY_SOURCE, type SupportedSyncSource } from './sync.constants';

export type AppliedItemResult = {
  readonly change: 'created' | 'updated' | 'unchanged';
  readonly deactivated: number;
  readonly error?: {
    readonly code: string;
    readonly retryable: boolean;
  };
  readonly targetId: string | null;
};

type ItemContext = {
  readonly academicYearId: string;
  readonly correlationId: string;
  readonly source: SupportedSyncSource;
  readonly tenantId: string;
};

@Injectable()
export class SyncItemApplicationService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(ACADEMIC_AUDIT_PORT)
    private readonly audit: AcademicAuditPort,
  ) {}

  async applyCourse(
    context: ItemContext,
    item: EduPayCourseItem,
  ): Promise<AppliedItemResult> {
    const now = new Date();
    const sourceUpdatedAt = new Date(item.updatedAt);
    const sourceStatus = item.deletedAt ? 'DELETED' : 'ACTIVE';
    const status = item.deletedAt ? 'ARCHIVED' : 'ACTIVE';
    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.course.findUnique({
        where: {
          tenantId_source_externalReference: {
            tenantId: context.tenantId,
            source: context.source,
            externalReference: item.integrationId,
          },
        },
      });

      if (current && current.academicYearId !== context.academicYearId) {
        return {
          change: 'unchanged' as const,
          deactivated: 0,
          error: {
            code: 'SOURCE_COURSE_ACADEMIC_YEAR_CONFLICT',
            retryable: false,
          },
          targetId: current.id,
        };
      }

      if (
        current?.sourceUpdatedAt &&
        current.sourceUpdatedAt.getTime() > sourceUpdatedAt.getTime()
      ) {
        return {
          change: 'unchanged' as const,
          deactivated: 0,
          targetId: current.id,
        };
      }

      let targetId: string;
      let change: AppliedItemResult['change'];
      let courseDeactivated = 0;
      if (!current) {
        const created = await tx.course.create({
          data: {
            tenantId: context.tenantId,
            academicYearId: context.academicYearId,
            source: context.source,
            externalReference: item.integrationId,
            label: item.name,
            status,
            sourceUpdatedAt,
            lastSyncedAt: now,
            sourceStatus,
          },
        });
        targetId = created.id;
        change = 'created';
        courseDeactivated = status === 'ARCHIVED' ? 1 : 0;
      } else {
        targetId = current.id;
        const changed =
          current.label !== item.name ||
          current.status !== status ||
          current.sourceStatus !== sourceStatus ||
          current.sourceUpdatedAt?.getTime() !== sourceUpdatedAt.getTime();
        await tx.course.update({
          where: {
            tenantId_id: { tenantId: context.tenantId, id: current.id },
          },
          data: {
            label: item.name,
            status,
            sourceUpdatedAt,
            lastSyncedAt: now,
            sourceStatus,
          },
        });
        change = changed ? 'updated' : 'unchanged';
        courseDeactivated =
          current.status !== 'ARCHIVED' && status === 'ARCHIVED' ? 1 : 0;
      }

      const enrollments =
        status === 'ARCHIVED'
          ? await tx.courseEnrollment.updateMany({
              where: {
                tenantId: context.tenantId,
                courseId: targetId,
                source: context.source,
                status: 'ACTIVE',
              },
              data: { status: 'INACTIVE', lastSyncedAt: now },
            })
          : { count: 0 };

      return {
        change,
        deactivated: courseDeactivated + enrollments.count,
        targetId,
      };
    });

    if (result.change !== 'unchanged' || result.deactivated > 0) {
      await this.audit.recordSystem?.({
        action: 'EDUPAY_COURSE_SYNCHRONIZED',
        actorType: 'SYSTEM_INTEGRATION',
        correlationId: context.correlationId,
        resourceId: result.targetId,
        resourceType: 'Course',
        source: EDUPAY_SOURCE,
        summary: {
          change: result.change,
          deactivated: result.deactivated,
        },
        tenantId: context.tenantId,
      });
    }
    return result;
  }

  async applyStudent(
    context: ItemContext,
    item: EduPayStudentItem,
  ): Promise<AppliedItemResult> {
    const now = new Date();
    const sourceUpdatedAt = new Date(item.updatedAt);
    const mappedStatus =
      item.deletedAt || item.status !== 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const sourceStatus = item.deletedAt ? 'DELETED' : item.status;

    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.student.findUnique({
        where: {
          tenantId_source_externalReference: {
            tenantId: context.tenantId,
            source: context.source,
            externalReference: item.integrationId,
          },
        },
      });
      if (
        current?.sourceUpdatedAt &&
        current.sourceUpdatedAt.getTime() > sourceUpdatedAt.getTime()
      ) {
        return {
          change: 'unchanged' as const,
          deactivated: 0,
          targetId: current.id,
        };
      }

      const course =
        mappedStatus === 'ACTIVE'
          ? await tx.course.findUnique({
              where: {
                tenantId_source_externalReference: {
                  tenantId: context.tenantId,
                  source: context.source,
                  externalReference: item.courseIntegrationId,
                },
              },
            })
          : null;
      if (mappedStatus === 'ACTIVE' && !course) {
        return this.itemConflict(
          'unchanged',
          current?.id ?? null,
          'SOURCE_COURSE_MAPPING_MISSING',
        );
      }
      if (
        mappedStatus === 'ACTIVE' &&
        (course!.academicYearId !== context.academicYearId ||
          course!.status !== 'ACTIVE')
      ) {
        return this.itemConflict(
          'unchanged',
          current?.id ?? null,
          'SOURCE_COURSE_NOT_ACTIVE',
        );
      }

      const relationshipReference = this.enrollmentReference(
        item.integrationId,
        item.courseIntegrationId,
      );
      const [manualEnrollment, historical] =
        mappedStatus === 'ACTIVE' && current
          ? await Promise.all([
              tx.courseEnrollment.findFirst({
                where: {
                  tenantId: context.tenantId,
                  studentId: current.id,
                  source: 'MANUAL',
                  status: 'ACTIVE',
                },
                select: { id: true },
              }),
              tx.courseEnrollment.findUnique({
                where: {
                  tenantId_source_externalReference: {
                    tenantId: context.tenantId,
                    source: context.source,
                    externalReference: relationshipReference,
                  },
                },
              }),
            ])
          : [null, null];
      if (manualEnrollment) {
        return this.itemConflict(
          'unchanged',
          current!.id,
          'MANUAL_ENROLLMENT_CONFLICT',
        );
      }
      if (
        historical &&
        (historical.studentId !== current?.id ||
          historical.courseId !== course!.id)
      ) {
        return this.itemConflict(
          'unchanged',
          current?.id ?? null,
          'SOURCE_ENROLLMENT_IDENTITY_CONFLICT',
        );
      }

      const changed = current
        ? current.firstName !== item.firstName ||
          current.lastName !== item.lastName ||
          current.status !== mappedStatus ||
          current.sourceStatus !== sourceStatus ||
          current.sourceUpdatedAt?.getTime() !== sourceUpdatedAt.getTime()
        : true;
      const student = current
        ? await tx.student.update({
            where: {
              tenantId_id: { tenantId: context.tenantId, id: current.id },
            },
            data: {
              firstName: item.firstName,
              lastName: item.lastName,
              status: mappedStatus,
              sourceUpdatedAt,
              lastSyncedAt: now,
              sourceStatus,
            },
          })
        : await tx.student.create({
            data: {
              tenantId: context.tenantId,
              source: context.source,
              externalReference: item.integrationId,
              firstName: item.firstName,
              lastName: item.lastName,
              email: null,
              status: mappedStatus,
              sourceUpdatedAt,
              lastSyncedAt: now,
              sourceStatus,
            },
          });
      const change: AppliedItemResult['change'] = current
        ? changed
          ? 'updated'
          : 'unchanged'
        : 'created';

      if (mappedStatus !== 'ACTIVE') {
        const deactivated = await tx.courseEnrollment.updateMany({
          where: {
            tenantId: context.tenantId,
            studentId: student.id,
            source: context.source,
            status: 'ACTIVE',
          },
          data: { status: 'INACTIVE', lastSyncedAt: now },
        });
        return {
          change,
          deactivated:
            deactivated.count +
            (current?.status === 'ACTIVE' && mappedStatus === 'INACTIVE'
              ? 1
              : 0),
          targetId: student.id,
        };
      }

      const deactivated = await tx.courseEnrollment.updateMany({
        where: {
          tenantId: context.tenantId,
          studentId: student.id,
          source: context.source,
          status: 'ACTIVE',
          NOT: { externalReference: relationshipReference },
        },
        data: { status: 'INACTIVE', lastSyncedAt: now },
      });
      if (historical) {
        await tx.courseEnrollment.update({
          where: {
            tenantId_id: {
              tenantId: context.tenantId,
              id: historical.id,
            },
          },
          data: { status: 'ACTIVE', lastSyncedAt: now },
        });
      } else {
        await tx.courseEnrollment.create({
          data: {
            tenantId: context.tenantId,
            studentId: student.id,
            courseId: course!.id,
            source: context.source,
            externalReference: relationshipReference,
            status: 'ACTIVE',
            lastSyncedAt: now,
          },
        });
      }

      return {
        change,
        deactivated: deactivated.count,
        targetId: student.id,
      };
    });

    if (
      result.targetId &&
      (result.change !== 'unchanged' || result.deactivated > 0)
    ) {
      await this.audit.recordSystem?.({
        action: 'EDUPAY_STUDENT_SYNCHRONIZED',
        actorType: 'SYSTEM_INTEGRATION',
        correlationId: context.correlationId,
        resourceId: result.targetId,
        resourceType: 'Student',
        source: EDUPAY_SOURCE,
        summary: {
          change: result.change,
          deactivated: result.deactivated,
          enrollmentApplied: result.error === undefined,
        },
        tenantId: context.tenantId,
      });
    }
    return result;
  }

  private enrollmentReference(
    studentIntegrationId: string,
    courseIntegrationId: string,
  ): string {
    return `student:${studentIntegrationId}|course:${courseIntegrationId}`;
  }

  private itemConflict(
    change: AppliedItemResult['change'],
    targetId: string | null,
    code: string,
  ): AppliedItemResult {
    return {
      change,
      deactivated: 0,
      error: { code, retryable: false },
      targetId,
    };
  }
}

export function safeSyncItemErrorCode(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    const prismaCode = error.code;
    if (prismaCode === 'P2002') return 'SOURCE_EXTERNAL_IDENTITY_CONFLICT';
    if (prismaCode === 'P2003') return 'SOURCE_RELATIONSHIP_SCOPE_CONFLICT';
  }
  return 'SYNC_ITEM_APPLICATION_FAILED';
}

export type SyncTransaction = Prisma.TransactionClient;
