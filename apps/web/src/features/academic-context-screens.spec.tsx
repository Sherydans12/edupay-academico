import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StudentAcademicSubjectsScreen, TeacherAcademicSubjectsScreen } from '@/features/academic-context-screens';
import type { AcademicApiClient } from '@/api/academic-client';

vi.mock('next/navigation', () => ({ usePathname: () => '/estudiante/asignaturas' }));

const id = '00000000-0000-4000-8000-000000000001';
const timestamp = '2026-08-08T12:00:00+00:00';
const contextSubject = { id, courseId: id, subjectId: id, defaultForCourse: true, sortOrder: 0, status: 'ACTIVE' as const, course: { id, academicYearId: id, label: '7º Básico A', status: 'ACTIVE' as const, createdAt: timestamp, updatedAt: timestamp }, subject: { id, name: 'Lenguaje y Comunicación', status: 'ACTIVE' as const, createdAt: timestamp, updatedAt: timestamp }, createdAt: timestamp, updatedAt: timestamp };

function client(overrides: Partial<AcademicApiClient>): AcademicApiClient {
  return overrides as AcademicApiClient;
}

describe('Academic context screens', () => {
  it('renders the student effective-subject view and labels learning as isolated demo data', async () => {
    render(<StudentAcademicSubjectsScreen api={client({ getStudentContextSubjects: vi.fn(async () => [contextSubject]) })} />);
    expect(await screen.findByRole('heading', { name: 'Lenguaje y Comunicación' })).toBeTruthy();
    expect(screen.getByText(/contenido de aprendizaje: demo aislada/i)).toBeTruthy();
  });

  it('renders the teacher assigned-subject view and authorized roster', async () => {
    render(<TeacherAcademicSubjectsScreen api={client({ getTeacherContextSubjects: vi.fn(async () => [contextSubject]), getTeacherCourseSubjectRoster: vi.fn(async () => [{ access: ['COURSE_DEFAULT' as const], student: { id, identityUserId: null, source: 'MANUAL', externalReference: null, firstName: 'Emilia', lastName: 'Vargas', email: null, status: 'ACTIVE' as const, createdAt: timestamp, updatedAt: timestamp } }]) })} />);
    expect(await screen.findByRole('heading', { name: 'Lenguaje y Comunicación' })).toBeTruthy();
    expect(await screen.findByText(/asignado por académico/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /ver roster/i }));
    expect(await screen.findByText('Emilia Vargas')).toBeTruthy();
  });

  it('shows a real empty state for a student with no effective subjects', async () => {
    render(<StudentAcademicSubjectsScreen api={client({ getStudentContextSubjects: vi.fn(async () => []) })} />);
    expect(await screen.findByRole('heading', { name: 'Aún no tienes asignaturas efectivas' })).toBeTruthy();
  });
});
