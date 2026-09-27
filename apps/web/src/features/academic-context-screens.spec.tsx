import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TeacherAcademicSubjectsScreen } from '@/features/academic-context-screens';
import type { AcademicApiClient } from '@/api/academic-client';

vi.mock('next/navigation', () => ({
  usePathname: () => '/estudiante/asignaturas',
  useRouter: () => ({ push: () => undefined }),
}));

const id = '00000000-0000-4000-8000-000000000001';
const timestamp = '2026-08-08T12:00:00+00:00';
const contextSubject = {
  id,
  courseId: id,
  subjectId: id,
  defaultForCourse: true,
  sortOrder: 0,
  status: 'ACTIVE' as const,
  course: {
    id,
    academicYearId: id,
    source: 'MANUAL',
    externalReference: null,
    label: '7º Básico A',
    status: 'ACTIVE' as const,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  subject: {
    id,
    name: 'Lenguaje y Comunicación',
    status: 'ACTIVE' as const,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  createdAt: timestamp,
  updatedAt: timestamp,
};

function client(overrides: Partial<AcademicApiClient>): AcademicApiClient {
  return overrides as AcademicApiClient;
}

afterEach(cleanup);

describe('Academic context screens', () => {
  it('searches all assigned subjects, including those beyond the first local page', async () => {
    const subjects = Array.from({ length: 18 }, (_, index) => ({
      ...contextSubject,
      id: `subject-${index + 1}`,
      subject: {
        ...contextSubject.subject,
        name: `Asignatura ${String(index + 1).padStart(2, '0')}`,
      },
    }));
    render(
      <TeacherAcademicSubjectsScreen
        api={client({ getTeacherContextSubjects: vi.fn(async () => subjects) })}
      />,
    );
    expect(await screen.findByText('18 asignaturas')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Asignatura 18' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByRole('heading', { name: 'Asignatura 18' })).toBeTruthy();
    fireEvent.change(
      screen.getByRole('searchbox', { name: /buscar por asignatura o curso/i }),
      { target: { value: 'Asignatura 18' } },
    );
    expect(screen.getByRole('heading', { name: 'Asignatura 18' })).toBeTruthy();
    expect(screen.queryByText('Página 2 de 2')).toBeNull();
  });

  it('shows only assigned subjects and links to the authorized roster', async () => {
    render(
      <TeacherAcademicSubjectsScreen
        api={client({
          getTeacherContextSubjects: vi.fn(async () => [contextSubject]),
          getTeacherCourseSubjectRoster: vi.fn(async () => [
            {
              access: ['COURSE_DEFAULT' as const],
              student: {
                id,
                identityUserId: null,
                source: 'MANUAL',
                externalReference: null,
                firstName: 'Emilia',
                lastName: 'Vargas',
                email: null,
                status: 'ACTIVE' as const,
                createdAt: timestamp,
                updatedAt: timestamp,
              },
            },
          ]),
        })}
      />,
    );
    expect(
      await screen.findByRole('heading', { name: 'Lenguaje y Comunicación' }),
    ).toBeTruthy();
    expect(await screen.findByText(/asignación activa/i)).toBeTruthy();
    expect(screen.queryByText(/learning api|coursesubjects/i)).toBeNull();
    expect(
      screen
        .getByRole('link', { name: /ver estudiantes/i })
        .getAttribute('href'),
    ).toBe(`/docente/asignaturas/${id}/estudiantes`);
    fireEvent.change(
      screen.getByRole('searchbox', { name: /buscar por asignatura o curso/i }),
      { target: { value: 'matemática' } },
    );
    expect(screen.getByText('Sin coincidencias')).toBeTruthy();
    expect(screen.queryByText('Emilia Vargas')).toBeNull();
  });
});
