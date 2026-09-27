import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { CourseSubject } from '@edupay/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AcademicApiClient } from '@/api/academic-client';
import { CourseBuilder } from './course-builder';

vi.mock('next/navigation', () => ({
  usePathname: () => '/docente/asignaturas/space-1',
  useRouter: () => ({ push: () => undefined }),
}));

afterEach(cleanup);

describe('CourseBuilder save recovery', () => {
  it('keeps the unit editor and its content after a failed save, then closes on retry', async () => {
    const createLearningUnit = vi
      .fn()
      .mockRejectedValueOnce(new Error('Fallo sintético'))
      .mockResolvedValueOnce({ id: 'unit-2' });
    const subject = {
      id: 'space-1',
      courseId: 'course-1',
      subjectId: 'subject-1',
      course: { id: 'course-1', label: '7º Básico A' },
      subject: { id: 'subject-1', name: 'Lenguaje' },
    } as CourseSubject;

    render(
      <CourseBuilder
        api={{ createLearningUnit } as unknown as AcademicApiClient}
        initialUnits={[]}
        subject={subject}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Nueva unidad' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Título' }), {
      target: { value: 'Escritura creativa' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear unidad' }));

    await waitFor(() => expect(createLearningUnit).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('dialog', { name: 'Nueva unidad' })).toBeTruthy();
    expect(
      (screen.getByRole('textbox', { name: 'Título' }) as HTMLInputElement)
        .value,
    ).toBe('Escritura creativa');

    fireEvent.click(screen.getByRole('button', { name: 'Crear unidad' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Nueva unidad' })).toBeNull(),
    );
    expect(createLearningUnit).toHaveBeenCalledTimes(2);
  });
});
