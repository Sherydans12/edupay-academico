import { describe, expect, it, vi } from 'vitest';

import { FinancialProjectionOutboxService } from './financial-projection-outbox.service';

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
  course: { academicYearId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' },
};

describe('FinancialProjectionOutboxService', () => {
  it('creates a minimal v1 upsert event in the caller transaction', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const service = new FinancialProjectionOutboxService();

    await service.enqueueEnrollment(
      { financialProjectionOutboxEvent: { create } } as never,
      enrollment,
      'request-7',
    );

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: tenant,
        aggregateId: enrollment.id,
        entityVersion: 7n,
        eventType: 'academic.financial-projection.enrollment.upserted.v1',
        correlationId: 'request-7',
      }),
    });
    const payload = create.mock.calls[0]![0].data.payload;
    expect(payload).toMatchObject({
      academicEnrollmentId: enrollment.id,
      version: 7,
      operation: 'UPSERT',
    });
    expect(JSON.stringify(payload)).not.toMatch(
      /firstName|lastName|email|identity/i,
    );
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
});
