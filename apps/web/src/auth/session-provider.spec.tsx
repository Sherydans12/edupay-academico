import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { IdentityApiError, type IdentityBrowserClient } from '@/identity/identity-client';
import { IdentitySessionProvider, useIdentitySession } from './session-provider';

const navigation = vi.hoisted(() => ({ pathname: '/estudiante', push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push, replace: navigation.replace }),
}));

const membership = { membershipId: 'membership-1', tenantId: 'tenant-1', tenantHandle: 'colegio-conquistadores', status: 'ACTIVE' as const, roles: ['STUDENT'] };
const token = { accessToken: 'access-token', tokenType: 'Bearer' as const, expiresIn: 600, sessionId: 'session-1', activeMembership: membership };
const profile = { userId: 'user-1', status: 'ACTIVE' as const, platformRoles: [], session: { id: 'session-1', authenticatedAt: '2026-08-09T12:00:00Z', activeMembership: membership } };

function fakeClient(overrides: Record<string, unknown> = {}): IdentityBrowserClient {
  return {
    refresh: vi.fn(async () => token),
    me: vi.fn(async () => profile),
    memberships: vi.fn(async () => [membership]),
    login: vi.fn(async () => token),
    logout: vi.fn(async () => undefined),
    switchContext: vi.fn(async () => token),
    provisionMembership: vi.fn(),
    inviteMembership: vi.fn(),
    createActivationChallenge: vi.fn(),
    ...overrides,
  } as unknown as IdentityBrowserClient;
}

function Probe() {
  const auth = useIdentitySession();
  return <div>
    <span>{auth?.session?.membershipId ?? 'no-session'}</span>
    <button onClick={() => void Promise.all([auth?.refresh(), auth?.refresh()])}>refresh twice</button>
    <button onClick={() => void auth?.logout()}>logout</button>
    <button onClick={() => void auth?.login({ identifier: 'sofia', password: 'secret', deviceLabel: 'Chrome en Windows' })}>login</button>
    <button onClick={() => void auth?.switchMembership('membership-2')}>switch</button>
  </div>;
}

afterEach(() => {
  cleanup();
  navigation.pathname = '/estudiante';
  navigation.push.mockReset();
  navigation.replace.mockReset();
  vi.restoreAllMocks();
});

describe('IdentitySessionProvider', () => {
  it('blocks protected content until refresh-cookie bootstrap resolves and keeps the token out of browser persistence', async () => {
    let resolveRefresh!: (value: typeof token) => void;
    const refresh = vi.fn(() => new Promise<typeof token>((resolve) => { resolveRefresh = resolve; }));
    const client = fakeClient({ refresh });
    const localStorageWrite = vi.spyOn(Storage.prototype, 'setItem');

    render(<IdentitySessionProvider client={client}><h1>Contenido protegido</h1></IdentitySessionProvider>);
    expect(screen.queryByRole('heading', { name: 'Contenido protegido' })).toBeNull();
    expect(screen.getByLabelText('Restaurando sesión')).toBeTruthy();

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    resolveRefresh(token);
    expect(await screen.findByRole('heading', { name: 'Contenido protegido' })).toBeTruthy();
    expect(localStorageWrite).not.toHaveBeenCalled();
  });

  it('coordinates concurrent refresh requests into one Identity rotation', async () => {
    const client = fakeClient();
    render(<IdentitySessionProvider client={client}><Probe /></IdentitySessionProvider>);
    expect(await screen.findByText('membership-1')).toBeTruthy();
    vi.mocked(client.refresh).mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'refresh twice' }));
    await waitFor(() => expect(client.refresh).toHaveBeenCalledOnce());
  });

  it('clears the memory session and returns to login after real logout', async () => {
    const client = fakeClient();
    render(<IdentitySessionProvider client={client}><Probe /></IdentitySessionProvider>);
    expect(await screen.findByText('membership-1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'logout' }));

    await waitFor(() => expect(client.logout).toHaveBeenCalledWith('access-token'));
    expect(navigation.replace).toHaveBeenCalledWith('/login');
  });

  it('treats an ordinary expired refresh session as unauthenticated without a loop', async () => {
    const refresh = vi.fn(async () => { throw new IdentityApiError({ code: 'TOKEN_INVALID', message: 'expired', status: 401 }); });
    const client = fakeClient({ refresh });
    render(<IdentitySessionProvider client={client}><h1>Privado</h1></IdentitySessionProvider>);

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/login?returnTo=%2Festudiante'));
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.queryByText('Privado')).toBeNull();
  });

  it('consumes login and context-switch replacement tokens and redirects by role', async () => {
    navigation.pathname = '/login';
    const teacherMembership = { ...membership, membershipId: 'membership-2', roles: ['TEACHER'] };
    const client = fakeClient({
      login: vi.fn(async () => ({ ...token, activeMembership: teacherMembership })),
      refresh: vi.fn(async () => { throw new IdentityApiError({ code: 'TOKEN_INVALID', message: 'none', status: 401 }); }),
      switchContext: vi.fn(async () => ({ ...token, accessToken: 'replacement-token', activeMembership: teacherMembership })),
      me: vi.fn(async () => ({ ...profile, session: { ...profile.session, activeMembership: teacherMembership } })),
      memberships: vi.fn(async () => [membership, teacherMembership]),
    });
    render(<IdentitySessionProvider client={client}><Probe /></IdentitySessionProvider>);
    await screen.findByText('no-session');

    fireEvent.click(screen.getByRole('button', { name: 'login' }));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/docente'));
    fireEvent.click(screen.getByRole('button', { name: 'switch' }));
    await waitFor(() => expect(client.switchContext).toHaveBeenCalledWith('access-token', 'membership-2'));
  });
});
