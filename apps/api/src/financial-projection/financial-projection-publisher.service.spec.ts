import { afterEach, describe, expect, it, vi } from 'vitest';

import { FinancialProjectionPublisherService } from './financial-projection-publisher.service';

const event = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  eventType: 'academic.financial-projection.enrollment.upserted.v1',
  tenantId: '11111111-1111-4111-8111-111111111111',
  aggregateId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  entityVersion: 7n,
  occurredAt: new Date('2026-09-03T12:00:00.000Z'),
  correlationId: 'publisher-test',
  attemptCount: 1,
  payload: {
    canonicalTenantId: '11111111-1111-4111-8111-111111111111',
    academicYearId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    academicStudentId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    academicCourseId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    academicEnrollmentId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    enrollmentStatus: 'ACTIVE',
    effectiveFrom: '2026-03-01T00:00:00.000Z',
    effectiveTo: null,
    version: 7,
    updatedAt: '2026-09-03T12:00:00.000Z',
    operation: 'UPSERT',
  },
};

describe('FinancialProjectionPublisherService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('marks an event PUBLISHED only after the BL endpoint acknowledges it', async () => {
    const updateMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    const prisma = {
      financialProjectionOutboxEvent: {
        updateMany,
        findMany: vi.fn().mockResolvedValue([{ id: event.id }]),
        findUniqueOrThrow: vi.fn().mockResolvedValue(event),
      },
    };
    const config = {
      publisherEnabled: () => true,
      publisherConfiguration: () => ({
        baseUrl: 'https://bl.invalid',
        token: 'test-token-not-a-secret',
        keyId: 'academic-test',
        timeoutMs: 1_000,
        maxAttempts: 3,
        retryScheduleSeconds: [1],
      }),
    };
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    vi.stubGlobal('fetch', fetch);

    const result = await new FinancialProjectionPublisherService(
      prisma as never,
      config as never,
    ).publishPending();

    expect(result).toEqual({ attempted: 1, published: 1 });
    expect(fetch).toHaveBeenCalledOnce();
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: event.id, status: 'PUBLISHING' },
        data: expect.objectContaining({ status: 'PUBLISHED' }),
      }),
    );
  });

  it('keeps a non-acknowledged event retryable instead of publishing it', async () => {
    const updateMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    const prisma = {
      financialProjectionOutboxEvent: {
        updateMany,
        findMany: vi.fn().mockResolvedValue([{ id: event.id }]),
        findUniqueOrThrow: vi.fn().mockResolvedValue(event),
      },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const result = await new FinancialProjectionPublisherService(
      prisma as never,
      {
        publisherEnabled: () => true,
        publisherConfiguration: () => ({
          baseUrl: 'https://bl.invalid',
          token: 'test-token-not-a-secret',
          keyId: 'academic-test',
          timeoutMs: 1_000,
          maxAttempts: 3,
          retryScheduleSeconds: [1],
        }),
      } as never,
    ).publishPending();

    expect(result).toEqual({ attempted: 1, published: 0 });
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: event.id, status: 'PUBLISHING' },
        data: expect.objectContaining({ status: 'RETRY' }),
      }),
    );
  });
});
