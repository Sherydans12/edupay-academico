import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET as developmentJwks } from '@/app/.well-known/jwks.json/route';
import { POST as login } from '@/app/api/v1/auth/login/route';
import { POST as logout } from '@/app/api/v1/auth/logout/route';
import { GET as memberships } from '@/app/api/v1/auth/memberships/route';
import { GET as me } from '@/app/api/v1/auth/me/route';
import { POST as refresh } from '@/app/api/v1/auth/refresh/route';
import { POST as resolveIdentityUser } from '@/app/internal/v1/identity-users/resolve/route';
import { GET as sessionStatus } from '@/app/internal/v1/sessions/[sessionId]/status/route';
import { devIdentityRouteGuard } from './dev-route-guard';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('local identity fixtures', () => {
  it('keeps the local identity routes available in development', () => {
    vi.stubEnv('NODE_ENV', 'development');

    expect(devIdentityRouteGuard()).toBeNull();
  });

  it('returns not found for every local identity route in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const request = (method: 'GET' | 'POST', path: string) =>
      new NextRequest(`http://localhost${path}`, { method });

    const responses = await Promise.all([
      login(request('POST', '/api/v1/auth/login')),
      developmentJwks(),
      refresh(request('POST', '/api/v1/auth/refresh')),
      me(request('GET', '/api/v1/auth/me')),
      memberships(request('GET', '/api/v1/auth/memberships')),
      logout(),
      resolveIdentityUser(
        request('POST', '/internal/v1/identity-users/resolve'),
      ),
      sessionStatus(
        request('GET', '/internal/v1/sessions/demo-session/status'),
        { params: Promise.resolve({ sessionId: 'demo-session' }) },
      ),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.text()).toBe('');
    }
  });
});
