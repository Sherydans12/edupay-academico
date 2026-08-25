// The contract package is exercised by the workspace Vitest runner owned by the API.
// @ts-expect-error Vitest is intentionally not a production contract dependency.
import { describe, expect, it } from 'vitest';

import {
  duplicateLearningItemSchema,
  duplicateLearningUnitSchema,
  moveLearningItemSchema,
  reorderLearningSchema,
  updateLearningItemSchema,
  updateLearningUnitSchema,
} from './index.js';

const ids = {
  courseSubject: '10000000-0000-4000-8000-000000000003',
  unit1: '10000000-0000-4000-8000-000000000004',
  unit2: '10000000-0000-4000-8000-000000000005',
  item1: '10000000-0000-4000-8000-000000000006',
  item2: '10000000-0000-4000-8000-000000000007',
};

describe('learning atomic commands contracts', () => {
  it('validates reorderLearningSchema with and without expectedOrderRevision', () => {
    const validReorder = reorderLearningSchema.safeParse({
      orderedIds: [ids.unit1, ids.unit2],
      expectedOrderRevision: 3,
    });
    expect(validReorder.success).toBe(true);

    const validWithoutRevision = reorderLearningSchema.safeParse({
      orderedIds: [ids.unit1, ids.unit2],
    });
    expect(validWithoutRevision.success).toBe(true);

    const duplicateIds = reorderLearningSchema.safeParse({
      orderedIds: [ids.unit1, ids.unit1],
    });
    expect(duplicateIds.success).toBe(false);

    const emptyIds = reorderLearningSchema.safeParse({
      orderedIds: [],
    });
    expect(emptyIds.success).toBe(false);
  });

  it('validates moveLearningItemSchema with placement, revisions, and target unit', () => {
    const validMoveWithPlacement = moveLearningItemSchema.safeParse({
      targetLearningUnitId: ids.unit2,
      placement: {
        relativeToId: ids.item2,
        position: 'BEFORE',
      },
      expectedRevision: 4,
      sourceOrderRevision: 2,
      targetOrderRevision: 5,
    });
    expect(validMoveWithPlacement.success).toBe(true);

    const validMinimalMove = moveLearningItemSchema.safeParse({
      targetLearningUnitId: ids.unit2,
    });
    expect(validMinimalMove.success).toBe(true);

    const invalidPosition = moveLearningItemSchema.safeParse({
      targetLearningUnitId: ids.unit2,
      placement: {
        relativeToId: ids.item2,
        position: 'INVALID_POSITION',
      },
    });
    expect(invalidPosition.success).toBe(false);
  });

  it('validates duplicateLearningUnitSchema and duplicateLearningItemSchema', () => {
    const validUnitDup = duplicateLearningUnitSchema.safeParse({
      title: 'Cloned Unit',
      duplicateItems: true,
    });
    expect(validUnitDup.success).toBe(true);

    const validItemDup = duplicateLearningItemSchema.safeParse({
      targetLearningUnitId: ids.unit2,
      title: 'Cloned Item',
    });
    expect(validItemDup.success).toBe(true);
  });

  it('validates updateLearningUnitSchema and updateLearningItemSchema with expectedRevision', () => {
    const validUnitUpdate = updateLearningUnitSchema.safeParse({
      title: 'Updated Title',
      expectedRevision: 1,
    });
    expect(validUnitUpdate.success).toBe(true);

    const validItemUpdate = updateLearningItemSchema.safeParse({
      title: 'Updated Item',
      expectedRevision: 2,
      confirmSensitiveChange: true,
    });
    expect(validItemUpdate.success).toBe(true);
  });
});
