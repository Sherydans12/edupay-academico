import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  LearningItem,
  LearningUnitWithItems,
  Submission,
} from '@edupay/contracts';

import type { AcademicApiClient } from '@/api/academic-client';
import {
  TeacherActivitySubmissionsView,
  TeacherDeliverablesCatalog,
  TeacherSubmissionDetail,
  TeacherSubmissionQueue,
} from './teacher-submission-workflow';

const mockRoster = [
  {
    access: ['COURSE_DEFAULT' as const],
    student: {
      id: 'student-1',
      identityUserId: 'user-student-1',
      source: 'MANUAL',
      externalReference: null,
      firstName: 'Camila',
      lastName: 'Valenzuela',
      email: 'camila@example.com',
      status: 'ACTIVE' as const,
      createdAt: '2026-03-01T08:00:00Z',
      updatedAt: '2026-03-01T08:00:00Z',
    },
  },
  {
    access: ['COURSE_DEFAULT' as const],
    student: {
      id: 'student-2',
      identityUserId: 'user-student-2',
      source: 'MANUAL',
      externalReference: null,
      firstName: 'Matías',
      lastName: 'González',
      email: 'matias@example.com',
      status: 'ACTIVE' as const,
      createdAt: '2026-03-01T08:00:00Z',
      updatedAt: '2026-03-01T08:00:00Z',
    },
  },
  {
    access: ['COURSE_DEFAULT' as const],
    student: {
      id: 'student-3',
      identityUserId: 'user-student-3',
      source: 'MANUAL',
      externalReference: null,
      firstName: 'Sofía',
      lastName: 'Morales',
      email: 'sofia@example.com',
      status: 'ACTIVE' as const,
      createdAt: '2026-03-01T08:00:00Z',
      updatedAt: '2026-03-01T08:00:00Z',
    },
  },
];

const assignmentItem: LearningItem = {
  id: 'item-assignment-1',
  courseSubjectId: 'course-subject-1',
  learningUnitId: 'unit-1',
  type: 'ASSIGNMENT',
  title: 'Guía 1: Comprensión Lectora',
  description: 'Actividad formativa sobre microcuentos latinoamericanos',
  content: null,
  bodyDocument: null,
  body: null,
  instructions: 'Lee atentamente y responde las preguntas.',
  dueAt: '2026-10-15T18:00:00Z',
  publishAt: null,
  publishedAt: '2026-10-01T09:00:00Z',
  publishedByIdentityUserId: 'teacher-1',
  createdByIdentityUserId: 'teacher-1',
  updatedByIdentityUserId: 'teacher-1',
  publicationStatus: 'PUBLISHED',
  sortOrder: 1,
  version: 1,
  createdAt: '2026-10-01T08:00:00Z',
  updatedAt: '2026-10-01T08:00:00Z',
};

const assessmentItem: LearningItem = {
  id: 'item-assessment-1',
  courseSubjectId: 'course-subject-1',
  learningUnitId: 'unit-1',
  type: 'ASSESSMENT',
  title: 'Evaluación Parcial 1: Ensayo Literario',
  description: 'Evaluación sumativa de unidad',
  content: null,
  bodyDocument: null,
  body: null,
  instructions: 'Redacta un ensayo de 500 palabras.',
  dueAt: '2026-10-20T23:59:00Z',
  publishAt: null,
  publishedAt: '2026-10-01T09:00:00Z',
  publishedByIdentityUserId: 'teacher-1',
  createdByIdentityUserId: 'teacher-1',
  updatedByIdentityUserId: 'teacher-1',
  publicationStatus: 'PUBLISHED',
  sortOrder: 2,
  version: 1,
  createdAt: '2026-10-01T08:00:00Z',
  updatedAt: '2026-10-01T08:00:00Z',
};

