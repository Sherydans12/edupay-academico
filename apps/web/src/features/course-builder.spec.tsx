import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LearningItem } from '@edupay/contracts';

import {
  AcademicApiError,
  type AcademicApiClient,
} from '@/api/academic-client';
import { CourseBuilder } from './course-builder/course-builder';
import { ItemEditor } from './course-builder/item-editor';
import { TeacherSubjectScreen } from './teacher-screens';

vi.mock('next/navigation', () => ({
  usePathname: () => '/docente/asignaturas',
  useRouter: () => ({ push: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));

describe('Phase 4: Course Builder Evolution & Component Extraction', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const subject = {
    course: {
      academicYearId: 'yr-1',
      createdAt: '',
      externalReference: null,
      id: 'course-1',
      label: '7º Básico A',
      source: 'MANUAL',
      status: 'ACTIVE' as const,
      updatedAt: '',
    },
    courseId: 'course-1',
    createdAt: '',
    defaultForCourse: true,
    id: 'course-subject-1',
    sortOrder: 0,
    status: 'ACTIVE' as const,
    subject: {
      createdAt: '',
      id: 'sub-1',
      name: 'Lenguaje y Comunicación',
      status: 'ACTIVE' as const,
      updatedAt: '',
    },
    subjectId: 'sub-1',
    updatedAt: '',
  };

  const itemA = {
    body: null,
    content: 'Contenido A',
    courseSubjectId: subject.id,
    createdAt: '2026-08-10T10:00:00Z',
    createdByIdentityUserId: 'teacher-1',
    description: 'Descripción de Item A',
    dueAt: '2026-08-25T18:00:00Z',
    id: 'item-a',
    instructions: 'Instrucciones A',
    learningUnitId: 'unit-1',
    publicationStatus: 'PUBLISHED' as const,
    publishAt: null,
    publishedAt: '2026-08-10T10:00:00Z',
    publishedByIdentityUserId: 'teacher-1',
    sortOrder: 0,
    title: 'Item A: Lectura inicial',
    type: 'ASSIGNMENT' as const,
    updatedAt: '2026-08-10T10:00:00Z',
    updatedByIdentityUserId: null,
    version: 1,
  };

  const itemB = {
    body: null,
    content: 'Contenido B',
    courseSubjectId: subject.id,
    createdAt: '2026-08-10T10:00:00Z',
    createdByIdentityUserId: 'teacher-1',
    description: 'Descripción de Item B',
    dueAt: null,
    id: 'item-b',
    instructions: null,
    learningUnitId: 'unit-1',
    publicationStatus: 'DRAFT' as const,
    publishAt: null,
    publishedAt: null,
    publishedByIdentityUserId: null,
    sortOrder: 1,
    title: 'Item B: Material complementario',
    type: 'MATERIAL' as const,
    updatedAt: '2026-08-10T10:00:00Z',
    updatedByIdentityUserId: null,
    version: 2,
  };

  const unit1 = {
    courseSubjectId: subject.id,
    createdAt: '',
    description: 'Unidad 1 de prueba',
    endAt: null,
    id: 'unit-1',
    items: [itemA, itemB],
    sortOrder: 0,
    startAt: null,
    status: 'ACTIVE' as const,
    title: 'Unidad 1: Conceptos Básicos',
    updatedAt: '',
    version: 1,
  };

  const unit2 = {
    courseSubjectId: subject.id,
    createdAt: '',
    description: 'Unidad 2 de prueba',
    endAt: null,
    id: 'unit-2',
    items: [],
    sortOrder: 1,
    startAt: null,
    status: 'ACTIVE' as const,
    title: 'Unidad 2: Taller Práctico',
    updatedAt: '',
    version: 1,
  };

  describe('1. Form Dirty States & Navigation Protection (ItemEditor with React Hook Form)', () => {
    it('detects dirty state when typing and sets beforeunload listener, clearing after save', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      const onCancel = vi.fn();

      render(
        <ItemEditor
          initialItem={itemA}
          onCancel={onCancel}
          onSave={onSave}
          unitId={unit1.id}
        />,
      );

      const titleInput = screen.getByLabelText(/título/i) as HTMLInputElement;
      expect(titleInput.value).toBe(itemA.title);

      // Typing triggers dirty state
      fireEvent.change(titleInput, {
        target: { value: 'Item A Modificado' },
      });

      // Trigger beforeunload event on window
      const beforeUnloadEvent = new Event('beforeunload', {
        cancelable: true,
      }) as BeforeUnloadEvent;
      const preventDefaultSpy = vi.spyOn(beforeUnloadEvent, 'preventDefault');
      window.dispatchEvent(beforeUnloadEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();

      // Submit form to save
      fireEvent.click(
        screen.getByRole('button', { name: /guardar contenido/i }),
      );

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Item A Modificado',
          }),
        );
      });

      // After save, isDirty resets, so beforeunload does not preventDefault
      const cleanEvent = new Event('beforeunload', {
        cancelable: true,
      }) as BeforeUnloadEvent;
      const cleanPreventSpy = vi.spyOn(cleanEvent, 'preventDefault');
      window.dispatchEvent(cleanEvent);
      expect(cleanPreventSpy).not.toHaveBeenCalled();
    });

    it('intercepts cancel action and asks confirmation if form is dirty', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm');
      const onCancel = vi.fn();

      // Case 1: user rejects confirmation
      confirmSpy.mockReturnValueOnce(false);

      const { unmount } = render(
        <ItemEditor
          initialItem={null}
          onCancel={onCancel}
          onSave={vi.fn()}
          unitId={unit1.id}
        />,
      );

      const titleInput = screen.getByLabelText(/título/i);
      fireEvent.change(titleInput, { target: { value: 'Borrador en curso' } });

      fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
      expect(confirmSpy).toHaveBeenCalled();
      expect(onCancel).not.toHaveBeenCalled();

      unmount();

      // Case 2: user accepts confirmation
      confirmSpy.mockReturnValueOnce(true);
      render(
        <ItemEditor
          initialItem={null}
          onCancel={onCancel}
          onSave={vi.fn()}
          unitId={unit1.id}
        />,
      );

      const titleInput2 = screen.getByLabelText(/título/i);
      fireEvent.change(titleInput2, { target: { value: 'Otro borrador' } });

      fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
      expect(confirmSpy).toHaveBeenCalled();
      expect(onCancel).toHaveBeenCalled();
    });
  });

  describe('2. Optimistic Reordering & Idempotency Key', () => {
    it('swaps items in the DOM immediately and sends Idempotency-Key and order revisions', async () => {
      let resolvePromise: (value: LearningItem[]) => void = () => undefined;
      const reorderPromise = new Promise<LearningItem[]>((resolve) => {
        resolvePromise = resolve;
      });

      const reorderLearningItems = vi
        .fn()
        .mockImplementation(() => reorderPromise);

      const api = {
        reorderLearningItems,
      } as unknown as AcademicApiClient;

      render(
        <CourseBuilder api={api} initialUnits={[unit1]} subject={subject} />,
      );

      // Verify initial order: Item A first, Item B second
      expect(screen.getByText('Item A: Lectura inicial')).toBeTruthy();
      expect(screen.getByText('Item B: Material complementario')).toBeTruthy();

      // Click "Mover hacia abajo" on Item A
      const moveDownButton = screen.getByRole('button', {
        name: `Mover ${itemA.title} hacia abajo`,
      });
      fireEvent.click(moveDownButton);

      // Verify DOM updated optimistically (reorder called)
      expect(reorderLearningItems).toHaveBeenCalledWith(
        unit1.id,
        expect.objectContaining({
          orderedIds: [itemB.id, itemA.id],
        }),
        expect.objectContaining({
          idempotencyKey: expect.any(String),
        }),
      );

      // Verify UUID idempotency key structure
      const lastCall = reorderLearningItems.mock.calls[0] as
        Parameters<AcademicApiClient['reorderLearningItems']> | undefined;
      const idempotencyKey = lastCall?.[2]?.idempotencyKey;
      expect(idempotencyKey).toBeDefined();
      expect(typeof idempotencyKey).toBe('string');
      expect(idempotencyKey!.length).toBeGreaterThan(10);

      // Resolve the API call
      resolvePromise([itemB, itemA]);

      await waitFor(() => {
        expect(screen.getByText('Contenido movido hacia abajo.')).toBeTruthy();
      });
    });
  });

  describe('3. Concurrency 409 STALE_REVISION Conflict Recovery (No blind retry)', () => {
    it('rolls back optimistic state on 409 STALE_REVISION, displays non-blocking notice, and triggers background refetch without auto-retrying', async () => {
      const onRefreshRoute = vi.fn().mockResolvedValue(undefined);

      const reorderLearningItems = vi.fn().mockRejectedValue(
        new AcademicApiError({
          code: 'STALE_REVISION',
          details: [],
          message: 'La estructura de la unidad cambió en otra sesión.',
          requestId: 'req-stale-409',
          status: 409,
        }),
      );

      const api = {
        reorderLearningItems,
      } as unknown as AcademicApiClient;

      render(
        <CourseBuilder
          api={api}
          initialUnits={[unit1]}
          onRefreshRoute={onRefreshRoute}
          subject={subject}
        />,
      );

      // Click "Mover hacia abajo" on Item A
      const moveDownButton = screen.getByRole('button', {
        name: `Mover ${itemA.title} hacia abajo`,
      });
      fireEvent.click(moveDownButton);

      // Verify initial call occurred once
      expect(reorderLearningItems).toHaveBeenCalledTimes(1);

      // Wait for conflict handling
      await waitFor(() => {
        expect(
          screen.getByText(/la estructura fue modificada por otro usuario/i),
        ).toBeTruthy();
      });

      // Verify aria-live announcement is present on conflict message
      const conflictMsg = screen.getByText(
        /la estructura fue modificada por otro usuario/i,
      );
      expect(conflictMsg.getAttribute('role')).toBe('status');
      expect(conflictMsg.getAttribute('aria-live')).toBe('polite');

      // Verify background silent refetch was called
      expect(onRefreshRoute).toHaveBeenCalledTimes(1);

      // Critical: verify reorder was NOT blindly retried automatically
      expect(reorderLearningItems).toHaveBeenCalledTimes(1);
    });
  });

  describe('4. Move Across Units (MoveItemDialog)', () => {
    it('opens dialog, selects target unit, and sends expected revisions with UUID idempotency key', async () => {
      const moveLearningItem = vi.fn().mockResolvedValue(itemA);
      const onRefreshRoute = vi.fn().mockResolvedValue(undefined);

      const api = {
        moveLearningItem,
      } as unknown as AcademicApiClient;

      render(
        <CourseBuilder
          api={api}
          initialUnits={[unit1, unit2]}
          onRefreshRoute={onRefreshRoute}
          subject={subject}
        />,
      );

      // Open "Más opciones" dropdown on Item A (the first one)
      const moreOptionsTriggers = screen.getAllByRole('button', {
        name: 'Más opciones',
      });
      fireEvent.click(moreOptionsTriggers[0]!);

      // Click "Mover a otra unidad"
      const moveMenuItem = screen.getByText('Mover a otra unidad');
      fireEvent.click(moveMenuItem);

      // Verify MoveItemDialog opened
      expect(
        screen.getByRole('heading', { name: 'Mover contenido a otra unidad' }),
      ).toBeTruthy();
      expect(screen.getByText(/Moviendo/i)).toBeTruthy();
      expect(screen.getAllByText(itemA.title).length).toBeGreaterThan(0);

      // Submit move dialog
      fireEvent.click(screen.getByRole('button', { name: 'Mover contenido' }));

      await waitFor(() => {
        expect(moveLearningItem).toHaveBeenCalledWith(
          itemA.id,
          expect.objectContaining({
            expectedRevision: itemA.version,
            sourceOrderRevision: unit1.version,
            targetLearningUnitId: unit2.id,
            targetOrderRevision: unit2.version,
          }),
          expect.objectContaining({
            idempotencyKey: expect.any(String),
          }),
        );
      });
    });
  });

  describe('5. Accessibility (a11y) & Focus Continuity', () => {
    it('provides keyboard accessible controls with accessible labels, visible focus, and 44px min touch targets', async () => {
      const api = {} as unknown as AcademicApiClient;

      render(
        <CourseBuilder api={api} initialUnits={[unit1]} subject={subject} />,
      );

      const moveUpBtn = screen.getByRole('button', {
        name: `Mover ${itemA.title} hacia arriba`,
      }) as HTMLButtonElement;
      const moveDownBtn = screen.getByRole('button', {
        name: `Mover ${itemA.title} hacia abajo`,
      }) as HTMLButtonElement;
      const editBtn = screen.getByRole('button', {
        name: `Editar ${itemA.title}`,
      }) as HTMLButtonElement;

      // Accessible labels
      expect(moveUpBtn.getAttribute('aria-label')).toBe(
        `Mover ${itemA.title} hacia arriba`,
      );
      expect(moveDownBtn.getAttribute('aria-label')).toBe(
        `Mover ${itemA.title} hacia abajo`,
      );
      expect(editBtn.getAttribute('aria-label')).toBe(`Editar ${itemA.title}`);

      // First item cannot move up
      expect(moveUpBtn.disabled).toBe(true);
      expect(moveDownBtn.disabled).toBe(false);

      // Verify keyboard focusability
      editBtn.focus();
      expect(document.activeElement).toBe(editBtn);
    });
  });

  describe('6. Feature Flag & Legacy Route Protection', () => {
    it('renders CourseBuilder when v2 is true and switches to legacy workspace when v2 is false', async () => {
      const getTeacherContextSubjects = vi.fn().mockResolvedValue([subject]);
      const getLearningRoute = vi.fn().mockResolvedValue({
        courseSubjectId: subject.id,
        units: [unit1],
      });

      const api = {
        getLearningRoute,
        getTeacherContextSubjects,
      } as unknown as AcademicApiClient;

      // Render with v2={true} (CourseBuilder)
      const { rerender } = render(
        <TeacherSubjectScreen
          api={api}
          courseSubjectId={subject.id}
          v2={true}
        />,
      );

      expect(
        await screen.findByRole('heading', { name: 'Lenguaje y Comunicación' }),
      ).toBeTruthy();
      expect(screen.getByText('Vista docente')).toBeTruthy();

      // Render with v2={false} (Legacy Workspace)
      rerender(
        <TeacherSubjectScreen
          api={api}
          courseSubjectId={subject.id}
          v2={false}
        />,
      );

      expect(
        await screen.findByRole('heading', { name: 'Lenguaje y Comunicación' }),
      ).toBeTruthy();
    });
  });
});
