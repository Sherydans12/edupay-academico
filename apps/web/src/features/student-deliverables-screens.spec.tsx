import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AcademicApiError, type AcademicApiClient } from '@/api/academic-client';
import { StudentCalendarScreen, StudentDeliverablesScreen, StudentSubjectsScreen } from '@/features/student-screens';

vi.mock('next/navigation', () => ({ usePathname: () => '/estudiante', useRouter: () => ({ push: () => undefined }) }));
afterEach(cleanup);

const timestamp = '2026-08-08T12:00:00+00:00';
const subjectId = '00000000-0000-4000-8000-000000000201';
const studentId = '00000000-0000-4000-8000-000000000202';
const unitId = '00000000-0000-4000-8000-000000000203';

const subject = {
  id: subjectId,
  courseId: '00000000-0000-4000-8000-000000000204',
  subjectId: '00000000-0000-4000-8000-000000000205',
  defaultForCourse: true,
  sortOrder: 0,
  status: 'ACTIVE' as const,
  course: { id: '00000000-0000-4000-8000-000000000204', academicYearId: '00000000-0000-4000-8000-000000000206', source: 'MANUAL', externalReference: null, label: '7º Básico A', status: 'ACTIVE' as const, createdAt: timestamp, updatedAt: timestamp },
  subject: { id: '00000000-0000-4000-8000-000000000205', name: 'Lenguaje y Comunicación', status: 'ACTIVE' as const, createdAt: timestamp, updatedAt: timestamp },
  createdAt: timestamp,
  updatedAt: timestamp,
};

