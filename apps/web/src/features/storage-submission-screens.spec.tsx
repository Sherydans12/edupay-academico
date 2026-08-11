import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AcademicApiError, type AcademicApiClient } from '@/api/academic-client';
import { StudentAssignmentScreen } from '@/features/student-screens';
import { SubmissionReviewScreen, TeacherReviewsScreen, TeacherSubjectScreen } from '@/features/teacher-screens';

vi.mock('next/navigation', () => ({ usePathname: () => '/estudiante/asignaturas', useRouter: () => ({ push: () => undefined }) }));
afterEach(cleanup);

const subjectId = '00000000-0000-4000-8000-000000000101';
const unitId = '00000000-0000-4000-8000-000000000102';
const itemId = '00000000-0000-4000-8000-000000000103';
const studentId = '00000000-0000-4000-8000-000000000104';
const submissionId = '00000000-0000-4000-8000-000000000105';
const revisionId = '00000000-0000-4000-8000-000000000106';
const fileId = '00000000-0000-4000-8000-000000000107';
const secondFileId = '00000000-0000-4000-8000-000000000108';
const timestamp = '2026-08-08T12:00:00+00:00';

const subject = { id: subjectId, courseId: '00000000-0000-4000-8000-000000000109', subjectId: '00000000-0000-4000-8000-000000000110', defaultForCourse: true, sortOrder: 0, status: 'ACTIVE' as const, course: { id: '00000000-0000-4000-8000-000000000109', academicYearId: '00000000-0000-4000-8000-000000000111', source: 'MANUAL', externalReference: null, label: '7º Básico A', status: 'ACTIVE' as const, createdAt: timestamp, updatedAt: timestamp }, subject: { id: '00000000-0000-4000-8000-000000000110', name: 'Lenguaje y Comunicación', status: 'ACTIVE' as const, createdAt: timestamp, updatedAt: timestamp }, createdAt: timestamp, updatedAt: timestamp };
const item = { id: itemId, courseSubjectId: subjectId, learningUnitId: unitId, type: 'ASSIGNMENT' as const, title: 'Actividad real', description: 'Descripción', content: null, instructions: 'Resuelve la actividad.', body: null, sortOrder: 0, publicationStatus: 'PUBLISHED' as const, publishAt: null, publishedAt: timestamp, publishedByIdentityUserId: 'teacher', dueAt: '2026-08-08T10:00:00+00:00', createdByIdentityUserId: 'teacher', updatedByIdentityUserId: null, createdAt: timestamp, updatedAt: timestamp };
const route = { courseSubjectId: subjectId, units: [{ id: unitId, courseSubjectId: subjectId, title: 'Unidad real', description: 'Descripción', sortOrder: 0, startAt: null, endAt: null, status: 'ACTIVE' as const, createdAt: timestamp, updatedAt: timestamp, items: [item] }] };
const policy = { maxFileSizeBytes: 25_000_000, allowedExtensions: ['.pdf', '.docx'], globalQuotaBytes: 20_000_000_000, tenantQuotaBytes: 20_000_000_000, initialOperationalTimezone: 'America/Santiago' as const };
const file = { id: fileId, originalFilename: 'trabajo.pdf', sizeBytes: 4, declaredMime: 'application/pdf', detectedMime: 'application/pdf', extension: '.pdf', category: 'STUDENT_SUBMISSION' as const, createdAt: timestamp };
const secondFile = { ...file, id: secondFileId, originalFilename: 'anexos.pdf' };
const roster = [{ access: ['COURSE_DEFAULT' as const], student: { id: studentId, identityUserId: 'student-user', source: 'MANUAL' as const, externalReference: null, firstName: 'Emilia', lastName: 'Vargas', email: null, status: 'ACTIVE' as const, createdAt: timestamp, updatedAt: timestamp } }];

