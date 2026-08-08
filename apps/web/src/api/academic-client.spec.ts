import { describe, expect, it, vi } from 'vitest';

import { AcademicApiClient, AcademicApiError, UnauthenticatedError } from '@/api/academic-client';

const id = '00000000-0000-4000-8000-000000000001';
const timestamp = '2026-08-08T12:00:00+00:00';
const year = { id, label: '2026', startDate: '2026-03-01', endDate: '2026-12-31', status: 'ACTIVE' as const, createdAt: timestamp, updatedAt: timestamp };

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
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({ error: { code: 'TOKEN_INVALID', message: 'expired', details: [], requestId: 'req-1' } }, 401))
      .mockResolvedValueOnce(response({ items: [year], nextCursor: null }));
    const client = new AcademicApiClient({ baseUrl: 'http://localhost:3001/api/v1', fetchImpl, sessionAdapter: session });

    await expect(client.listAcademicYears()).resolves.toMatchObject({ items: [year] });
    expect(session.refreshAccessToken).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('fails closed when no Identity adapter can provide an access token', async () => {
    const fetchImpl = vi.fn();
    const client = new AcademicApiClient({ baseUrl: 'http://localhost:3001/api/v1', fetchImpl });

    await expect(client.listAcademicYears()).rejects.toBeInstanceOf(UnauthenticatedError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
