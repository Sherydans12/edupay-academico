import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AcademicApiError,
  type AcademicApiClient,
} from '@/api/academic-client';
import { demoSessions } from '@/demo/demo-data';
import { TeacherCourseSubjectRosterScreen } from '@/features/teacher-course-subject-roster';

vi.mock('next/navigation', () => ({
  usePathname: () => '/docente/asignaturas/subject-1/estudiantes',
  useRouter: () => ({ push: () => undefined }),
}));

afterEach(() => cleanup());

const subjectId = '00000000-0000-4000-8000-000000000001';
const otherSubjectId = '00000000-0000-4000-8000-000000000003';
const studentId = '00000000-0000-4000-8000-000000000002';
const timestamp = '2026-08-08T12:00:00+00:00';
const subject = {
  id: subjectId,
  courseId: subjectId,
  subjectId: subjectId,
  defaultForCourse: true,
  sortOrder: 0,
  status: 'ACTIVE' as const,
  course: {
    id: subjectId,
    academicYearId: subjectId,
    source: 'MANUAL',
    externalReference: null,
    label: '7º Básico A',
    status: 'ACTIVE' as const,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  subject: {
    id: subjectId,
    name: 'Lenguaje y Comunicación',
    status: 'ACTIVE' as const,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  createdAt: timestamp,
  updatedAt: timestamp,
};
const otherSubject = {
  ...subject,
  id: otherSubjectId,
  courseId: otherSubjectId,
  subjectId: otherSubjectId,
  course: { ...subject.course, id: otherSubjectId, label: '8º Básico A' },
  subject: {
    ...subject.subject,
    id: otherSubjectId,
    name: 'Matemática',
  },
};

function client(overrides: Partial<AcademicApiClient>): AcademicApiClient {
  return overrides as AcademicApiClient;
}

describe('Teacher course subject roster route', () => {
  it('loads the authorized roster using the synthetic teacher session', async () => {
    const getTeacherCourseSubjectRoster = vi.fn(async () => [
      {
        access: ['COURSE_DEFAULT' as const],
        student: {
          id: studentId,
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
    ]);

    render(
      <TeacherCourseSubjectRosterScreen
        api={client({
          getTeacherContextSubjects: vi.fn(async () => [subject, otherSubject]),
          getTeacherCourseSubjectRoster,
        })}
        courseSubjectId={subjectId}
        session={demoSessions.teacher}
      />,
    );

    expect(
      await screen.findByRole('heading', {
        name: 'Estudiantes · Lenguaje y Comunicación',
      }),
    ).toBeTruthy();
    expect(await screen.findByText('Emilia Vargas')).toBeTruthy();
    expect(getTeacherCourseSubjectRoster).toHaveBeenCalledWith(subjectId);
    expect(getTeacherCourseSubjectRoster).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Matemática')).toBeNull();
  });

  it('shows the API authorization boundary without rendering roster data', async () => {
    render(
      <TeacherCourseSubjectRosterScreen
        api={client({
          getTeacherContextSubjects: vi.fn(async () => [subject]),
          getTeacherCourseSubjectRoster: vi.fn(async () => {
            throw new AcademicApiError({
              code: 'FORBIDDEN',
              details: [],
              message: 'Acceso denegado',
              requestId: 'synthetic-403',
              status: 403,
            });
          }),
        })}
        courseSubjectId={subjectId}
        session={demoSessions.teacher}
      />,
    );

    expect(await screen.findByText('Acceso no autorizado')).toBeTruthy();
    expect(screen.queryByText('Emilia Vargas')).toBeNull();
  });

  it('does not request a roster for a subject outside the teacher context', async () => {
    const getTeacherCourseSubjectRoster = vi.fn();

    render(
      <TeacherCourseSubjectRosterScreen
        api={client({
          getTeacherContextSubjects: vi.fn(async () => []),
          getTeacherCourseSubjectRoster,
        })}
        courseSubjectId={subjectId}
        session={demoSessions.teacher}
      />,
    );

    expect(await screen.findByText('Asignatura no disponible')).toBeTruthy();
    expect(getTeacherCourseSubjectRoster).not.toHaveBeenCalled();
  });
});