const mockUnits: LearningUnitWithItems[] = [
  {
    id: 'unit-1',
    courseSubjectId: 'course-subject-1',
    title: 'Unidad 1: Literatura Contemporánea',
    description: 'Primera unidad del semestre',
    sortOrder: 1,
    startAt: null,
    endAt: null,
    status: 'ACTIVE',
    version: 1,
    createdAt: '2026-03-01T08:00:00Z',
    updatedAt: '2026-03-01T08:00:00Z',
    items: [assignmentItem, assessmentItem],
  },
];

const mockSubmissions: Submission[] = [
  {
    id: 'sub-1',
    studentId: 'student-1',
    learningItemId: assignmentItem.id,
    status: 'SUBMITTED',
    createdAt: '2026-10-10T14:30:00Z',
    updatedAt: '2026-10-10T14:30:00Z',
    revisions: [
      {
        id: 'rev-1',
        revisionNumber: 1,
        studentComment: 'Entrego mi guía terminada',
        submittedAt: '2026-10-10T14:30:00Z',
        effectiveDueAt: '2026-10-15T18:00:00Z',
        isLate: false,
        createdByIdentityUserId: 'user-student-1',
        createdAt: '2026-10-10T14:30:00Z',
        files: [],
        reviews: [],
      },
    ],
  },
  {
    id: 'sub-2',
    studentId: 'student-2',
    learningItemId: assignmentItem.id,
    status: 'REVIEWED',
    createdAt: '2026-10-16T10:00:00Z',
    updatedAt: '2026-10-16T12:00:00Z',
    revisions: [
      {
        id: 'rev-2',
        revisionNumber: 1,
        studentComment: 'Entrega con un día de retraso',
        submittedAt: '2026-10-16T10:00:00Z',
        effectiveDueAt: '2026-10-15T18:00:00Z',
        isLate: true,
        createdByIdentityUserId: 'user-student-2',
        createdAt: '2026-10-16T10:00:00Z',
        files: [],
        reviews: [
          {
            id: 'rev-review-1',
            action: 'REVIEWED',
            comment: 'Buen trabajo',
            reviewerIdentityUserId: 'teacher-1',
            createdAt: '2026-10-16T12:00:00Z',
          },
        ],
      },
    ],
  },
];