function revision(number: number, late = true) {
  return { id: number === 1 ? revisionId : '00000000-0000-4000-8000-000000000109', revisionNumber: number, studentComment: number === 1 ? 'Primera entrega' : 'Corregida', submittedAt: timestamp, effectiveDueAt: '2026-08-08T10:00:00+00:00', isLate: late, createdByIdentityUserId: 'student-user', createdAt: timestamp, files: [file], reviews: [] };
}

function submission(status: 'SUBMITTED' | 'REVIEWED' | 'CHANGES_REQUESTED' = 'SUBMITTED') {
  return { id: submissionId, studentId, learningItemId: itemId, status, createdAt: timestamp, updatedAt: timestamp, revisions: [revision(1)] };
}

function client(overrides: Partial<AcademicApiClient>): AcademicApiClient {
  return overrides as AcademicApiClient;
}

describe('student storage and submission workflow', () => {
  it('uploads multiple files independently before the first submission and renders server late state/history', async () => {
    const createUploadIntent = vi.fn(async (input) => ({ id: `${fileId}-${input.filename}`, parentType: 'LEARNING_ITEM' as const, parentId: itemId, category: 'STUDENT_SUBMISSION' as const, filename: input.filename, mimeType: input.mimeType, sizeBytes: input.sizeBytes, status: 'RESERVED' as const, expiresAt: '2099-08-08T12:15:00+00:00', upload: { method: 'POST' as const, path: `/api/v1/file-upload-intents/${fileId}/content`, fieldName: 'file' as const, maxSizeBytes: 25_000_000 as const } }));
    const completeUploadIntent = vi.fn(async (_intent, selected: File) => selected.name === 'trabajo.pdf' ? file : secondFile);
    const submitLearningItem = vi.fn(async () => submission());
    const downloadFile = vi.fn(async () => ({ blob: new Blob(['private']), filename: 'trabajo.pdf' }));
    const api = client({ getStudentContextSubjects: vi.fn(async () => [subject]), getLearningItem: vi.fn(async () => item), getOwnSubmission: vi.fn(async () => { throw new AcademicApiError({ code: 'NOT_FOUND', details: [], message: 'not found', requestId: 'req', status: 404 }); }), getStoragePolicy: vi.fn(async () => policy), createUploadIntent, completeUploadIntent, submitLearningItem, downloadFile });
    render(<StudentAssignmentScreen api={api} courseSubjectId={subjectId} learningItemId={itemId} />);

    expect(await screen.findByRole('heading', { name: 'Tu entrega' })).toBeTruthy();
    const input = screen.getByLabelText('Selecciona tus archivos');
    fireEvent.change(input, { target: { files: [new File(['pdf'], 'trabajo.pdf', { type: 'application/pdf' }), new File(['pdf'], 'anexos.pdf', { type: 'application/pdf' })] } });
    fireEvent.change(screen.getByLabelText('Comentario opcional'), { target: { value: 'Revisa la introducción.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar trabajo' }));

    await waitFor(() => expect(submitLearningItem).toHaveBeenCalledWith(itemId, { fileObjectIds: [fileId, secondFileId], studentComment: 'Revisa la introducción.' }));
    expect(createUploadIntent).toHaveBeenCalledTimes(2);
    expect(completeUploadIntent).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Enviada con atraso')).toBeTruthy();
    expect(screen.getByText('Revisión 1')).toBeTruthy();
    expect(screen.getAllByText(/plazo efectivo/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Descargar trabajo.pdf' }));
    await waitFor(() => expect(downloadFile).toHaveBeenCalledWith(fileId));
  });

  it('shows an individual upload failure and retries only the failed file', async () => {
    const createUploadIntent = vi.fn(async (input) => ({ id: `${fileId}-${input.filename}-${createUploadIntent.mock.calls.length}`, parentType: 'LEARNING_ITEM' as const, parentId: itemId, category: 'STUDENT_SUBMISSION' as const, filename: input.filename, mimeType: input.mimeType, sizeBytes: input.sizeBytes, status: 'RESERVED' as const, expiresAt: '2099-08-08T12:15:00+00:00', upload: { method: 'POST' as const, path: `/api/v1/file-upload-intents/${fileId}/content`, fieldName: 'file' as const, maxSizeBytes: 25_000_000 as const } }));
    const completeUploadIntent = vi.fn()
      .mockResolvedValueOnce(file)
      .mockRejectedValueOnce(new AcademicApiError({ code: 'UPLOAD_INTENT_EXPIRED', details: [], message: 'expired', requestId: 'req-expired', status: 410 }))
      .mockResolvedValueOnce(secondFile);
    const submitLearningItem = vi.fn(async () => submission());
    const api = client({ getStudentContextSubjects: vi.fn(async () => [subject]), getLearningItem: vi.fn(async () => item), getOwnSubmission: vi.fn(async () => { throw new AcademicApiError({ code: 'NOT_FOUND', details: [], message: 'not found', requestId: 'req', status: 404 }); }), getStoragePolicy: vi.fn(async () => policy), createUploadIntent, completeUploadIntent, submitLearningItem });
    render(<StudentAssignmentScreen api={api} courseSubjectId={subjectId} learningItemId={itemId} />);
    await screen.findByRole('heading', { name: 'Tu entrega' });
    fireEvent.change(screen.getByLabelText('Selecciona tus archivos'), { target: { files: [new File(['pdf'], 'trabajo.pdf', { type: 'application/pdf' }), new File(['pdf'], 'anexos.pdf', { type: 'application/pdf' })] } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar trabajo' }));
    expect(await screen.findByRole('button', { name: 'Reintentar anexos.pdf' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar anexos.pdf' }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Enviar trabajo' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar trabajo' }));
    await waitFor(() => expect(submitLearningItem).toHaveBeenCalled());
    expect(completeUploadIntent).toHaveBeenCalledTimes(3);
    expect(completeUploadIntent.mock.calls[2]?.[1]).toBeInstanceOf(File);
  });

  it('resubmits only after CHANGES_REQUESTED and blocks free resubmission after REVIEWED', async () => {
    const changes = submission('CHANGES_REQUESTED');
    const submitSubmissionRevision = vi.fn(async () => ({ ...changes, revisions: [revision(1), revision(2, false)] }));
    const api = client({ getStudentContextSubjects: vi.fn(async () => [subject]), getLearningItem: vi.fn(async () => item), getOwnSubmission: vi.fn(async () => changes), getStoragePolicy: vi.fn(async () => policy), createUploadIntent: vi.fn(async () => ({ id: fileId, parentType: 'LEARNING_ITEM' as const, parentId: itemId, category: 'STUDENT_SUBMISSION' as const, filename: 'trabajo.pdf', mimeType: 'application/pdf', sizeBytes: 3, status: 'RESERVED' as const, expiresAt: '2099-08-08T12:15:00+00:00', upload: { method: 'POST' as const, path: `/api/v1/file-upload-intents/${fileId}/content`, fieldName: 'file' as const, maxSizeBytes: 25_000_000 as const } })), completeUploadIntent: vi.fn(async () => file), submitSubmissionRevision });
    render(<StudentAssignmentScreen api={api} courseSubjectId={subjectId} learningItemId={itemId} />);
    expect(await screen.findByText('Cambios solicitados')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Selecciona tus archivos'), { target: { files: [new File(['pdf'], 'trabajo.pdf', { type: 'application/pdf' })] } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar nueva revisión' }));
    await waitFor(() => expect(submitSubmissionRevision).toHaveBeenCalledWith(submissionId, expect.objectContaining({ fileObjectIds: [fileId] })));
    expect(screen.getByText('Revisión 2')).toBeTruthy();

    cleanup();
    render(<StudentAssignmentScreen api={client({ getStudentContextSubjects: vi.fn(async () => [subject]), getLearningItem: vi.fn(async () => item), getOwnSubmission: vi.fn(async () => submission('REVIEWED')), getStoragePolicy: vi.fn(async () => policy) })} courseSubjectId={subjectId} learningItemId={itemId} />);
    expect(await screen.findByText('Revisión completada')).toBeTruthy();
    expect(screen.queryByLabelText('Selecciona tus archivos')).toBeNull();
  });
});

describe('teacher review and attachment workflow', () => {
  it('shows the authorized submission list with student, revision, late state, and review status', async () => {
    const api = client({ getTeacherContextSubjects: vi.fn(async () => [subject]), getLearningRoute: vi.fn(async () => route), getTeacherCourseSubjectRoster: vi.fn(async () => roster), listSubmissions: vi.fn(async () => [submission()]) });
    render(<TeacherReviewsScreen api={api} />);
    expect(await screen.findByRole('heading', { name: 'Revisiones' })).toBeTruthy();
    expect(await screen.findByText('Emilia Vargas')).toBeTruthy();
    expect(screen.getByText('Atrasada')).toBeTruthy();
    expect(screen.getByText('Enviada')).toBeTruthy();
  });

  it('supports comment, reviewed, changes-requested actions and authorized file download', async () => {
    const reviewSubmissionRevision = vi.fn(async (_revisionId, input) => ({ ...submission(input.action === 'REVIEWED' ? 'REVIEWED' : input.action === 'CHANGES_REQUESTED' ? 'CHANGES_REQUESTED' : 'SUBMITTED'), revisions: [{ ...revision(1), reviews: [{ id: '00000000-0000-4000-8000-000000000112', action: input.action, comment: input.comment ?? null, reviewerIdentityUserId: 'teacher-user', createdAt: timestamp }] }] }));
    const downloadFile = vi.fn(async () => ({ blob: new Blob(['private']), filename: 'trabajo.pdf' }));
    const api = client({ getSubmission: vi.fn(async () => submission()), getLearningItem: vi.fn(async () => item), getTeacherCourseSubjectRoster: vi.fn(async () => roster), reviewSubmissionRevision, downloadFile });
    render(<SubmissionReviewScreen api={api} submissionId={submissionId} />);
    expect(await screen.findByRole('heading', { name: 'Historial completo' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Comentario para el estudiante'), { target: { value: 'Corrige la conclusión.' } });
    fireEvent.click(screen.getByRole('button', { name: /comentar/i }));
    await waitFor(() => expect(reviewSubmissionRevision).toHaveBeenCalledWith(revisionId, { action: 'COMMENTED', comment: 'Corrige la conclusión.' }));
    fireEvent.click(screen.getByRole('button', { name: /solicitar cambios/i }));
    await waitFor(() => expect(reviewSubmissionRevision).toHaveBeenCalledWith(revisionId, { action: 'CHANGES_REQUESTED', comment: undefined }));

    cleanup();
    render(<SubmissionReviewScreen api={client({ getSubmission: vi.fn(async () => submission()), getLearningItem: vi.fn(async () => item), getTeacherCourseSubjectRoster: vi.fn(async () => roster), reviewSubmissionRevision, downloadFile })} submissionId={submissionId} />);
    await screen.findByRole('heading', { name: 'Historial completo' });
    fireEvent.click(screen.getByRole('button', { name: /marcar revisada/i }));
    await waitFor(() => expect(reviewSubmissionRevision).toHaveBeenCalledWith(revisionId, { action: 'REVIEWED', comment: undefined }));
    fireEvent.click(screen.getByRole('button', { name: 'Descargar trabajo.pdf' }));
    await waitFor(() => expect(downloadFile).toHaveBeenCalledWith(fileId));
  });

  it('uploads learning attachments with the item category', async () => {
    const createUploadIntent = vi.fn(async (input) => ({ id: fileId, parentType: 'LEARNING_ITEM' as const, parentId: itemId, category: input.category, filename: input.filename, mimeType: input.mimeType, sizeBytes: input.sizeBytes, status: 'RESERVED' as const, expiresAt: '2099-08-08T12:15:00+00:00', upload: { method: 'POST' as const, path: `/api/v1/file-upload-intents/${fileId}/content`, fieldName: 'file' as const, maxSizeBytes: 25_000_000 as const } }));
    const completeUploadIntent = vi.fn(async () => file);
    const api = client({ getTeacherContextSubjects: vi.fn(async () => [subject]), getLearningRoute: vi.fn(async () => route), listLearningAttachments: vi.fn(async () => []), getStoragePolicy: vi.fn(async () => policy), getStorageUsage: vi.fn(async () => ({ tenantId: 'tenant-a', quotaBytes: 20, usedBytes: 10, reservedBytes: 0, availableBytes: 10, usagePercentage: 50, allocationPercentage: 50, remainingPercentage: 50, state: 'NORMAL' as const, fileCount: 1, blobCount: 1, byCategory: [] })), createUploadIntent, completeUploadIntent });
    render(<TeacherSubjectScreen api={api} courseSubjectId={subjectId} />);
    await screen.findByRole('heading', { name: 'Ruta de aprendizaje' });
    fireEvent.click(screen.getByRole('button', { name: `Gestionar archivos de ${item.title}` }));
    const input = await screen.findByLabelText('Selecciona tus archivos');
    fireEvent.change(input, { target: { files: [new File(['pdf'], 'guia.pdf', { type: 'application/pdf' })] } });
    fireEvent.click(screen.getByRole('button', { name: 'Subir archivos' }));
    await waitFor(() => expect(createUploadIntent).toHaveBeenCalledWith(expect.objectContaining({ category: 'ASSIGNMENT_SOURCE', parentType: 'LEARNING_ITEM', parentId: itemId, filename: 'guia.pdf' })));
    expect(completeUploadIntent).toHaveBeenCalledTimes(1);
  });

  it('blocks new uploads at full quota while preserving download access', async () => {
    const createUploadIntent = vi.fn(async (input) => ({ id: fileId, parentType: 'LEARNING_ITEM' as const, parentId: itemId, category: input.category, filename: input.filename, mimeType: input.mimeType, sizeBytes: input.sizeBytes, status: 'RESERVED' as const, expiresAt: '2099-08-08T12:15:00+00:00', upload: { method: 'POST' as const, path: `/api/v1/file-upload-intents/${fileId}/content`, fieldName: 'file' as const, maxSizeBytes: 25_000_000 as const } }));
    const downloadFile = vi.fn(async () => ({ blob: new Blob(['private']), filename: 'trabajo.pdf' }));
    const api = client({ getTeacherContextSubjects: vi.fn(async () => [subject]), getLearningRoute: vi.fn(async () => route), listLearningAttachments: vi.fn(async () => [file]), getStoragePolicy: vi.fn(async () => policy), getStorageUsage: vi.fn(async () => ({ tenantId: 'tenant-a', quotaBytes: 20, usedBytes: 20, reservedBytes: 0, availableBytes: 0, usagePercentage: 100, allocationPercentage: 100, remainingPercentage: 0, state: 'FULL' as const, fileCount: 1, blobCount: 1, byCategory: [] })), createUploadIntent, completeUploadIntent: vi.fn(async () => file), downloadFile });
    render(<TeacherSubjectScreen api={api} courseSubjectId={subjectId} />);
    await screen.findByRole('heading', { name: 'Ruta de aprendizaje' });
    fireEvent.click(screen.getByRole('button', { name: `Gestionar archivos de ${item.title}` }));
    expect(await screen.findByText('Almacenamiento lleno')).toBeTruthy();
    expect(screen.getByText(/no se pueden subir archivos nuevos/i)).toBeTruthy();
    const input = screen.getByLabelText('Selecciona tus archivos');
    expect((input as HTMLInputElement).disabled).toBe(true);
    expect((screen.queryByRole('button', { name: 'Subir archivos' }) as HTMLButtonElement | null)?.disabled).toBe(true);
    expect(createUploadIntent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Descargar trabajo.pdf' }));
    await waitFor(() => expect(downloadFile).toHaveBeenCalledWith(fileId));
  });
});
