import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AcademicApiError, type AcademicApiClient } from '@/api/academic-client';
import { AcademicAdminScreen } from '@/features/academic-admin';

vi.mock('next/navigation', () => ({ usePathname: () => '/administracion/estructura' }));

const id = '00000000-0000-4000-8000-000000000001';
const timestamp = '2026-08-08T12:00:00+00:00';
const year = { id, label: '2026', startDate: '2026-03-01', endDate: '2026-12-31', status: 'ACTIVE' as const, createdAt: timestamp, updatedAt: timestamp };
const course = { id, academicYearId: id, label: '7º Básico A', status: 'ACTIVE' as const, createdAt: timestamp, updatedAt: timestamp };
const subject = { id, name: 'Lenguaje y Comunicación', status: 'ACTIVE' as const, createdAt: timestamp, updatedAt: timestamp };
const courseSubject = { id, courseId: id, subjectId: id, defaultForCourse: true, sortOrder: 0, status: 'ACTIVE' as const, course, subject, createdAt: timestamp, updatedAt: timestamp };

function adminClient(overrides: Partial<AcademicApiClient>): AcademicApiClient {
  return {
    listAcademicYears: vi.fn(async () => ({ items: [year], nextCursor: null })),
    listCourses: vi.fn(async () => ({ items: [course], nextCursor: null })),
    listStudents: vi.fn(async () => ({ items: [], nextCursor: null })),
    listTeachers: vi.fn(async () => ({ items: [], nextCursor: null })),
    listSubjects: vi.fn(async () => ({ items: [subject], nextCursor: null })),
    listCourseSubjects: vi.fn(async () => ({ items: [courseSubject], nextCursor: null })),
    getCourseRoster: vi.fn(async () => []),
    ...overrides,
  } as unknown as AcademicApiClient;
}

describe('Academic admin screens', () => {
  it('renders academic years and course roster selectors from API data', async () => {
    render(<AcademicAdminScreen api={adminClient({})} view="structure" />);
    expect(await screen.findByRole('heading', { name: 'Años académicos' })).toBeTruthy();
    expect(screen.getByText('2026')).toBeTruthy();
    expect(screen.getByRole('option', { name: '7º Básico A' })).toBeTruthy();
    expect(screen.getAllByText('Lenguaje y Comunicación').length).toBeGreaterThan(0);
  });

  it('renders the enrollment and assignment workflows for academic structure', async () => {
    render(<AcademicAdminScreen api={adminClient({})} view="people" />);
    expect(await screen.findByRole('heading', { name: 'Inscripciones y asignaciones' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Asignar docente a CourseSubject' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Asignar subject directamente' })).toBeTruthy();
  });

  it('renders a forbidden state without pretending data is available', async () => {
    const forbidden = new AcademicApiError({ code: 'FORBIDDEN', details: [], message: 'forbidden', requestId: 'req-403', status: 403 });
    render(<AcademicAdminScreen api={adminClient({ listAcademicYears: vi.fn(async () => { throw forbidden; }) })} view="overview" />);
    expect(await screen.findByText('Sin permiso para este espacio')).toBeTruthy();
    expect(screen.getByText(/tu sesión está autenticada/i)).toBeTruthy();
  });
});
