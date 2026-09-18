import { describe, expect, it } from 'vitest';

import { evaluateAcademicPreparation } from './academic-preparation';

const evaluatedAt = '2026-09-15T12:00:00.000Z';

function prepare(
  years: Array<{
    id: string;
    status: 'DRAFT' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED';
  }>,
  courses: { active: number; draft: number } | null = null,
) {
  return evaluateAcademicPreparation({ evaluatedAt, years, courses });
}

describe('evaluateAcademicPreparation', () => {
  it('asks to create a year when the tenant has no academic years', () => {
    const result = prepare([]);

    expect(result).toMatchObject({
      status: 'ACTION_REQUIRED',
      ready: false,
      academicYears: {
        total: 0,
        active: 0,
        draft: 0,
        selectedActiveYearId: null,
      },
      courses: {
        activeInSelectedYear: null,
        draftInSelectedYear: null,
      },
    });
    expect(result.checks[0]).toMatchObject({
      code: 'ACADEMIC_YEAR',
      status: 'ACTION_REQUIRED',
      action: 'Crear año académico',
    });
    expect(result.checks[1]).toMatchObject({
      code: 'COURSES',
      status: 'ACTION_REQUIRED',
    });
  });

  it('does not attribute draft courses to a selected year before one is active', () => {
    const result = prepare([{ id: 'year-draft', status: 'DRAFT' }], {
      active: 0,
      draft: 3,
    });

    expect(result.academicYears.selectedActiveYearId).toBeNull();
    expect(result.courses).toEqual({
      activeInSelectedYear: null,
      draftInSelectedYear: null,
    });
    expect(result.checks[1]).toMatchObject({
      code: 'COURSES',
      status: 'ACTION_REQUIRED',
      action: 'Activar un año académico primero',
    });
  });

  it('asks to activate a course when the only active year has draft courses', () => {
    const result = prepare([{ id: 'year-active', status: 'ACTIVE' }], {
      active: 0,
      draft: 2,
    });

    expect(result).toMatchObject({
      status: 'ACTION_REQUIRED',
      academicYears: { selectedActiveYearId: 'year-active' },
      courses: { activeInSelectedYear: 0, draftInSelectedYear: 2 },
    });
    expect(result.checks[1]).toMatchObject({
      status: 'ACTION_REQUIRED',
      action: 'Activar un curso',
    });
  });

  it('returns READY only with one active year and one active course in it', () => {
    const result = prepare([{ id: 'year-active', status: 'ACTIVE' }], {
      active: 1,
      draft: 0,
    });

    expect(result).toMatchObject({
      status: 'READY',
      ready: true,
      academicYears: { selectedActiveYearId: 'year-active' },
      courses: { activeInSelectedYear: 1, draftInSelectedYear: 0 },
    });
  });

  it('blocks the indicator when multiple academic years are active', () => {
    const result = prepare(
      [
        { id: 'year-a', status: 'ACTIVE' },
        { id: 'year-b', status: 'ACTIVE' },
      ],
      { active: 4, draft: 1 },
    );

    expect(result).toMatchObject({
      status: 'BLOCKED',
      ready: false,
      academicYears: { active: 2, selectedActiveYearId: null },
      courses: { activeInSelectedYear: null, draftInSelectedYear: null },
    });
    expect(result.checks[0]).toMatchObject({
      status: 'BLOCKED',
      action: 'Resolver años activos',
    });
  });
});
