import { describe, expect, it } from 'vitest';

import {
  LEARNING_OPERATIONAL_TIME_ZONE,
  learningDateTimeLocalToInstant,
  learningInstantToDateTimeLocal,
} from '@/features/learning-datetime';

describe('Learning operational datetime boundary', () => {
  it('converts pilot local time to the same UTC instant on every host timezone', () => {
    expect(LEARNING_OPERATIONAL_TIME_ZONE).toBe('America/Santiago');
    expect(learningDateTimeLocalToInstant('2026-08-20T18:00')).toBe('2026-08-20T22:00:00.000Z');
  });

  it('converts a UTC instant back to the pilot local datetime input', () => {
    expect(learningInstantToDateTimeLocal('2026-08-20T22:00:00.000Z')).toBe('2026-08-20T18:00');
  });

  it('uses the DST-aware America/Santiago summer offset instead of fixed UTC-04', () => {
    expect(learningDateTimeLocalToInstant('2026-01-15T18:00')).toBe('2026-01-15T21:00:00.000Z');
    expect(learningInstantToDateTimeLocal('2026-01-15T21:00:00.000Z')).toBe('2026-01-15T18:00');
  });
});
