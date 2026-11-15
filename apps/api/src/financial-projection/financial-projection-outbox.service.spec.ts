import { academicFinancialProjectionEventSchema } from '@edupay/contracts';
import { describe, expect, it, vi } from 'vitest';

import { FinancialProjectionOutboxService } from './financial-projection-outbox.service';

// Synthetic records only; the RUN is a sequential test value.
const tenant = '11111111-1111-4111-8111-111111111111';
const enrollment = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  tenantId: tenant,
  studentId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  courseId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  status: 'ACTIVE' as const,
  financialProjectionVersion: 7n,
  financialProjectionEffectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
  financialProjectionEffectiveTo: null,
  updatedAt: new Date('2026-03-02T00:00:00.000Z'),
  student: {
    firstName: 'Alumna',
    lastName: 'Sintética',
    nationalIdType: 'RUN',
    nationalId: '111111111',
    source: 'MANUAL',
    externalReference: null,
  },
  course: {
    academicYearId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    label: '1° Básico A',
    source: 'MANUAL',
    externalReference: null,
    academicYear: {
      label: '2027',
      startDate: new Date('2027-03-01T00:00:00.000Z'),
      endDate: new Date('2027-12-15T00:00:00.000Z'),
      status: 'DRAFT' as const,
    },
  },
};

describe('FinancialProjectionOutboxService', () => {
  it('creates a v2 upsert event with the data Payments needs, in the caller transaction', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const service = new FinancialProjectionOutboxService();

    await service.enqueueEnrollment(
      { financialProjectionOutboxEvent: { create } } as never,
      enrollment,
      'request-7',
    );

    const data = create.mock.calls[0]![0].data;
    expect(data).toMatchObject({
      tenantId: tenant,
      aggregateId: enrollment.id,
      entityVersion: 7n,
      eventType: 'academic.financial-projection.enrollment.upserted.v2',
      schemaVersion: '2',
      correlationId: 'request-7',
    });
    expect(data.payload).toMatchObject({
      academicEnrollmentId: enrollment.id,
      version: 7,
      operation: 'UPSERT',
      student: {
        firstName: 'Alumna',
        lastName: 'Sintética',
        nationalIdType: 'RUN',
        nationalId: '111111111',
        legacyIntegrationId: null,
      },
      course: { label: '1° Básico A', legacyIntegrationId: null },
      academicYear: {
        label: '2027',
        startDate: '2027-03-01',
        endDate: '2027-12-15',
        status: 'DRAFT',
      },
    });
    expect(
      academicFinancialProjectionEventSchema.safeParse({
        eventId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        eventType: data.eventType,
        schemaVersion: data.schemaVersion,
        canonicalTenantId: tenant,
        aggregateType: 'ACADEMIC_ENROLLMENT',
        aggregateId: data.aggregateId,
        entityVersion: 7,
        occurredAt: '2026-03-02T00:00:00.000Z',
        correlationId: 'request-7',
        payload: data.payload,
      }).success,
    ).toBe(true);
    expect(JSON.stringify(data.payload)).not.toMatch(
      /email|identity|guardian|password|token/i,
    );
  });

  it('links legacy EduPay records only through their integration reference', () => {
    const service = new FinancialProjectionOutboxService();
    const payload = service.enrollmentPayload({
      ...enrollment,
      student: {
        ...enrollment.student,
        nationalIdType: null,
        nationalId: null,
        source: 'EDUPAY',
        externalReference: 'f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0',
      },
      course: {
        ...enrollment.course,
        source: 'EDUPAY',
        externalReference: '0e0e0e0e-0e0e-40e0-80e0-0e0e0e0e0e0e',
      },
    });
    expect(payload.student).toMatchObject({
      nationalIdType: null,
      nationalId: null,
      legacyIntegrationId: 'f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0',
    });
    expect(payload.course.legacyIntegrationId).toBe(
      '0e0e0e0e-0e0e-40e0-80e0-0e0e0e0e0e0e',
    );
  });

  it('never exposes the external reference of a manual record', () => {
    const service = new FinancialProjectionOutboxService();
    const payload = service.enrollmentPayload({
      ...enrollment,
      student: { ...enrollment.student, externalReference: 'manual-ref' },
    });
    expect(payload.student.legacyIntegrationId).toBeNull();
  });

  it('emits a tombstone at a newer durable version', () => {
    const service = new FinancialProjectionOutboxService();
    expect(
      service.enrollmentPayload({
        ...enrollment,
        status: 'INACTIVE',
        financialProjectionVersion: 8n,
        financialProjectionEffectiveTo: new Date('2026-04-01T00:00:00.000Z'),
      }),
    ).toMatchObject({
      enrollmentStatus: 'INACTIVE',
      version: 8,
      operation: 'TOMBSTONE',
      effectiveTo: '2026-04-01T00:00:00.000Z',
    });
  });

  it('rejects an identifier type without its value', () => {
    const service = new FinancialProjectionOutboxService();
    expect(() =>
      service.enrollmentPayload({
        ...enrollment,
        student: { ...enrollment.student, nationalId: null },
      }),
    ).toThrow();
  });

  it('re-projects the selected enrollments with a newer version', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findMany = vi
      .fn()
      .mockResolvedValue([{ ...enrollment, financialProjectionVersion: 8n }]);
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const service = new FinancialProjectionOutboxService();
    const where = {
      tenantId: tenant,
      studentId: enrollment.studentId,
      status: 'ACTIVE' as const,
    };

    const count = await service.reprojectEnrollments(
      {
        courseEnrollment: { updateMany, findMany },
        financialProjectionOutboxEvent: { createMany },
      } as never,
      where,
      'request-8',
    );

    expect(count).toBe(1);
    expect(updateMany).toHaveBeenCalledWith({
      where,
      data: { financialProjectionVersion: { increment: 1 } },
    });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    const rows = createMany.mock.calls[0]![0].data;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      entityVersion: 8n,
      correlationId: 'request-8',
    });
  });
});
