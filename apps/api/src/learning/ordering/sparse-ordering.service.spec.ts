import { describe, expect, it, vi } from 'vitest';
import {
  SPARSE_ORDER_STEP,
  SparseOrderingService,
} from './sparse-ordering.service';
import type { Prisma } from '../../generated/prisma/client';

describe('SparseOrderingService', () => {
  const service = new SparseOrderingService();

  describe('computeNextEndPosition', () => {
    it('returns SPARSE_ORDER_STEP when highest is null or undefined', () => {
      expect(service.computeNextEndPosition(null)).toBe(SPARSE_ORDER_STEP);
      expect(service.computeNextEndPosition(undefined)).toBe(SPARSE_ORDER_STEP);
      expect(service.computeNextEndPosition(0)).toBe(SPARSE_ORDER_STEP);
    });

    it('returns highest + SPARSE_ORDER_STEP when highest is given', () => {
      expect(service.computeNextEndPosition(1024)).toBe(2048);
      expect(service.computeNextEndPosition(2048)).toBe(3072);
      expect(service.computeNextEndPosition(500)).toBe(1524);
    });
  });

  describe('computeMidpoint', () => {
    it('handles empty list (null, null)', () => {
      const result = service.computeMidpoint(null, null);
      expect(result).toEqual({
        position: SPARSE_ORDER_STEP,
        needsRebalance: false,
      });
    });

    it('handles insertion before the first item (null, next)', () => {
      // next = 1024 -> midpoint 512
      const result1 = service.computeMidpoint(null, 1024);
      expect(result1).toEqual({ position: 512, needsRebalance: false });

      // next = 2 -> midpoint 1
      const result2 = service.computeMidpoint(null, 2);
      expect(result2).toEqual({ position: 1, needsRebalance: false });

      // next = 1 -> cannot insert before 1 without rebalance
      const result3 = service.computeMidpoint(null, 1);
      expect(result3).toEqual({ position: 1, needsRebalance: true });
    });

    it('handles insertion after the last item (prev, null)', () => {
      const result = service.computeMidpoint(2048, null);
      expect(result).toEqual({
        position: 2048 + SPARSE_ORDER_STEP,
        needsRebalance: false,
      });
    });

    it('handles normal midpoint between two items', () => {
      const result = service.computeMidpoint(1024, 2048);
      expect(result).toEqual({ position: 1536, needsRebalance: false });

      const result2 = service.computeMidpoint(100, 200);
      expect(result2).toEqual({ position: 150, needsRebalance: false });
    });

    it('flags needsRebalance when gap <= MIN_GAP_FOR_INSERT', () => {
      const resultAdjacent = service.computeMidpoint(100, 101);
      expect(resultAdjacent.needsRebalance).toBe(true);

      const resultCollision = service.computeMidpoint(100, 100);
      expect(resultCollision.needsRebalance).toBe(true);

      const resultInverted = service.computeMidpoint(105, 100);
      expect(resultInverted.needsRebalance).toBe(true);
    });
  });

  describe('rebalanceUnitItems', () => {
    it('renumbers items in unit with clean 1024 sparse steps', async () => {
      const mockItems = [
        { id: 'item-1', sortOrder: 5 },
        { id: 'item-2', sortOrder: 6 },
        { id: 'item-3', sortOrder: 7 },
      ];

      const updateMock = vi.fn().mockResolvedValue({});
      const tx = {
        learningItem: {
          findMany: vi.fn().mockResolvedValue(mockItems),
          update: updateMock,
        },
      } as unknown as Prisma.TransactionClient;

      const positions = await service.rebalanceUnitItems(
        tx,
        'tenant-1',
        'unit-1',
      );

      expect(positions.get('item-1')).toBe(1024);
      expect(positions.get('item-2')).toBe(2048);
      expect(positions.get('item-3')).toBe(3072);

      expect(updateMock).toHaveBeenCalledTimes(3);
      expect(updateMock).toHaveBeenNthCalledWith(1, {
        where: { tenantId_id: { tenantId: 'tenant-1', id: 'item-1' } },
        data: { sortOrder: 1024 },
      });
    });
  });

  describe('determineItemPlacementPosition', () => {
    it('appends at end when no placement is provided', async () => {
      const tx = {
        learningItem: {
          findFirst: vi.fn().mockResolvedValue({ sortOrder: 2048 }),
        },
      } as unknown as Prisma.TransactionClient;

      const position = await service.determineItemPlacementPosition({
        tx,
        tenantId: 'tenant-1',
        targetLearningUnitId: 'unit-1',
      });

      expect(position).toBe(3072);
    });

    it('inserts BEFORE a relative item', async () => {
      const items = [
        { id: 'item-1', sortOrder: 1024 },
        { id: 'item-2', sortOrder: 2048 },
        { id: 'item-3', sortOrder: 3072 },
      ];
      const tx = {
        learningItem: {
          findMany: vi.fn().mockResolvedValue(items),
        },
      } as unknown as Prisma.TransactionClient;

      const position = await service.determineItemPlacementPosition({
        tx,
        tenantId: 'tenant-1',
        targetLearningUnitId: 'unit-1',
        placement: { relativeToId: 'item-2', position: 'BEFORE' },
      });

      // Midpoint between item-1 (1024) and item-2 (2048)
      expect(position).toBe(1536);
    });

    it('inserts AFTER a relative item', async () => {
      const items = [
        { id: 'item-1', sortOrder: 1024 },
        { id: 'item-2', sortOrder: 2048 },
        { id: 'item-3', sortOrder: 3072 },
      ];
      const tx = {
        learningItem: {
          findMany: vi.fn().mockResolvedValue(items),
        },
      } as unknown as Prisma.TransactionClient;

      const position = await service.determineItemPlacementPosition({
        tx,
        tenantId: 'tenant-1',
        targetLearningUnitId: 'unit-1',
        placement: { relativeToId: 'item-2', position: 'AFTER' },
      });

      // Midpoint between item-2 (2048) and item-3 (3072)
      expect(position).toBe(2560);
    });
  });
});
