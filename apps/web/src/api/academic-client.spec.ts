import { describe, expect, it, vi } from 'vitest';

import { AcademicApiClient, AcademicApiError, UnauthenticatedError } from '@/api/academic-client';

const id = '00000000-0000-4000-8000-000000000001';
const timestamp = '2026-08-08T12:00:00+00:00';
const year = { id, label: '2026', startDate: '2026-03-01', endDate: '2026-12-31', status: 'ACTIVE' as const, createdAt: timestamp, updatedAt: timestamp };
const unitId = '00000000-0000-4000-8000-000000000002';
const learningItem = { id: '00000000-0000-4000-8000-000000000003', courseSubjectId: id, learningUnitId: unitId, type: 'ASSIGNMENT' as const, title: 'Entrega', description: null, content: null, instructions: 'Resuelve la actividad.', body: null, sortOrder: 0, publicationStatus: 'DRAFT' as const, publishAt: null, publishedAt: null, publishedByIdentityUserId: null, dueAt: '2026-08-12T20:00:00+00:00', createdByIdentityUserId: 'teacher-1', updatedByIdentityUserId: null, version: 1, createdAt: timestamp, updatedAt: timestamp };
const learningUnit = { id: unitId, courseSubjectId: id, title: 'Unidad', description: 'Descripción', sortOrder: 0, startAt: null, endAt: null, status: 'ACTIVE' as const, version: 1, createdAt: timestamp, updatedAt: timestamp };
const uploadIntentId = '00000000-0000-4000-8000-000000000020';
const storageFile = { id: '00000000-0000-4000-8000-000000000021', originalFilename: 'trabajo.pdf', sizeBytes: 12, declaredMime: 'application/pdf', detectedMime: 'application/pdf', extension: '.pdf', category: 'STUDENT_SUBMISSION' as const, createdAt: timestamp };
const uploadIntent = { id: uploadIntentId, parentType: 'LEARNING_ITEM' as const, parentId: learningItem.id, category: 'STUDENT_SUBMISSION' as const, filename: 'trabajo.pdf', mimeType: 'application/pdf', sizeBytes: 12, status: 'RESERVED' as const, expiresAt: '2026-08-08T12:15:00+00:00', upload: { method: 'POST' as const, path: `/api/v1/file-upload-intents/${uploadIntentId}/content`, fieldName: 'file' as const, maxSizeBytes: 25_000_000 as const } };
const submission = { id: '00000000-0000-4000-8000-000000000022', studentId: id, learningItemId: learningItem.id, status: 'SUBMITTED' as const, createdAt: timestamp, updatedAt: timestamp, revisions: [] };
const notification = { id: '00000000-0000-4000-8000-000000000030', eventId: 'event-assignment-1', type: 'ASSIGNMENT_PUBLISHED' as const, title: 'Nueva actividad de Lenguaje', body: 'La actividad "Reseña literaria" ya está publicada.', targetPath: '/estudiante/asignaturas/lenguaje/items/resena-literaria', createdAt: timestamp, readAt: null };
const student = { id, identityUserId: null, source: 'MANUAL', externalReference: null, firstName: 'Sofía', lastName: 'Herrera', email: null, status: 'ACTIVE' as const, createdAt: timestamp, updatedAt: timestamp };

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const session = {
  getCurrentSession: vi.fn(async () => null),
  getAccessToken: vi.fn(async () => 'access-token'),
  refreshAccessToken: vi.fn(async () => 'refreshed-token'),
  clearSession: vi.fn(async () => undefined),
};