function learningItem(overrides: Record<string, unknown>) {
  return {
    id: '00000000-0000-4000-8000-000000000000',
    courseSubjectId: subjectId,
    learningUnitId: unitId,
    type: 'ASSIGNMENT' as const,
    title: 'Actividad',
    description: null,
    content: null,
    instructions: null,
    body: null,
    sortOrder: 0,
    publicationStatus: 'PUBLISHED' as const,
    publishAt: null,
    publishedAt: timestamp,
    publishedByIdentityUserId: 'teacher-user',
    dueAt: null,
    createdByIdentityUserId: 'teacher-user',
    updatedByIdentityUserId: null,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function route(items: ReturnType<typeof learningItem>[]) {
  return { courseSubjectId: subjectId, units: [{ id: unitId, courseSubjectId: subjectId, title: 'Unidad', description: null, sortOrder: 0, startAt: null, endAt: null, status: 'ACTIVE' as const, version: 1, createdAt: timestamp, updatedAt: timestamp, items }] };
}

function submission(id: string, learningItemId: string, status: 'SUBMITTED' | 'REVIEWED' | 'CHANGES_REQUESTED', overrides: Record<string, unknown> = {}) {
  return {
    id,
    studentId,
    learningItemId,
    status,
    createdAt: timestamp,
    updatedAt: timestamp,
    revisions: [{
      id: `${id}-revision-1`,
      revisionNumber: 1,
      studentComment: null,
      submittedAt: timestamp,
      effectiveDueAt: timestamp,
      isLate: false,
      createdByIdentityUserId: 'student-user',
      createdAt: timestamp,
      files: [{ id: `${id}-file-1`, originalFilename: 'trabajo.pdf', sizeBytes: 10, declaredMime: 'application/pdf', detectedMime: 'application/pdf', extension: '.pdf', category: 'STUDENT_SUBMISSION' as const, createdAt: timestamp }],
      reviews: [],
      ...(overrides.revision as Record<string, unknown> ?? {}),
    }],
  };
}

function notFound() {
  return new AcademicApiError({ code: 'NOT_FOUND', details: [], message: 'not found', requestId: 'req', status: 404 });
}

function client(overrides: Partial<AcademicApiClient>): AcademicApiClient {
  return overrides as AcademicApiClient;
}

describe('StudentSubjectsScreen', () => {
  it('renders effective subjects without leaking internal domain vocabulary', async () => {
    const api = client({ getStudentContextSubjects: vi.fn(async () => [subject]) });
    render(<StudentSubjectsScreen api={api} />);
    expect(await screen.findByRole('heading', { name: 'Asignaturas' })).toBeTruthy();
    expect(await screen.findByText('Lenguaje y Comunicación')).toBeTruthy();
    expect(screen.queryByText(/course ?subject/i)).toBeNull();
  });

  it('shows a real empty state when there are no effective subjects', async () => {
    const api = client({ getStudentContextSubjects: vi.fn(async () => []) });
    render(<StudentSubjectsScreen api={api} />);
    expect(await screen.findByRole('heading', { name: 'Aún no tienes asignaturas efectivas' })).toBeTruthy();
  });
});

describe('StudentDeliverablesScreen', () => {
  it('groups deliverables by what needs attention, what is in review, and what is reviewed', async () => {
    const overdueItem = learningItem({ id: '00000000-0000-4000-8000-000000000210', title: 'Guía atrasada', dueAt: '2020-01-01T12:00:00+00:00' });
    const changesItem = learningItem({ id: '00000000-0000-4000-8000-000000000211', title: 'Ensayo con cambios', type: 'ASSESSMENT' });
    const submittedItem = learningItem({ id: '00000000-0000-4000-8000-000000000212', title: 'Informe enviado' });
    const reviewedItem = learningItem({ id: '00000000-0000-4000-8000-000000000213', title: 'Control revisado' });
    const materialItem = learningItem({ id: '00000000-0000-4000-8000-000000000214', title: 'Guía de lectura', type: 'MATERIAL' });

    const changesSubmission = submission('00000000-0000-4000-8000-000000000221', changesItem.id, 'CHANGES_REQUESTED', {
      revision: { reviews: [{ id: '00000000-0000-4000-8000-000000000224', action: 'CHANGES_REQUESTED', comment: 'Corrige la introducción.', reviewerIdentityUserId: 'teacher-user', createdAt: timestamp }] },
    });
    const submittedSubmission = submission('00000000-0000-4000-8000-000000000222', submittedItem.id, 'SUBMITTED');
    const reviewedSubmission = submission('00000000-0000-4000-8000-000000000223', reviewedItem.id, 'REVIEWED');

    const api = client({
      getStudentContextSubjects: vi.fn(async () => [subject]),
      getLearningRoute: vi.fn(async () => route([overdueItem, changesItem, submittedItem, reviewedItem, materialItem])),
      getOwnSubmission: vi.fn(async (learningItemId: string) => {
        if (learningItemId === changesItem.id) return changesSubmission;
        if (learningItemId === submittedItem.id) return submittedSubmission;
        if (learningItemId === reviewedItem.id) return reviewedSubmission;
        throw notFound();
      }),
    });

    render(<StudentDeliverablesScreen api={api} />);

    expect(await screen.findByRole('heading', { name: 'Mis entregas' })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Requiere tu atención' })).toBeTruthy();
    expect(screen.getByText('Guía atrasada')).toBeTruthy();
    expect(screen.getByText('Atrasada')).toBeTruthy();
    expect(screen.getByText('Ensayo con cambios')).toBeTruthy();
    expect(screen.getByText('Cambios solicitados')).toBeTruthy();

    expect(screen.getByRole('heading', { name: 'En revisión' })).toBeTruthy();
    expect(screen.getByText('Informe enviado')).toBeTruthy();
    expect(screen.getByText('Enviada')).toBeTruthy();

    expect(screen.getByRole('heading', { name: 'Revisadas' })).toBeTruthy();
    expect(screen.getByText('Control revisado')).toBeTruthy();
    expect(screen.getByText('Revisada')).toBeTruthy();

    expect(screen.queryByText('Guía de lectura')).toBeNull();
  });

  it('shows a human empty state when no subject has deliverable content', async () => {
    const materialItem = learningItem({ id: '00000000-0000-4000-8000-000000000215', title: 'Guía de lectura', type: 'MATERIAL' });
    const api = client({
      getStudentContextSubjects: vi.fn(async () => [subject]),
      getLearningRoute: vi.fn(async () => route([materialItem])),
      getOwnSubmission: vi.fn(async () => { throw notFound(); }),
    });
    render(<StudentDeliverablesScreen api={api} />);
    expect(await screen.findByRole('heading', { name: 'Aún no tienes actividades pendientes' })).toBeTruthy();
  });
});

describe('StudentCalendarScreen', () => {
  function futureAt(daysAhead: number, hour: number) {
    const date = new Date();
    date.setDate(date.getDate() + daysAhead);
    date.setHours(hour, 0, 0, 0);
    return date.toISOString();
  }

  it('groups deliverables with due dates into a chronological agenda', async () => {
    const morningItem = learningItem({ id: '00000000-0000-4000-8000-000000000230', title: 'Prueba de la mañana', dueAt: futureAt(4, 9) });
    const afternoonItem = learningItem({ id: '00000000-0000-4000-8000-000000000231', title: 'Entrega de la tarde', dueAt: futureAt(4, 15) });
    const laterItem = learningItem({ id: '00000000-0000-4000-8000-000000000232', title: 'Ensayo próximo', dueAt: futureAt(5, 9) });
    const undated = learningItem({ id: '00000000-0000-4000-8000-000000000233', title: 'Sin fecha', dueAt: null });

    const api = client({
      getStudentContextSubjects: vi.fn(async () => [subject]),
      getLearningRoute: vi.fn(async () => route([morningItem, afternoonItem, laterItem, undated])),
    });

    render(<StudentCalendarScreen api={api} />);
    expect(await screen.findByRole('heading', { name: 'Calendario' })).toBeTruthy();
    expect(await screen.findByText('Prueba de la mañana')).toBeTruthy();
    expect(screen.getByText('Entrega de la tarde')).toBeTruthy();
    expect(screen.getByText('Ensayo próximo')).toBeTruthy();
    expect(screen.queryByText('Sin fecha')).toBeNull();

    const dayHeadings = screen.getAllByRole('heading', { level: 2 }).filter((heading) => heading.id.startsWith('calendar-day-'));
    expect(dayHeadings.length).toBe(2);
  });

  it('shows a human empty state when no deliverable has a due date', async () => {
    const undated = learningItem({ id: '00000000-0000-4000-8000-000000000234', title: 'Sin fecha', dueAt: null });
    const api = client({
      getStudentContextSubjects: vi.fn(async () => [subject]),
      getLearningRoute: vi.fn(async () => route([undated])),
    });
    render(<StudentCalendarScreen api={api} />);
    expect(await screen.findByRole('heading', { name: 'Sin fechas próximas' })).toBeTruthy();
  });
});
