import { describe, expect, it } from 'vitest';

import {
  LEARNING_OPERATIONAL_TIME_ZONE,
  formatLearningCalendarDay,
  formatLearningInstant,
  learningCalendarDayKey,
  learningDateTimeLocalToInstant,
  learningInstantToDateTimeLocal,
  learningTimeZone,
} from '@/features/learning-datetime';

describe('Learning operational datetime boundary', () => {
  it('converts pilot local time to the same UTC instant on every host timezone', () => {
    expect(LEARNING_OPERATIONAL_TIME_ZONE).toBe('America/Santiago');
    expect(learningDateTimeLocalToInstant('2026-08-20T18:00')).toBe(
      '2026-08-20T22:00:00.000Z',
    );
  });

  it('converts a UTC instant back to the pilot local datetime input', () => {
    expect(learningInstantToDateTimeLocal('2026-08-20T22:00:00.000Z')).toBe(
      '2026-08-20T18:00',
    );
  });

  it('uses the DST-aware America/Santiago summer offset instead of fixed UTC-04', () => {
    expect(learningDateTimeLocalToInstant('2026-01-15T18:00')).toBe(
      '2026-01-15T21:00:00.000Z',
    );
    expect(learningInstantToDateTimeLocal('2026-01-15T21:00:00.000Z')).toBe(
      '2026-01-15T18:00',
    );
  });

  it('formats absolute instants in the tenant operational zone', () => {
    expect(
      formatLearningInstant('2026-09-28T02:30:00.000Z', 'America/Santiago'),
    ).toMatch(/27.*09.*2026/);
    expect(formatLearningInstant('2026-09-28T02:30:00.000Z', 'UTC')).toMatch(
      /28.*09.*2026/,
    );
  });

  it('groups calendar days at the operational midnight, not browser midnight', () => {
    expect(
      learningCalendarDayKey('2026-09-28T02:30:00.000Z', 'America/Santiago'),
    ).toBe('2026-09-27');
    expect(
      learningCalendarDayKey('2026-09-28T03:30:00.000Z', 'America/Santiago'),
    ).toBe('2026-09-28');
    expect(
      formatLearningCalendarDay(
        '2026-09-28T03:30:00.000Z',
        Date.parse('2026-09-28T02:00:00.000Z'),
        'America/Santiago',
      ),
    ).toBe('Mañana');
  });

  it('falls back safely when the configured timezone is missing or invalid', () => {
    expect(learningTimeZone(null)).toBe(LEARNING_OPERATIONAL_TIME_ZONE);
    expect(learningTimeZone('invalid/zone')).toBe(
      LEARNING_OPERATIONAL_TIME_ZONE,
    );
    expect(learningTimeZone('UTC')).toBe('UTC');
  });
});
