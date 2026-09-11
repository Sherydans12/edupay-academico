import { Injectable } from '@nestjs/common';
import type { ItemPlacement } from '@edupay/contracts';
import type { Prisma } from '../../generated/prisma/client';

export const SPARSE_ORDER_STEP = 1024;
export const MIN_GAP_FOR_INSERT = 1;

@Injectable()
export class SparseOrderingService {
  computeNextEndPosition(highestSortOrder: number | null | undefined): number {
    return (highestSortOrder ?? 0) + SPARSE_ORDER_STEP;
  }

  computeMidpoint(
    prevSortOrder: number | null,
    nextSortOrder: number | null,
  ): { position: number; needsRebalance: boolean } {
    if (prevSortOrder === null && nextSortOrder === null) {
      return { position: SPARSE_ORDER_STEP, needsRebalance: false };
    }

    if (prevSortOrder === null && nextSortOrder !== null) {
      if (nextSortOrder > 1) {
        const position = Math.floor(nextSortOrder / 2);
        return { position, needsRebalance: position < 1 };
      }
      return { position: 1, needsRebalance: true };
    }

    if (prevSortOrder !== null && nextSortOrder === null) {
      return {
        position: prevSortOrder + SPARSE_ORDER_STEP,
        needsRebalance: false,
      };
    }

    if (prevSortOrder !== null && nextSortOrder !== null) {
      if (nextSortOrder <= prevSortOrder) {
        return { position: prevSortOrder + 1, needsRebalance: true };
      }
      const gap = nextSortOrder - prevSortOrder;
      if (gap <= MIN_GAP_FOR_INSERT) {
        return { position: prevSortOrder + 1, needsRebalance: true };
      }
      return {
        position: Math.floor((prevSortOrder + nextSortOrder) / 2),
        needsRebalance: false,
      };
    }

    return { position: SPARSE_ORDER_STEP, needsRebalance: false };
  }

  async rebalanceUnitItems(
    tx: Prisma.TransactionClient,
    tenantId: string,
    learningUnitId: string,
  ): Promise<Map<string, number>> {
    const items = await tx.learningItem.findMany({
      where: { tenantId, learningUnitId },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: { id: true, sortOrder: true },
    });

    const positions = new Map<string, number>();
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!item) continue;
      const newSortOrder = (index + 1) * SPARSE_ORDER_STEP;
      positions.set(item.id, newSortOrder);
      if (item.sortOrder !== newSortOrder) {
        await tx.learningItem.update({
          where: { tenantId_id: { tenantId, id: item.id } },
          data: { sortOrder: newSortOrder },
        });
      }
    }

    return positions;
  }

  async rebalanceCourseSubjectUnits(
    tx: Prisma.TransactionClient,
    tenantId: string,
    courseSubjectId: string,
  ): Promise<Map<string, number>> {
    const units = await tx.learningUnit.findMany({
      where: { tenantId, courseSubjectId },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: { id: true, sortOrder: true },
    });

    const positions = new Map<string, number>();
    for (let index = 0; index < units.length; index += 1) {
      const unit = units[index];
      if (!unit) continue;
      const newSortOrder = (index + 1) * SPARSE_ORDER_STEP;
      positions.set(unit.id, newSortOrder);
      if (unit.sortOrder !== newSortOrder) {
        await tx.learningUnit.update({
          where: { tenantId_id: { tenantId, id: unit.id } },
          data: { sortOrder: newSortOrder },
        });
      }
    }

    return positions;
  }

  async determineItemPlacementPosition(params: {
    tx: Prisma.TransactionClient;
    tenantId: string;
    targetLearningUnitId: string;
    placement?: ItemPlacement | undefined;
    excludeItemId?: string | undefined;
  }): Promise<number> {
    const { tx, tenantId, targetLearningUnitId, placement, excludeItemId } =
      params;

    if (!placement || (!placement.relativeToId && !placement.position)) {
      const highest = await tx.learningItem.findFirst({
        where: {
          tenantId,
          learningUnitId: targetLearningUnitId,
          ...(excludeItemId ? { id: { not: excludeItemId } } : {}),
        },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });
      return this.computeNextEndPosition(highest?.sortOrder);
    }

    if (placement.relativeToId) {
      const items = await tx.learningItem.findMany({
        where: {
          tenantId,
          learningUnitId: targetLearningUnitId,
          ...(excludeItemId ? { id: { not: excludeItemId } } : {}),
        },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: { id: true, sortOrder: true },
      });

      const relIndex = items.findIndex(
        (item) => item.id === placement.relativeToId,
      );
      if (relIndex === -1) {
        const highest = items[items.length - 1];
        return this.computeNextEndPosition(highest?.sortOrder);
      }

      if (placement.position === 'BEFORE') {
        const nextItem = items[relIndex];
        const prevItem = relIndex > 0 ? items[relIndex - 1] : null;

        if (!nextItem) {
          return SPARSE_ORDER_STEP;
        }

        const midpoint = this.computeMidpoint(
          prevItem?.sortOrder ?? null,
          nextItem.sortOrder,
        );

        if (!midpoint.needsRebalance) {
          return midpoint.position;
        }

        await this.rebalanceUnitItems(tx, tenantId, targetLearningUnitId);

        const newPrev = relIndex > 0 ? relIndex * SPARSE_ORDER_STEP : null;
        const newNext = (relIndex + 1) * SPARSE_ORDER_STEP;
        return this.computeMidpoint(newPrev, newNext).position;
      }

      // Default to AFTER if position is 'AFTER' or omitted
      const prevItem = items[relIndex];
      const nextItem = relIndex < items.length - 1 ? items[relIndex + 1] : null;

      if (!prevItem) {
        return SPARSE_ORDER_STEP;
      }

      const midpoint = this.computeMidpoint(
        prevItem.sortOrder,
        nextItem?.sortOrder ?? null,
      );

      if (!midpoint.needsRebalance) {
        return midpoint.position;
      }

      await this.rebalanceUnitItems(tx, tenantId, targetLearningUnitId);

      const newPrev = (relIndex + 1) * SPARSE_ORDER_STEP;
      const newNext =
        relIndex < items.length - 1 ? (relIndex + 2) * SPARSE_ORDER_STEP : null;
      return this.computeMidpoint(newPrev, newNext).position;
    }

    const highest = await tx.learningItem.findFirst({
      where: {
        tenantId,
        learningUnitId: targetLearningUnitId,
        ...(excludeItemId ? { id: { not: excludeItemId } } : {}),
      },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return this.computeNextEndPosition(highest?.sortOrder);
  }
}
