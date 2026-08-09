import { describe, expect, it, vi } from 'vitest';

import { NotificationWorkerService } from './notification-worker.service';
import { AcademicEmailDeliveryError, type AcademicEmailAdapter } from './notification.types';

function workerWith(input: {
  attemptCount: number;
  adapter: { send: ReturnType<typeof vi.fn> };
  claimed?: Array<{ tenantId: string; id: string }>;
}) {
  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue(input.claimed ?? [{ tenantId: 'tenant-a', id: '00000000-0000-4000-8000-000000000001' }]),
    notificationDelivery: {
      findUnique: vi.fn().mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        tenantId: 'tenant-a',
        status: 'PROCESSING',
        channel: 'EMAIL',
        recipientEmail: 'student@example.test',
        attemptCount: input.attemptCount,
        event: {
          eventType: 'ASSIGNMENT_PUBLISHED',
          payload: {
            courseSubjectId: '00000000-0000-4000-8000-000000000002',
            learningItemId: '00000000-0000-4000-8000-000000000003',
            learningItemTitle: 'Actividad',
            subjectName: 'Lenguaje',
            targetPath: '/estudiante/asignaturas/a/items/b',
          },
        },
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const config = {
    get: vi.fn((key: string, fallback: unknown) => {
      const values: Record<string, unknown> = {
        NOTIFICATION_MAX_DELIVERY_ATTEMPTS: 5,
        NOTIFICATION_RETRY_SCHEDULE_SECONDS: [60, 300, 900, 3600, 21600],
        NOTIFICATION_WORKER_BATCH_SIZE: 50,
        NOTIFICATION_PROCESSING_LEASE_SECONDS: 900,
        ACADEMIC_PUBLIC_BASE_URL: 'https://academico.example.test',
      };
      return values[key] ?? fallback;
    }),
  };
  const notifications = { materializeDueScheduledLearningEvents: vi.fn().mockResolvedValue(0) };
  const service = new NotificationWorkerService(
    prisma as never,
    config as never,
    notifications as never,
    input.adapter as unknown as AcademicEmailAdapter,
  );
  return { service, prisma };
}

describe('NotificationWorkerService', () => {
  it('moves transient provider failures to bounded retry', async () => {
    const adapter = {
      send: vi.fn().mockRejectedValue(
        new AcademicEmailDeliveryError('network', true, 'provider unavailable'),
      ),
    };
    const { service, prisma } = workerWith({ attemptCount: 1, adapter });

    await service.runOnce();

    expect(prisma.notificationDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'RETRY',
          lastErrorCategory: 'network',
        }),
      }),
    );
  });

  it('marks the fifth failed attempt terminal instead of retrying forever', async () => {
    const adapter = {
      send: vi.fn().mockRejectedValue(
        new AcademicEmailDeliveryError('network', true, 'provider unavailable'),
      ),
    };
    const { service, prisma } = workerWith({ attemptCount: 5, adapter });

    await service.runOnce();

    expect(prisma.notificationDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });

  it('can deliver a retried row after a worker restart', async () => {
    const adapter = { send: vi.fn().mockResolvedValue({ providerMessageId: 'resend-1' }) };
    const { service, prisma } = workerWith({ attemptCount: 2, adapter });

    await service.runOnce();

    expect(adapter.send).toHaveBeenCalledTimes(1);
    expect(prisma.notificationDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DELIVERED', providerMessageId: 'resend-1' }),
      }),
    );
  });
});
