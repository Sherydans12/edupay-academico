import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CommandIdempotencyService,
  computePayloadFingerprint,
} from './command-idempotency.service';
import type { PrismaService } from '../../persistence/prisma.service';

describe('CommandIdempotencyService', () => {
  let prisma: {
    $transaction: ReturnType<typeof vi.fn>;
    commandReceipt: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
  };
  let service: CommandIdempotencyService;

  beforeEach(() => {
    prisma = {
      $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb(prisma),
      ),
      commandReceipt: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      },
    };
    service = new CommandIdempotencyService(prisma as unknown as PrismaService);
  });

  describe('computePayloadFingerprint', () => {
    it('produces identical fingerprints regardless of key ordering', () => {
      const payloadA = { a: 1, b: 'two', nested: { x: true, y: [1, 2] } };
      const payloadB = { b: 'two', nested: { y: [1, 2], x: true }, a: 1 };

      const hashA = computePayloadFingerprint(payloadA);
      const hashB = computePayloadFingerprint(payloadB);

      expect(hashA).toBe(hashB);
    });

    it('produces different fingerprints for different payloads', () => {
      const payloadA = { a: 1 };
      const payloadB = { a: 2 };

      expect(computePayloadFingerprint(payloadA)).not.toBe(
        computePayloadFingerprint(payloadB),
      );
    });
  });

  describe('execute', () => {
    it('executes action directly when no idempotency key is provided', async () => {
      const action = vi.fn().mockResolvedValue({ data: { result: 'ok' } });

      const res = await service.execute({
        tenantId: 'tenant-1',
        actorIdentityUserId: 'user-1',
        commandName: 'MOVE_ITEM',
        idempotencyKey: undefined,
        payload: { some: 'data' },
        action,
      });

      expect(action).toHaveBeenCalledTimes(1);
      expect(res).toEqual({ data: { result: 'ok' } });
    });

    it('creates receipt when executing with a new idempotency key', async () => {
      const action = vi
        .fn()
        .mockResolvedValue({ status: 201, data: { id: 'created-1' } });

      const res = await service.execute({
        tenantId: 'tenant-1',
        actorIdentityUserId: 'user-1',
        commandName: 'CREATE_UNIT',
        idempotencyKey: 'idem-key-1',
        payload: { title: 'New Unit' },
        action,
      });

      expect(action).toHaveBeenCalledTimes(1);
      expect(prisma.commandReceipt.create).toHaveBeenCalledTimes(1);
      expect(prisma.commandReceipt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-1',
            actorIdentityUserId: 'user-1',
            commandName: 'CREATE_UNIT',
            idempotencyKey: 'idem-key-1',
            responseStatus: 201,
            responseBody: { id: 'created-1' },
          }),
        }),
      );
      expect(res).toEqual({ status: 201, data: { id: 'created-1' } });
    });

    it('returns cached response when same idempotency key and matching payload are used', async () => {
      const payload = { title: 'Existing Unit' };
      const fingerprint = computePayloadFingerprint(payload);

      prisma.commandReceipt.findUnique.mockResolvedValue({
        payloadFingerprint: fingerprint,
        responseStatus: 200,
        responseBody: { id: 'existing-1', title: 'Existing Unit' },
      });

      const action = vi.fn();

      const res = await service.execute({
        tenantId: 'tenant-1',
        actorIdentityUserId: 'user-1',
        commandName: 'UPDATE_UNIT',
        idempotencyKey: 'idem-key-1',
        payload,
        action,
      });

      expect(action).not.toHaveBeenCalled();
      expect(res).toEqual({
        status: 200,
        data: { id: 'existing-1', title: 'Existing Unit' },
      });
    });

    it('throws 409 IDEMPOTENCY_KEY_REUSED when same key is used with a different payload', async () => {
      const payloadA = { title: 'First Payload' };
      const payloadB = { title: 'Second Payload' };
      const fingerprintA = computePayloadFingerprint(payloadA);

      prisma.commandReceipt.findUnique.mockResolvedValue({
        payloadFingerprint: fingerprintA,
        responseStatus: 200,
        responseBody: { id: 'unit-1' },
      });

      const action = vi.fn();

      await expect(
        service.execute({
          tenantId: 'tenant-1',
          actorIdentityUserId: 'user-1',
          commandName: 'UPDATE_UNIT',
          idempotencyKey: 'idem-key-1',
          payload: payloadB,
          action,
        }),
      ).rejects.toThrow(ConflictException);

      expect(action).not.toHaveBeenCalled();
    });

    it('handles concurrent P2002 collision gracefully by recovering committed receipt', async () => {
      const payload = { title: 'Concurrent Unit' };
      const fingerprint = computePayloadFingerprint(payload);

      // findUnique initially returns null before transaction
      prisma.commandReceipt.findUnique
        .mockResolvedValueOnce(null) // outer check
        .mockResolvedValueOnce(null) // inside tx check
        .mockResolvedValueOnce({
          payloadFingerprint: fingerprint,
          responseStatus: 201,
          responseBody: { id: 'recovered-1', title: 'Concurrent Unit' },
        }); // catch P2002 read

      // create throws P2002 error as if another transaction committed first
      const p2002 = new Error('Unique constraint failed on the fields');
      (p2002 as unknown as { code: string }).code = 'P2002';
      prisma.commandReceipt.create.mockRejectedValueOnce(p2002);

      const action = vi.fn().mockResolvedValue({
        status: 201,
        data: { id: 'attempt-1', title: 'Concurrent Unit' },
      });

      const res = await service.execute({
        tenantId: 'tenant-1',
        actorIdentityUserId: 'user-1',
        commandName: 'CREATE_UNIT',
        idempotencyKey: 'concurrent-key',
        payload,
        action,
      });

      expect(res).toEqual({
        status: 201,
        data: { id: 'recovered-1', title: 'Concurrent Unit' },
      });
    });
  });
});
