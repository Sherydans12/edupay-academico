import { afterEach, describe, expect, it, vi } from 'vitest';

import { AcademicApiClient } from '@/api/academic-client';
import { IdentityBrowserClient } from './identity-client';

afterEach(() => vi.unstubAllGlobals());

function browserFetch(body: unknown, status = 200) {
  return vi.fn(async function (this: unknown) {
    // Browser fetch rejects a client instance as its receiver; ordinary mocks do not.
    if (this !== undefined && this !== globalThis) {
      throw new TypeError('Illegal invocation');
    }
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });
}

describe('default browser fetch transport', () => {
  it('preserves an unauthenticated refresh response instead of reporting a network error', async () => {
    const fetch = browserFetch(
      {
        error: {
          code: 'TOKEN_INVALID',
          message: 'No session',
          details: [],
          requestId: 'probe-refresh',
        },
      },
      401,
    );
    vi.stubGlobal('fetch', fetch);
    const client = new IdentityBrowserClient({
      baseUrl: 'https://identity.example.test',
    });

    await expect(client.refresh()).rejects.toMatchObject({
      status: 401,
      code: 'TOKEN_INVALID',
      requestId: 'probe-refresh',
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('delivers a successful login through the default browser transport', async () => {
    const token = {
      accessToken: 'synthetic-access-token',
      tokenType: 'Bearer',
      expiresIn: 600,
      sessionId: 'synthetic-session',
      activeMembership: null,
    };
    vi.stubGlobal('fetch', browserFetch(token));
    const client = new IdentityBrowserClient({
      baseUrl: 'https://identity.example.test',
    });

    await expect(
      client.login({
        identifier: 'synthetic-user',
        password: 'synthetic-password',
      }),
    ).resolves.toEqual(token);
  });

  it('retains the working receiver behavior for academic API requests', async () => {
    vi.stubGlobal('fetch', browserFetch({ items: [], nextCursor: null }));
    const client = new AcademicApiClient({
      baseUrl: 'https://academic.example.test/api/v1',
      sessionAdapter: {
        getCurrentSession: async () => null,
        getAccessToken: async () => 'synthetic-access-token',
        refreshAccessToken: async () => null,
        clearSession: async () => undefined,
      },
    });

    await expect(client.listAcademicYears()).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
  });
});
