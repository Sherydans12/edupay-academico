import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AcademicApiError, type AcademicApiClient } from '@/api/academic-client';
import { StudentAssignmentScreen, StudentSubjectScreen } from '@/features/student-screens';
import { TeacherSubjectScreen } from '@/features/teacher-screens';

vi.mock('next/navigation', () => ({ usePathname: () => '/estudiante/asignaturas', useRouter: () => ({ push: () => undefined }) }));

afterEach(cleanup);

const subjectId = '00000000-0000-4000-8000-000000000001';
const unitId = '00000000-0000-4000-8000-000000000002';
const timestamp = '2026-08-08T12:00:00+00:00';
const subject = { id: subjectId, courseId: '00000000-0000-4000-8000-000000000003', subjectId: '00000000-0000-4000-8000-000000000004', defaultForCourse: true, sortOrder: 0, status: 'ACTIVE' as const, course: { id: '00000000-0000-4000-8000-000000000003', academicYearId: '00000000-0000-4000-8000-000000000005', source: 'MANUAL', externalReference: null, label: '7º Básico A', status: 'ACTIVE' as const, createdAt: timestamp, updatedAt: timestamp }, subject: { id: '00000000-0000-4000-8000-000000000004', name: 'Lenguaje y Comunicación', status: 'ACTIVE' as const, createdAt: timestamp, updatedAt: timestamp }, createdAt: timestamp, updatedAt: timestamp };

function item(id: string, title: string, publicationStatus: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED', type: 'MATERIAL' | 'ASSIGNMENT' = 'MATERIAL') {
  return { id, courseSubjectId: subjectId, learningUnitId: unitId, type, title, description: `${title} descripción`, content: type === 'MATERIAL' ? 'Contenido real.' : null, instructions: type === 'ASSIGNMENT' ? 'Instrucciones reales.' : null, body: null, sortOrder: 0, publicationStatus, publishAt: publicationStatus === 'SCHEDULED' ? '2099-08-12T20:00:00+00:00' : null, publishedAt: publicationStatus === 'PUBLISHED' ? timestamp : null, publishedByIdentityUserId: publicationStatus === 'PUBLISHED' ? 'teacher-1' : null, dueAt: type === 'ASSIGNMENT' ? '2026-08-12T20:00:00+00:00' : null, createdByIdentityUserId: 'teacher-1', updatedByIdentityUserId: null, version: 1, createdAt: timestamp, updatedAt: timestamp };
}

const visibleMaterial = item('00000000-0000-4000-8000-000000000010', 'Material visible', 'PUBLISHED');
const futureItem = item('00000000-0000-4000-8000-000000000011', 'Programado futuro', 'SCHEDULED');
const draftItem = item('00000000-0000-4000-8000-000000000012', 'Borrador privado', 'DRAFT');
const assignment = item('00000000-0000-4000-8000-000000000013', 'Actividad real', 'PUBLISHED', 'ASSIGNMENT');
const route = { courseSubjectId: subjectId, units: [{ id: unitId, courseSubjectId: subjectId, title: 'Unidad real', description: 'Descripción de unidad', sortOrder: 0, startAt: null, endAt: null, status: 'ACTIVE' as const, version: 1, createdAt: timestamp, updatedAt: timestamp, items: [visibleMaterial, futureItem, draftItem, assignment] }] };

function api(overrides: Partial<AcademicApiClient>): AcademicApiClient {
  return overrides as AcademicApiClient;
}

