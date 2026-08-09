import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StudentDashboardScreen } from '@/features/student-screens';
import { TeacherDashboardScreen } from '@/features/teacher-screens';
import type { AcademicApiClient } from '@/api/academic-client';

vi.mock('next/navigation', () => ({ usePathname: () => '/estudiante' }));

describe('representative workspaces', () => {
  const subject = { id: '00000000-0000-4000-8000-000000000001', courseId: '00000000-0000-4000-8000-000000000002', subjectId: '00000000-0000-4000-8000-000000000003', defaultForCourse: true, sortOrder: 0, status: 'ACTIVE' as const, course: { id: '00000000-0000-4000-8000-000000000002', academicYearId: '00000000-0000-4000-8000-000000000004', label: '7º Básico A', status: 'ACTIVE' as const, createdAt: '2026-08-08T12:00:00+00:00', updatedAt: '2026-08-08T12:00:00+00:00' }, subject: { id: '00000000-0000-4000-8000-000000000003', name: 'Lenguaje y Comunicación', status: 'ACTIVE' as const, createdAt: '2026-08-08T12:00:00+00:00', updatedAt: '2026-08-08T12:00:00+00:00' }, createdAt: '2026-08-08T12:00:00+00:00', updatedAt: '2026-08-08T12:00:00+00:00' };
  const item = { id: '00000000-0000-4000-8000-000000000005', courseSubjectId: subject.id, learningUnitId: '00000000-0000-4000-8000-000000000006', type: 'ASSIGNMENT' as const, title: 'Entrega real', description: 'Instrucciones reales', content: null, instructions: 'Resuelve la actividad.', body: null, sortOrder: 0, publicationStatus: 'PUBLISHED' as const, publishAt: null, publishedAt: '2026-08-08T12:00:00+00:00', publishedByIdentityUserId: 'teacher-user', dueAt: '2026-08-12T20:00:00+00:00', createdByIdentityUserId: 'teacher-user', updatedByIdentityUserId: null, createdAt: '2026-08-08T12:00:00+00:00', updatedAt: '2026-08-08T12:00:00+00:00' };
  const route = { courseSubjectId: subject.id, units: [{ id: item.learningUnitId, courseSubjectId: subject.id, title: 'Unidad real', description: 'Ruta real', sortOrder: 0, startAt: null, endAt: null, status: 'ACTIVE' as const, createdAt: '2026-08-08T12:00:00+00:00', updatedAt: '2026-08-08T12:00:00+00:00', items: [item] }] };

  it('renders the student next-action and assigned-subject experience from Learning API data', async () => {
    const api = { getStudentContextSubjects: vi.fn(async () => [subject]), getLearningRoute: vi.fn(async () => route) } as unknown as AcademicApiClient;
    render(<StudentDashboardScreen api={api} />);
    expect(screen.getByRole('heading', { name: 'Hola, Sofía' })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: /tu próximo paso/i })).toBeTruthy();
    expect(screen.getAllByText('Lenguaje y Comunicación').length).toBeGreaterThan(0);
    expect(screen.getByText('Datos académicos y de aprendizaje reales')).toBeTruthy();
    expect(screen.queryByText(/reseña literaria/i)).toBeNull();
  });

  it('renders the teacher authorized spaces without synthetic submissions', async () => {
    const api = { getTeacherContextSubjects: vi.fn(async () => [subject]) } as unknown as AcademicApiClient;
    render(<TeacherDashboardScreen api={api} />);
    expect(screen.getByRole('heading', { name: 'Buenos días, Camila' })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Contenido autorizado' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /ver contenido/i })).toBeTruthy();
    expect(screen.queryByText('Emilia Vargas')).toBeNull();
  });
});