describe('Teacher Deliverables & Submissions Workflow', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('1. Deliverables Catalog View (Vista 1)', () => {
    it('renders the activity cards catalog without loading all student submissions at once', () => {
      const onSelect = vi.fn();
      render(
        <TeacherDeliverablesCatalog
          items={[assignmentItem, assessmentItem]}
          onSelectActivity={onSelect}
          roster={mockRoster}
          units={mockUnits}
        />,
      );

      // Hero info
      expect(screen.getByText('Bandeja de Entregas y Evaluaciones')).toBeTruthy();
      expect(
        screen.getByText((_content, element) => element?.tagName.toLowerCase() === 'span' && element?.textContent === '2 actividades evaluables'),
      ).toBeTruthy();

      // Cards
      expect(screen.getByText('Guía 1: Comprensión Lectora')).toBeTruthy();
      expect(screen.getByText('Evaluación Parcial 1: Ensayo Literario')).toBeTruthy();

      // Unit chips
      expect(screen.getAllByText('Unidad 1: Literatura Contemporánea').length).toBe(2);

      // Filter chips
      fireEvent.click(screen.getByRole('button', { name: /evaluaciones/i }));

      // Only assessment is shown
      expect(screen.queryByText('Guía 1: Comprensión Lectora')).toBeNull();
      expect(screen.getByText('Evaluación Parcial 1: Ensayo Literario')).toBeTruthy();

      // Clicking action button calls onSelectActivity
      const viewBtn = screen.getByRole('button', {
        name: `Ver entregas de ${assessmentItem.title}`,
      });
      fireEvent.click(viewBtn);
      expect(onSelect).toHaveBeenCalledWith(assessmentItem);
    });

    it('filters activities by search query in the catalog', () => {
      render(
        <TeacherDeliverablesCatalog
          items={[assignmentItem, assessmentItem]}
          onSelectActivity={vi.fn()}
          roster={mockRoster}
          units={mockUnits}
        />,
      );

      const searchInput = screen.getByLabelText(/buscar actividad o evaluación/i);
      fireEvent.change(searchInput, { target: { value: 'Ensayo' } });

      expect(screen.queryByText('Guía 1: Comprensión Lectora')).toBeNull();
      expect(screen.getByText('Evaluación Parcial 1: Ensayo Literario')).toBeTruthy();
    });
  });

  describe('2. Activity Submissions Detailed View (Vista 2)', () => {
    it('fetches submissions for the selected activity, displays KPI metrics and student submissions list', async () => {
      const listSubmissions = vi.fn().mockResolvedValue(mockSubmissions);
      const api = { listSubmissions } as unknown as AcademicApiClient;
      const onBack = vi.fn();

      render(
        <TeacherActivitySubmissionsView
          api={api}
          item={assignmentItem}
          onBack={onBack}
          roster={mockRoster}
          unitTitle="Unidad 1: Literatura Contemporánea"
        />,
      );

      await waitFor(() => {
        expect(listSubmissions).toHaveBeenCalledWith(assignmentItem.id);
      });

      // Breadcrumb & activity header
      expect(screen.getByRole('heading', { name: assignmentItem.title })).toBeTruthy();
      expect(screen.getByText('Volver a actividades')).toBeTruthy();

      // Wait for submissions to load
      expect(await screen.findByText('Camila Valenzuela')).toBeTruthy();
      expect(screen.getByText('Matías González')).toBeTruthy();

      // Check status badges
      expect(screen.getByText('Enviada')).toBeTruthy();
      expect(screen.getByText('Revisada')).toBeTruthy();
      expect(screen.getByText('A tiempo')).toBeTruthy();
      expect(screen.getByText('Atrasada')).toBeTruthy();

      // Check KPIs: 2 submitted, 1 pending, 1 reviewed, 1 late, 1 unsubmitted
      expect(screen.getByText('Total entregas')).toBeTruthy();
      expect(screen.getAllByText('Por revisar').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Sin entrega aún')).toBeTruthy();

      // Click "Sin entrega" filter chip to see student 3 (Sofía Morales)
      fireEvent.click(screen.getByRole('button', { name: /sin entrega/i }));

      expect(screen.getByText('Sofía Morales')).toBeTruthy();
      expect(screen.queryByText('Camila Valenzuela')).toBeNull();

      // Click back button
      fireEvent.click(screen.getByRole('button', { name: /volver a actividades/i }));
      expect(onBack).toHaveBeenCalled();
    });

    it('filters students by search query inside the activity view', async () => {
      const listSubmissions = vi.fn().mockResolvedValue(mockSubmissions);
      const api = { listSubmissions } as unknown as AcademicApiClient;

      render(
        <TeacherActivitySubmissionsView
          api={api}
          item={assignmentItem}
          onBack={vi.fn()}
          roster={mockRoster}
        />,
      );

      expect(await screen.findByText('Camila Valenzuela')).toBeTruthy();

      const searchInput = screen.getByLabelText(/buscar estudiante/i);
      fireEvent.change(searchInput, { target: { value: 'Matías' } });

      expect(screen.queryByText('Camila Valenzuela')).toBeNull();
      expect(screen.getByText('Matías González')).toBeTruthy();
    });
  });

  describe('3. TeacherSubmissionQueue Orchestrator Integration', () => {
    it('seamlessly navigates between catalog and activity view', async () => {
      const listSubmissions = vi.fn().mockResolvedValue(mockSubmissions);
      const getTeacherCourseSubjectRoster = vi.fn().mockResolvedValue(mockRoster);
      const api = {
        getTeacherCourseSubjectRoster,
        listSubmissions,
      } as unknown as AcademicApiClient;

      render(
        <TeacherSubmissionQueue
          api={api}
          courseSubjectId="course-subject-1"
          items={[assignmentItem, assessmentItem]}
          units={mockUnits}
        />,
      );

      // Initially in catalog view
      expect(await screen.findByText('Guía 1: Comprensión Lectora')).toBeTruthy();
      expect(screen.getByText('Evaluación Parcial 1: Ensayo Literario')).toBeTruthy();

      // Click "Ver entregas" on Guía 1
      const openBtn = screen.getByRole('button', {
        name: `Ver entregas de ${assignmentItem.title}`,
      });
      fireEvent.click(openBtn);

      // Now in activity detail view
      expect(await screen.findByText('Camila Valenzuela')).toBeTruthy();
      expect(screen.getByRole('button', { name: /volver a actividades/i })).toBeTruthy();

      // Click "Volver a actividades"
      fireEvent.click(screen.getByRole('button', { name: /volver a actividades/i }));

      // Returns to catalog view
      expect(screen.getByText('Bandeja de Entregas y Evaluaciones')).toBeTruthy();
      expect(screen.getByText('Guía 1: Comprensión Lectora')).toBeTruthy();
      expect(screen.getByText('Evaluación Parcial 1: Ensayo Literario')).toBeTruthy();
    });
  });

  describe('4. TeacherSubmissionDetail route changes', () => {
    it('protects unsent comments when leaving through shell navigation', async () => {
      const api = {
        getLearningItem: vi.fn(async () => assignmentItem),
        getSubmission: vi.fn(async () => mockSubmissions[0]!),
        getTeacherCourseSubjectRoster: vi.fn(async () => mockRoster),
        listSubmissions: vi.fn(async () => mockSubmissions),
      } as unknown as AcademicApiClient;
      render(<TeacherSubmissionDetail api={api} submissionId="sub-1" />);
      await screen.findByRole('heading', { name: 'Camila Valenzuela' });
      fireEvent.change(screen.getByLabelText('Comentario para el estudiante'), {
        target: { value: 'Comentario pendiente' },
      });

      const shellLink = document.createElement('a');
      shellLink.href = '/docente';
      document.body.append(shellLink);
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
      const click = new MouseEvent('click', { bubbles: true, cancelable: true });
      const wasNotCanceled = shellLink.dispatchEvent(click);

      expect(confirm).toHaveBeenCalledOnce();
      expect(wasNotCanceled).toBe(false);
      shellLink.remove();
    });

    it('resets student-specific state and reviews the newly selected revision', async () => {
      const nextSubmission: Submission = {
        ...mockSubmissions[1]!,
        status: 'SUBMITTED',
      };
      const submissions = new Map([
        ['sub-1', mockSubmissions[0]!],
        ['sub-2', nextSubmission],
      ]);
      const reviewSubmissionRevision = vi.fn(async () => nextSubmission);
      const api = {
        getLearningItem: vi.fn(async () => assignmentItem),
        getSubmission: vi.fn(async (id: string) => submissions.get(id)!),
        getTeacherCourseSubjectRoster: vi.fn(async () => mockRoster),
        listSubmissions: vi.fn(async () => [mockSubmissions[0]!, nextSubmission]),
        reviewSubmissionRevision,
      } as unknown as AcademicApiClient;

      const { rerender } = render(
        <TeacherSubmissionDetail api={api} submissionId="sub-1" />,
      );
      expect(await screen.findByRole('heading', { name: 'Camila Valenzuela' })).toBeTruthy();
      fireEvent.change(screen.getByLabelText('Comentario para el estudiante'), {
        target: { value: 'Comentario de Camila' },
      });

      rerender(<TeacherSubmissionDetail api={api} submissionId="sub-2" />);
      expect(await screen.findByRole('heading', { name: 'Matías González' })).toBeTruthy();
      expect(
        (screen.getByLabelText('Comentario para el estudiante') as HTMLTextAreaElement).value,
      ).toBe('');

      fireEvent.click(screen.getByRole('button', { name: 'Marcar revisada' }));
      await waitFor(() =>
        expect(reviewSubmissionRevision).toHaveBeenCalledWith('rev-2', {
          action: 'REVIEWED',
          comment: undefined,
        }),
      );
    });
  });
});
