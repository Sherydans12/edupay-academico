import { Injectable } from '@nestjs/common';
import {
  ACADEMIC_FINANCIAL_PROJECTION_SCHEMA_VERSION,
  ACADEMIC_FINANCIAL_PROJECTION_TOMBSTONED_EVENT,
  ACADEMIC_FINANCIAL_PROJECTION_UPSERTED_EVENT,
  academicFinancialProjectionEnrollmentSchema,
  type AcademicFinancialProjectionEnrollment,
} from '@edupay/contracts';
import type { Prisma } from '../generated/prisma/client';

type TransactionClient = Prisma.TransactionClient;

/**
 * Relations every projected enrollment must load. Use it in the same Prisma
 * transaction that changes the enrollment, student, course or year.
 */
export const financialProjectionEnrollmentInclude = {
  student: {
    select: {
      firstName: true,
      lastName: true,
      nationalIdType: true,
      nationalId: true,
      source: true,
      externalReference: true,
    },
  },
  course: {
    select: {
      academicYearId: true,
      label: true,
      source: true,
      externalReference: true,
      academicYear: {
        select: { label: true, startDate: true, endDate: true, status: true },
      },
    },
  },
} as const satisfies Prisma.CourseEnrollmentInclude;

export type EnrollmentForProjection = {
  readonly id: string;
  readonly tenantId: string;
  readonly studentId: string;
  readonly courseId: string;
  readonly status: 'ACTIVE' | 'INACTIVE';
  readonly financialProjectionVersion: bigint;
  readonly financialProjectionEffectiveFrom: Date;
  readonly financialProjectionEffectiveTo: Date | null;
  readonly updatedAt: Date;
  readonly student: {
    readonly firstName: string;
    readonly lastName: string;
    readonly nationalIdType: string | null;
    readonly nationalId: string | null;
    readonly source: string;
    readonly externalReference: string | null;
  };
  readonly course: {
    readonly academicYearId: string;
    readonly label: string;
    readonly source: string;
    readonly externalReference: string | null;
    readonly academicYear: {
      readonly label: string;
      readonly startDate: Date;
      readonly endDate: Date;
      readonly status: 'DRAFT' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED';
    };
  };
};

@Injectable()
export class FinancialProjectionOutboxService {
  async enqueueEnrollments(
    tx: TransactionClient,
    enrollments: readonly EnrollmentForProjection[],
    correlationId?: string,
  ): Promise<void> {
    const batchSize = 500;
    for (let offset = 0; offset < enrollments.length; offset += batchSize) {
      const data = enrollments
        .slice(offset, offset + batchSize)
        .map((enrollment) => this.outboxRow(enrollment, correlationId));
      await tx.financialProjectionOutboxEvent.createMany({ data });
    }
  }

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
    await tx.financialProjectionOutboxEvent.create({
      data: this.outboxRow(enrollment, correlationId),
    });
  }

  /**
   * Re-projects every enrollment selected by `where` after a change to data
   * the projection carries (student names or RUN/IPE, course label, academic
   * year). Each enrollment gets a new version so Payments applies it as newer.
   */
  async reprojectEnrollments(
    tx: TransactionClient,
    where: Prisma.CourseEnrollmentWhereInput,
    correlationId?: string,
  ): Promise<number> {
    await tx.courseEnrollment.updateMany({
      where,
      data: { financialProjectionVersion: { increment: 1 } },
    });
    const enrollments = await tx.courseEnrollment.findMany({
      where,
      include: financialProjectionEnrollmentInclude,
      orderBy: { id: 'asc' },
    });
    await this.enqueueEnrollments(tx, enrollments, correlationId);
    return enrollments.length;
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
    const { student, course } = enrollment;
    return academicFinancialProjectionEnrollmentSchema.parse({
      canonicalTenantId: enrollment.tenantId,
      academicYearId: course.academicYearId,
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
      student: {
        firstName: student.firstName,
        lastName: student.lastName,
        nationalIdType: student.nationalIdType,
        nationalId: student.nationalId,
        // ADR-0026: transferred records keep their sync v1 reference.
        legacyIntegrationId: student.externalReference,
      },
      course: {
        label: course.label,
        legacyIntegrationId: course.externalReference,
      },
      academicYear: {
        label: course.academicYear.label,
        startDate: course.academicYear.startDate.toISOString().slice(0, 10),
        endDate: course.academicYear.endDate.toISOString().slice(0, 10),
        status: course.academicYear.status,
      },
    });
  }

  private outboxRow(
    enrollment: EnrollmentForProjection,
    correlationId?: string,
  ) {
    const payload = this.enrollmentPayload(enrollment);
    return {
      tenantId: enrollment.tenantId,
      eventType:
        payload.operation === 'TOMBSTONE'
          ? ACADEMIC_FINANCIAL_PROJECTION_TOMBSTONED_EVENT
          : ACADEMIC_FINANCIAL_PROJECTION_UPSERTED_EVENT,
      schemaVersion: ACADEMIC_FINANCIAL_PROJECTION_SCHEMA_VERSION,
      aggregateId: enrollment.id,
      entityVersion: enrollment.financialProjectionVersion,
      occurredAt: enrollment.updatedAt,
      correlationId: correlationId ?? null,
      payload: payload as unknown as Prisma.InputJsonValue,
    };
  }
}