describe('AcademicApiClient', () => {
  it('parses a cursor envelope and sends the Identity access token and request id', async () => {
    let capturedInit: RequestInit | undefined;
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => { void _input; capturedInit = init; return response({ items: [year], nextCursor: null }); });
    const client = new AcademicApiClient({ baseUrl: 'http://localhost:3001/api/v1', fetchImpl, sessionAdapter: session });

    await expect(client.listAcademicYears()).resolves.toMatchObject({ items: [year], nextCursor: null });
    const headers = new Headers(capturedInit?.headers);
    expect(headers.get('authorization')).toBe('Bearer access-token');
    expect(headers.get('x-request-id')).toBeTruthy();
  });

  it('parses the stable error envelope with status and request id', async () => {
    const fetchImpl = vi.fn(async () => response({ error: { code: 'FORBIDDEN', message: 'No autorizado.', details: [{ message: 'role' }], requestId: 'req-123' } }, 403));
    const client = new AcademicApiClient({ baseUrl: 'http://localhost:3001/api/v1', fetchImpl, sessionAdapter: session });

    await expect(client.listAcademicYears()).rejects.toMatchObject({
      code: 'FORBIDDEN', details: [{ message: 'role' }], requestId: 'req-123', status: 403,
    } satisfies Partial<AcademicApiError>);
  });

  it('refreshes once after an expired access token and retries the request', async () => {
    session.refreshAccessToken.mockClear();
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({ error: { code: 'TOKEN_INVALID', message: 'expired', details: [], requestId: 'req-1' } }, 401))
      .mockResolvedValueOnce(response({ items: [year], nextCursor: null }));
    const client = new AcademicApiClient({ baseUrl: 'http://localhost:3001/api/v1', fetchImpl, sessionAdapter: session });

    await expect(client.listAcademicYears()).resolves.toMatchObject({ items: [year] });
    expect(session.refreshAccessToken).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('refreshes but does not blindly replay a non-idempotent mutation', async () => {
    const localSession = { ...session, refreshAccessToken: vi.fn(async () => 'replacement-token') };
    const fetchImpl = vi.fn(async () => response({ error: { code: 'TOKEN_INVALID', message: 'expired', details: [], requestId: 'req-1' } }, 401));
    const client = new AcademicApiClient({ baseUrl: 'http://localhost:3001/api/v1', fetchImpl, sessionAdapter: localSession });

    await expect(client.createStudent({ firstName: 'Sofía', lastName: 'Herrera' })).rejects.toMatchObject({ code: 'AUTH_REFRESHED_RETRY_REQUIRED' });
    expect(localSession.refreshAccessToken).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('uses idempotent PUT identity-link contracts and can retry them once after refresh', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({ error: { code: 'TOKEN_INVALID', message: 'expired', details: [], requestId: 'req-1' } }, 401))
      .mockResolvedValueOnce(response({ ...student, identityUserId: 'identity-user-1' }));
    const localSession = { ...session, refreshAccessToken: vi.fn(async () => 'replacement-token') };
    const client = new AcademicApiClient({ baseUrl: 'http://localhost:3001/api/v1', fetchImpl, sessionAdapter: localSession });

    await expect(client.linkStudentIdentity(id, { identityUserId: 'identity-user-1' })).resolves.toMatchObject({ identityUserId: 'identity-user-1' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ method: 'PUT', body: JSON.stringify({ identityUserId: 'identity-user-1' }) });
  });

  it('fails closed when no Identity adapter can provide an access token', async () => {
    const fetchImpl = vi.fn();
    const client = new AcademicApiClient({ baseUrl: 'http://localhost:3001/api/v1', fetchImpl });

    await expect(client.listAcademicYears()).rejects.toBeInstanceOf(UnauthenticatedError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reads the Learning route using the shared response contract', async () => {
    const fetchImpl = vi.fn(async () => response({ courseSubjectId: id, units: [{ ...learningUnit, items: [learningItem] }] }));
    const client = new AcademicApiClient({ baseUrl: 'http://localhost:3001/api/v1', fetchImpl, sessionAdapter: session });

    await expect(client.getLearningRoute(id)).resolves.toMatchObject({ courseSubjectId: id, units: [{ items: [learningItem] }] });
    expect(fetchImpl).toHaveBeenCalledWith(`http://localhost:3001/api/v1/course-subjects/${id}/learning`, expect.anything());
  });

  it('sends typed Learning mutations through the existing request/session boundary', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response(learningUnit, 201))
      .mockResolvedValueOnce(response({ ...learningItem, publicationStatus: 'SCHEDULED', publishAt: '2099-08-12T20:00:00+00:00' }))
      .mockResolvedValueOnce(response([learningItem]));
    const client = new AcademicApiClient({ baseUrl: 'http://localhost:3001/api/v1', fetchImpl, sessionAdapter: session });

    await client.createLearningUnit({ courseSubjectId: id, title: 'Unidad', sortOrder: 0 });
    await client.scheduleLearningItem(learningItem.id, { confirmSensitiveChange: false, publishAt: '2099-08-12T20:00:00+00:00' });
    await client.reorderLearningItems(unitId, { orderedIds: [learningItem.id] });

    expect(fetchImpl).toHaveBeenNthCalledWith(1, expect.stringContaining('/learning-units'), expect.objectContaining({ method: 'POST' }));
    expect(fetchImpl).toHaveBeenNthCalledWith(2, expect.stringContaining(`/learning-items/${learningItem.id}/schedule`), expect.objectContaining({ method: 'POST' }));
    expect(fetchImpl).toHaveBeenNthCalledWith(3, expect.stringContaining(`/learning-units/${unitId}/items/reorder`), expect.objectContaining({ method: 'POST' }));
  });

  it('uses the returned upload path and sends one multipart file without embedding bytes in JSON', async () => {
    let intentBody = '';
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      intentBody = String(init?.body ?? '');
      return response(uploadIntent, 201);
    });
    const multipartUploadImpl = vi.fn(async (options) => {
      expect(options.url).toBe(`http://localhost:3001${uploadIntent.upload.path}`);
      expect(options.fieldName).toBe('file');
      expect(options.file).toBeInstanceOf(File);
      return { status: 201, body: storageFile };
    });
    const client = new AcademicApiClient({ baseUrl: 'http://localhost:3001/api/v1', fetchImpl, multipartUploadImpl, sessionAdapter: session });
    const file = new File(['%PDF'], 'trabajo.pdf', { type: 'application/pdf' });

    await expect(client.createUploadIntent({ category: 'STUDENT_SUBMISSION', filename: file.name, mimeType: file.type, parentId: learningItem.id, parentType: 'LEARNING_ITEM', sizeBytes: file.size })).resolves.toMatchObject({ id: uploadIntentId });
    await expect(client.completeUploadIntent(uploadIntent, file)).resolves.toMatchObject({ id: storageFile.id });
    expect(intentBody).not.toContain('base64');
    expect(intentBody).not.toContain('%PDF');
    expect(multipartUploadImpl).toHaveBeenCalledOnce();
  });

  it('calls submission, revision, review, and authorized download endpoints', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response(submission, 201))
      .mockResolvedValueOnce(response(submission, 201))
      .mockResolvedValueOnce(response(submission, 201))
      .mockResolvedValueOnce(new Response('private file bytes', { status: 200, headers: { 'Content-Disposition': "attachment; filename*=UTF-8''trabajo.pdf", 'Content-Type': 'application/pdf' } }));
    const client = new AcademicApiClient({ baseUrl: 'http://localhost:3001/api/v1', fetchImpl, sessionAdapter: session });

    await client.submitLearningItem(learningItem.id, { fileObjectIds: [storageFile.id] });
    await client.submitSubmissionRevision(submission.id, { fileObjectIds: [storageFile.id], studentComment: 'Nueva versión' });
    await client.reviewSubmissionRevision('00000000-0000-4000-8000-000000000023', { action: 'CHANGES_REQUESTED', comment: 'Corrige la conclusión.' });
    const downloaded = await client.downloadFile(storageFile.id);

    expect(fetchImpl).toHaveBeenNthCalledWith(1, expect.stringContaining(`/learning-items/${learningItem.id}/submission`), expect.objectContaining({ method: 'POST' }));
    expect(fetchImpl).toHaveBeenNthCalledWith(2, expect.stringContaining(`/submissions/${submission.id}/revisions`), expect.objectContaining({ method: 'POST' }));
    expect(fetchImpl).toHaveBeenNthCalledWith(3, expect.stringContaining('/submission-revisions/00000000-0000-4000-8000-000000000023/reviews'), expect.objectContaining({ method: 'POST' }));
    expect(fetchImpl).toHaveBeenNthCalledWith(4, expect.stringContaining(`/files/${storageFile.id}/download`), expect.objectContaining({ headers: expect.anything() }));
    expect(downloaded.filename).toBe('trabajo.pdf');
    await expect(downloaded.blob.text()).resolves.toContain('private file bytes');
  });

  it('uses the shared notification contracts for count, cursor pagination, and read mutations', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({ count: 2 }))
      .mockResolvedValueOnce(response({ items: [notification], nextCursor: 'opaque-next-cursor' }))
      .mockResolvedValueOnce(response({ ...notification, readAt: timestamp }))
      .mockResolvedValueOnce(response({ updatedCount: 1 }));
    const client = new AcademicApiClient({ baseUrl: 'http://localhost:3001/api/v1', fetchImpl, sessionAdapter: session });

    await expect(client.getUnreadNotificationCount()).resolves.toEqual({ count: 2 });
    await expect(client.listNotifications('opaque-cursor', 20)).resolves.toMatchObject({ items: [notification], nextCursor: 'opaque-next-cursor' });
    await expect(client.markNotificationRead(notification.id)).resolves.toMatchObject({ id: notification.id, readAt: timestamp });
    await expect(client.markAllNotificationsRead()).resolves.toEqual({ updatedCount: 1 });

    expect(fetchImpl).toHaveBeenNthCalledWith(1, 'http://localhost:3001/api/v1/notifications/unread-count', expect.anything());
    expect(fetchImpl).toHaveBeenNthCalledWith(2, 'http://localhost:3001/api/v1/notifications?cursor=opaque-cursor&limit=20', expect.anything());
    expect(fetchImpl).toHaveBeenNthCalledWith(3, `http://localhost:3001/api/v1/notifications/${notification.id}/read`, expect.objectContaining({ method: 'PATCH' }));
    expect(fetchImpl).toHaveBeenNthCalledWith(4, 'http://localhost:3001/api/v1/notifications/read-all', expect.objectContaining({ method: 'POST' }));
  });
});
