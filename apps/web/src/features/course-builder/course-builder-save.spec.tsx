import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { CourseSubject, LearningUnitWithItems } from '@edupay/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AcademicApiError,
  type AcademicApiClient,
} from '@/api/academic-client';
import { CourseBuilder } from './course-builder';

vi.mock('next/navigation', () => ({
  usePathname: () => '/docente/asignaturas/space-1',
  useRouter: () => ({ push: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(cleanup);

describe('CourseBuilder save recovery', () => {
  it('shows a closed-year conflict as a save error without clearing the form', async () => {
    const createLearningUnit = vi.fn().mockRejectedValue(
      new AcademicApiError({
        code: 'CONFLICT',
        details: [],
        message: 'The academic year is read-only.',
        requestId: 'closed-year',
        status: 409,
      }),
    );
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
      target: { value: 'Texto conservado' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear unidad' }));

    expect(
      await screen.findByText('The academic year is read-only.'),
    ).toBeTruthy();
    expect(
      screen.queryByText('Conflicto de concurrencia detectado'),
    ).toBeNull();
    expect(
      (screen.getByRole('textbox', { name: 'Título' }) as HTMLInputElement)
        .value,
    ).toBe('Texto conservado');
  });

  it('opens the work draft editor for published content', async () => {
    const subject = {
      id: 'space-1',
      courseId: 'course-1',
      subjectId: 'subject-1',
      course: { id: 'course-1', label: '7º Básico A' },
      subject: { id: 'subject-1', name: 'Lenguaje' },
    } as CourseSubject;
    const publishedUnit = {
      id: 'unit-1',
      courseSubjectId: subject.id,
      title: 'Unidad publicada',
      description: null,
      status: 'ACTIVE',
      sortOrder: 1024,
      version: 1,
      startAt: null,
      endAt: null,
      items: [
        {
          id: 'item-1',
          courseSubjectId: subject.id,
          learningUnitId: 'unit-1',
          type: 'MATERIAL',
          title: 'Guía publicada',
          description: null,
          content: 'Texto original',
          instructions: null,
          body: null,
          bodyDocument: null,
          dueAt: null,
          publicationStatus: 'PUBLISHED',
          publishAt: null,
          publishedAt: '2026-09-01T12:00:00Z',
          version: 2,
          sortOrder: 1024,
        },
      ],
    } as LearningUnitWithItems;
    render(
      <CourseBuilder
        api={
          {
            getLearningItemDraft: vi.fn().mockResolvedValue({ draft: null }),
          } as unknown as AcademicApiClient
        }
        initialUnits={[publishedUnit]}
        subject={subject}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Editar Guía publicada' }),
    );
    expect(
      await screen.findByText(/estás editando un borrador de trabajo/i),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Guardar contenido' }),
    ).toBeNull();
  });

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
