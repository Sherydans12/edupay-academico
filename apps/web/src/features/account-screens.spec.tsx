import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IdentitySessionContext } from '@/auth/session-context';
import type { IdentitySessionContextValue } from '@/auth/session-provider';
import { IdentityApiError } from '@/identity/identity-client';
import { ActivationCodeScreen, ForgotPasswordScreen, InvitationActivationScreen, LoginScreen, ResetPasswordScreen } from './account-screens';

const navigation = vi.hoisted(() => ({ pathname: '/login', search: '', push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push, replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const studentSession = { displayName: 'Cuenta EduPay', identityUserId: 'user-1', membershipId: 'membership-1', roles: ['STUDENT'] as const, roleLabel: 'Estudiante', tenantDisplayName: 'Colegio Conquistadores', tenantId: 'tenant-1', workspace: 'student' as const };

function authValue(overrides: Partial<IdentitySessionContextValue> = {}): IdentitySessionContextValue {
  return {
    status: 'unauthenticated', session: null, memberships: [],
    login: vi.fn(async () => studentSession), logout: vi.fn(), refresh: vi.fn(), retryBootstrap: vi.fn(), switchMembership: vi.fn(),
    provisionMembership: vi.fn(), inviteMembership: vi.fn(), createActivationChallenge: vi.fn(),
    ...overrides,
  } as IdentitySessionContextValue;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'https://academico.example.test/api/v1');
  vi.stubEnv('NEXT_PUBLIC_IDENTITY_BASE_URL', 'https://identity.example.test');
});

afterEach(() => {
  cleanup();
  navigation.pathname = '/login'; navigation.search = '';
  navigation.push.mockReset(); navigation.replace.mockReset();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('login', () => {
  it('uses real session login and redirects a student to the student workspace', async () => {
    const auth = authValue();
    render(<IdentitySessionContext.Provider value={auth}><LoginScreen /></IdentitySessionContext.Provider>);
    fireEvent.change(screen.getByLabelText('Usuario institucional o correo verificado'), { target: { value: 'sofia.herrera' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(auth.login).toHaveBeenCalledWith(expect.objectContaining({ identifier: 'sofia.herrera', password: 'secret' })));
    expect(navigation.replace).toHaveBeenCalledWith('/estudiante');
  });

  it('shows the same generic invalid-credential response', async () => {
    const auth = authValue({ login: vi.fn(async () => { throw new IdentityApiError({ code: 'AUTHENTICATION_FAILED', message: 'stable', status: 401 }); }) });
    render(<IdentitySessionContext.Provider value={auth}><LoginScreen /></IdentitySessionContext.Provider>);
    fireEvent.change(screen.getByLabelText('Usuario institucional o correo verificado'), { target: { value: 'unknown' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText(/No pudimos verificar las credenciales/i)).toBeTruthy();
  });

  it('offers bounded membership choices and retries with the selected tenant handle', async () => {
    const choice = { membershipId: 'membership-2', tenantId: 'tenant-2', tenantHandle: 'segundo-colegio', status: 'ACTIVE', roles: ['TEACHER'] };
    const login = vi.fn()
      .mockRejectedValueOnce(new IdentityApiError({ code: 'MEMBERSHIP_SELECTION_REQUIRED', details: [choice], message: 'select', status: 409 }))
      .mockResolvedValueOnce({ ...studentSession, roles: ['TEACHER'], workspace: 'teacher', roleLabel: 'Docente' });
    const auth = authValue({ login });
    render(<IdentitySessionContext.Provider value={auth}><LoginScreen /></IdentitySessionContext.Provider>);
    fireEvent.change(screen.getByLabelText('Usuario institucional o correo verificado'), { target: { value: 'sofia@example.test' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    const tenantChoice = await screen.findByRole('button', { name: /segundo-colegio/i });
    fireEvent.click(tenantChoice);

    await waitFor(() => expect(login).toHaveBeenLastCalledWith(expect.objectContaining({ tenantHandle: 'segundo-colegio' })));
    expect(navigation.replace).toHaveBeenCalledWith('/docente');
  });
});

describe('activation and recovery', () => {
  it('accepts an invitation token, clears secret fields, and removes the token from history', async () => {
    navigation.pathname = '/activate'; navigation.search = 'token=invitation-secret';
    const fetchMock = vi.fn<typeof fetch>(async () => json({ membershipId: 'membership-1', status: 'ACTIVE' }));
    vi.stubGlobal('fetch', fetchMock);
    const replaceState = vi.spyOn(window.history, 'replaceState');
    render(<InvitationActivationScreen />);
    fireEvent.change(screen.getByLabelText(/Nueva contraseña/), { target: { value: 'twelve-chars-password' } });
    fireEvent.change(screen.getByLabelText(/Confirmar contraseña/), { target: { value: 'twelve-chars-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Activar cuenta' }));

    expect(await screen.findByRole('heading', { name: 'Cuenta activada' })).toBeTruthy();
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ invitationToken: 'invitation-secret', password: 'twelve-chars-password' });
    expect(replaceState).toHaveBeenCalledWith(null, '', '/activate');
  });

  it('shows an expired invitation without exposing the provider response', async () => {
    navigation.pathname = '/activate'; navigation.search = 'token=expired-secret';
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: { code: 'ACTIVATION_EXPIRED', message: 'internal lifecycle detail', details: [], requestId: 'req-410' } }, 410)));
    render(<InvitationActivationScreen />);
    fireEvent.change(screen.getByLabelText(/Nueva contraseña/), { target: { value: 'twelve-chars-password' } });
    fireEvent.change(screen.getByLabelText(/Confirmar contraseña/), { target: { value: 'twelve-chars-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Activar cuenta' }));
    expect(await screen.findByText(/expiró o ya fue utilizado/i)).toBeTruthy();
    expect(screen.queryByText(/internal lifecycle detail/i)).toBeNull();
  });

  it('completes no-email activation without persistence or logging', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json({ membershipId: 'membership-1', status: 'ACTIVE' }));
    vi.stubGlobal('fetch', fetchMock);
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    const consoleWrite = vi.spyOn(console, 'log');
    render(<ActivationCodeScreen />);
    fireEvent.change(screen.getByLabelText('Usuario institucional'), { target: { value: 'sofia.herrera' } });
    fireEvent.change(screen.getByLabelText('Código de activación'), { target: { value: 'one-time-secret' } });
    fireEvent.change(screen.getByLabelText(/Nueva contraseña/), { target: { value: 'twelve-chars-password' } });
    fireEvent.change(screen.getByLabelText(/Confirmar contraseña/), { target: { value: 'twelve-chars-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Activar mi cuenta' }));

    expect(await screen.findByRole('heading', { name: 'Cuenta activada' })).toBeTruthy();
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ activationCode: 'one-time-secret', institutionalUsername: 'sofia.herrera' });
    expect(storageWrite).not.toHaveBeenCalled();
    expect(consoleWrite).not.toHaveBeenCalled();
  });

  it('always shows the generic accepted recovery state', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ accepted: true }, 202)));
    render(<ForgotPasswordScreen />);
    fireEvent.change(screen.getByLabelText('Usuario institucional o correo verificado'), { target: { value: 'possibly-unknown' } });
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar recuperación' }));
    expect(await screen.findByRole('heading', { name: 'Solicitud recibida' })).toBeTruthy();
    expect(screen.getByText(/Si la cuenta puede recuperar acceso/i)).toBeTruthy();
  });

  it('confirms a reset token and removes it from the URL', async () => {
    navigation.pathname = '/reset-password'; navigation.search = 'token=reset-secret';
    const fetchMock = vi.fn<typeof fetch>(async () => json({ status: 'PASSWORD_RESET', revokedSessions: 2 }));
    vi.stubGlobal('fetch', fetchMock);
    const replaceState = vi.spyOn(window.history, 'replaceState');
    render(<ResetPasswordScreen />);
    fireEvent.change(screen.getByLabelText(/Nueva contraseña/), { target: { value: 'twelve-chars-password' } });
    fireEvent.change(screen.getByLabelText(/Confirmar contraseña/), { target: { value: 'twelve-chars-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nueva contraseña' }));

    expect(await screen.findByRole('heading', { name: 'Contraseña actualizada' })).toBeTruthy();
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ resetToken: 'reset-secret', password: 'twelve-chars-password' });
    expect(replaceState).toHaveBeenCalledWith(null, '', '/reset-password');
  });

  it('handles an expired reset token with the same safe terminal copy', async () => {
    navigation.pathname = '/reset-password'; navigation.search = 'token=expired-reset';
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: { code: 'ACTIVATION_EXPIRED', message: 'provider detail', details: [], requestId: 'req-reset-410' } }, 410)));
    render(<ResetPasswordScreen />);
    fireEvent.change(screen.getByLabelText(/Nueva contraseña/), { target: { value: 'twelve-chars-password' } });
    fireEvent.change(screen.getByLabelText(/Confirmar contraseña/), { target: { value: 'twelve-chars-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nueva contraseña' }));

    expect(await screen.findByText(/expiró o ya fue utilizado/i)).toBeTruthy();
    expect(screen.queryByText(/provider detail/i)).toBeNull();
  });
});
