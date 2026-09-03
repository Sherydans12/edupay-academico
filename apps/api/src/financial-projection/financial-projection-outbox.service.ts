import { Injectable } from '@nestjs/common';
import {
  ACADEMIC_FINANCIAL_PROJECTION_SCHEMA_VERSION,
  academicFinancialProjectionEnrollmentSchema,
  type AcademicFinancialProjectionEnrollment,
} from '@edupay/contracts';
import type { Prisma } from '../generated/prisma/client';

type TransactionClient = Prisma.TransactionClient;

type EnrollmentForProjection = {
  readonly id: string;
  readonly tenantId: string;
  readonly studentId: string;
  readonly courseId: string;
  readonly status: 'ACTIVE' | 'INACTIVE';
  readonly financialProjectionVersion: bigint;
  readonly financialProjectionEffectiveFrom: Date;
  readonly financialProjectionEffectiveTo: Date | null;
  readonly updatedAt: Date;
  readonly course: { readonly academicYearId: string };
};

@Injectable()
export class FinancialProjectionOutboxService {
  /**
   * This method receives the enrollment returned by the same Prisma
   * transaction that made the academic change. It must never be invoked after
   * the mutation commits.
   */
  async enqueueEnrollment(
    tx: TransactionClient,
    enrollment: EnrollmentForProjection,
    correlationId?: string,
  ): Promise<void> {
    const payload = this.enrollmentPayload(enrollment);
    await tx.financialProjectionOutboxEvent.create({
      data: {
        tenantId: enrollment.tenantId,
        eventType:
          payload.operation === 'TOMBSTONE'
            ? 'academic.financial-projection.enrollment.tombstoned.v1'
            : 'academic.financial-projection.enrollment.upserted.v1',
        schemaVersion: ACADEMIC_FINANCIAL_PROJECTION_SCHEMA_VERSION,
        aggregateId: enrollment.id,
        entityVersion: enrollment.financialProjectionVersion,
        occurredAt: enrollment.updatedAt,
        correlationId: correlationId ?? null,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
    });
  }

  enrollmentPayload(
    enrollment: EnrollmentForProjection,
  ): AcademicFinancialProjectionEnrollment {
    const version = Number(enrollment.financialProjectionVersion);
    if (!Number.isSafeInteger(version) || version < 1) {
      throw new Error(
        'Financial projection version is outside the supported contract range.',
      );
    }
    const tombstone = enrollment.status === 'INACTIVE';
    return academicFinancialProjectionEnrollmentSchema.parse({
      canonicalTenantId: enrollment.tenantId,
      academicYearId: enrollment.course.academicYearId,
      academicStudentId: enrollment.studentId,
      academicCourseId: enrollment.courseId,
      academicEnrollmentId: enrollment.id,
      enrollmentStatus: enrollment.status,
      effectiveFrom: enrollment.financialProjectionEffectiveFrom.toISOString(),
      effectiveTo:
        enrollment.financialProjectionEffectiveTo?.toISOString() ?? null,
      version,
      updatedAt: enrollment.updatedAt.toISOString(),
      operation: tombstone ? 'TOMBSTONE' : 'UPSERT',
    });
  }
}
