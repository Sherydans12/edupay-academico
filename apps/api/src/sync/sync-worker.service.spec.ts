import { describe, expect, it, vi } from 'vitest';

import { SyncWorkerService } from './sync-worker.service';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('SyncWorkerService', () => {
  it('prioritizes a due full run and schedules from UTC', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const execute = vi.fn().mockResolvedValue({ retryable: false });
    const now = new Date();
    const service = new SyncWorkerService(
      {
        syncConfiguration: {
          findMany: vi.fn().mockResolvedValue([
            {
              tenantId: TENANT_ID,
              nextFullAt: new Date(now.getTime() - 60_000),
              nextIncrementalAt: new Date(now.getTime() - 60_000),
            },
          ]),
          update,
        },
      } as never,
      { execute } as never,
      {
        get: (key: string, fallback: unknown) =>
          key === 'EDUPAY_SYNC_MAX_RUN_ATTEMPTS'
            ? 1
            : key === 'EDUPAY_SYNC_FULL_HOUR_UTC'
              ? 2
              : fallback,
      } as never,
    );

    await expect(service.runOnce()).resolves.toEqual({ due: 1, attempted: 1 });
    expect(execute).toHaveBeenCalledWith(TENANT_ID, 'FULL', 'SCHEDULED');
    const nextFullAt = update.mock.calls[0]?.[0].data.nextFullAt as Date;
    expect(nextFullAt.getUTCHours()).toBe(2);
    expect(nextFullAt.getUTCMinutes()).toBe(0);
  });
});