describe('real Learning screens', () => {
  it('renders the student hierarchy and hides draft and future scheduled items defensively', async () => {
    render(<StudentSubjectScreen api={api({ getStudentContextSubjects: vi.fn(async () => [subject]), getLearningRoute: vi.fn(async () => route) })} courseSubjectId={subjectId} />);

    expect(await screen.findByRole('heading', { name: 'Unidad real' })).toBeTruthy();
    expect(screen.getByText('Material visible')).toBeTruthy();
    expect(screen.getByText('Actividad real')).toBeTruthy();
    expect(screen.queryByText('Programado futuro')).toBeNull();
    expect(screen.queryByText('Borrador privado')).toBeNull();
  });

  it('renders actual item detail with the connected submission workflow', async () => {
    render(<StudentAssignmentScreen api={api({ getStudentContextSubjects: vi.fn(async () => [subject]), getLearningItem: vi.fn(async () => assignment) })} courseSubjectId={subjectId} learningItemId={assignment.id} />);

    expect(await screen.findByRole('heading', { name: 'Actividad real' })).toBeTruthy();
    expect(screen.getByText('Instrucciones reales.')).toBeTruthy();
    expect(screen.getAllByText(/^Vence 12-08-2026/).length).toBeGreaterThan(0);
    expect(await screen.findByRole('heading', { name: 'Tu entrega' })).toBeTruthy();
    expect(screen.queryByText(/aún no conectado/i)).toBeNull();
    expect((screen.getByRole('button', { name: /enviar trabajo/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('supports typed authoring, publication actions, and accessible item reorder', async () => {
    const second = { ...visibleMaterial, id: '00000000-0000-4000-8000-000000000014', title: 'Segundo material', sortOrder: 1 };
    const teacherRoute = { ...route, units: [{ ...route.units[0]!, items: [visibleMaterial, second] }] };
    const reorderLearningItems = vi.fn(async () => teacherRoute.units[0]!.items);
    const createLearningItem = vi.fn(async () => assignment);
    const client = api({ getTeacherContextSubjects: vi.fn(async () => [subject]), getLearningRoute: vi.fn(async () => teacherRoute), reorderLearningItems, createLearningItem });
    render(<TeacherSubjectScreen api={client} courseSubjectId={subjectId} />);

    expect(await screen.findByRole('heading', { name: 'Ruta de aprendizaje' })).toBeTruthy();
    expect(screen.getAllByText('Publicado').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /mover material visible hacia abajo/i }));
    expect(reorderLearningItems).toHaveBeenCalledWith(unitId, { orderedIds: [second.id, visibleMaterial.id] });
    await waitFor(() => expect(client.getLearningRoute).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: /agregar contenido a unidad real/i }));
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'ASSIGNMENT' } });
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Nueva actividad' } });
    fireEvent.change(screen.getByLabelText('Instrucciones'), { target: { value: 'Entrega el documento.' } });
    fireEvent.change(screen.getByLabelText('Fecha de entrega'), { target: { value: '2026-08-20T18:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear contenido' }));
    await waitFor(() => expect(createLearningItem).toHaveBeenCalledWith(unitId, expect.objectContaining({ type: 'ASSIGNMENT', title: 'Nueva actividad', instructions: 'Entrega el documento.', dueAt: '2026-08-20T22:00:00.000Z' })));
  });

  it('creates units and renders publication states with schedule and archive actions', async () => {
    const createLearningUnit = vi.fn(async () => route.units[0]!);
    const publishLearningItem = vi.fn(async () => draftItem);
    const scheduleLearningItem = vi.fn(async () => futureItem);
    const archiveLearningItem = vi.fn(async () => draftItem);
    const publicationRoute = { ...route, units: [{ ...route.units[0]!, items: [draftItem, futureItem] }] };
    const client = api({
      getTeacherContextSubjects: vi.fn(async () => [subject]),
      getLearningRoute: vi.fn(async () => publicationRoute),
      createLearningUnit,
      publishLearningItem,
      scheduleLearningItem,
      archiveLearningItem,
    });
    render(<TeacherSubjectScreen api={client} courseSubjectId={subjectId} />);

    expect(await screen.findByRole('heading', { name: 'Ruta de aprendizaje' })).toBeTruthy();
    expect(screen.getByText('Borrador')).toBeTruthy();
    expect(screen.getByText('Programado')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Nueva unidad' }));
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Unidad nueva' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear unidad' }));
    await waitFor(() => expect(createLearningUnit).toHaveBeenCalledWith(expect.objectContaining({ courseSubjectId: subjectId, title: 'Unidad nueva', sortOrder: 0 })));

    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    await waitFor(() => expect(publishLearningItem).toHaveBeenCalledWith(draftItem.id));

    fireEvent.click(screen.getByRole('button', { name: 'Programar' }));
    fireEvent.change(screen.getByLabelText('Programar publicación'), { target: { value: '2099-08-20T18:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar programación' }));
    await waitFor(() => expect(scheduleLearningItem).toHaveBeenCalledWith(draftItem.id, expect.objectContaining({ confirmSensitiveChange: false, publishAt: expect.any(String) })));

    fireEvent.click(screen.getByRole('button', { name: 'Archivar Borrador privado' }));
    await waitFor(() => expect(archiveLearningItem).toHaveBeenCalledWith(draftItem.id));
  });

  it('requires explicit confirmation when the API rejects a sensitive published edit', async () => {
    const updateLearningItem = vi.fn()
      .mockRejectedValueOnce(new AcademicApiError({ code: 'CONFIRMATION_REQUIRED', details: [], message: 'Published content changes require explicit confirmation.', requestId: 'req-sensitive', status: 409 }))
      .mockResolvedValueOnce(assignment);
    const client = api({ getTeacherContextSubjects: vi.fn(async () => [subject]), getLearningRoute: vi.fn(async () => ({ ...route, units: [{ ...route.units[0]!, items: [assignment] }] })), updateLearningItem });
    render(<TeacherSubjectScreen api={client} courseSubjectId={subjectId} />);

    await screen.findByRole('heading', { name: 'Ruta de aprendizaje' });
    fireEvent.click(screen.getByRole('button', { name: /editar actividad real/i }));
    fireEvent.change(screen.getByLabelText('Instrucciones'), { target: { value: 'Cambiar instrucciones.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar contenido' }));

    expect(await screen.findByRole('heading', { name: 'Confirmar cambio sensible' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cambio' }));
    expect(updateLearningItem).toHaveBeenLastCalledWith(assignment.id, expect.objectContaining({ confirmSensitiveChange: true }));
  });
});
