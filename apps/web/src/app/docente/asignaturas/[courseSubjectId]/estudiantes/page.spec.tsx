import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import TeacherCourseSubjectRosterPage from '@/app/docente/asignaturas/[courseSubjectId]/estudiantes/page';

vi.mock('@/features/teacher-course-subject-roster', () => ({
  TeacherCourseSubjectRosterScreen: ({
    courseSubjectId,
  }: {
    courseSubjectId: string;
  }) => <div data-testid="teacher-roster-screen-route">{courseSubjectId}</div>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('teacher roster Next route', () => {
  it('resolves the route independently of authorized roster data', async () => {
    const courseSubjectId = '00000000-0000-4000-8000-000000000001';
    const element = await TeacherCourseSubjectRosterPage({
      params: Promise.resolve({ courseSubjectId }),
    });

    render(element);

    expect(screen.getByTestId('teacher-roster-screen-route').textContent).toBe(
      courseSubjectId,
    );
  });
});
