'use client';

import { Alert, Button, Skeleton } from '@edupay/ui';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import {
  clearIdentitySessionAdapter,
  configureIdentitySessionAdapter,
  type IdentityRole,
  type IdentitySessionAdapter,
  type TrustedCurrentSession,
  type WorkspaceKind,
} from '@/auth/current-session';
import { IdentitySessionContext } from '@/auth/session-context';
import { getClientEnvironment } from '@/config/environment';
import {
  IdentityApiError,
  IdentityBrowserClient,
  type ActivationChallenge,
  type IdentityMembership,
  type IdentityTokenResponse,
  type InvitationState,
  type ProvisionedMembership,
} from '@/identity/identity-client';

type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error';

export interface IdentitySessionContextValue {
  status: SessionStatus;
  session: TrustedCurrentSession | null;
  memberships: readonly IdentityMembership[];
  login(input: { identifier: string; password: string; tenantHandle?: string; deviceLabel: string }): Promise<TrustedCurrentSession>;
  logout(): Promise<void>;
  refresh(): Promise<string | null>;
  retryBootstrap(): Promise<void>;
  switchMembership(membershipId: string): Promise<TrustedCurrentSession>;
  provisionMembership(input: { institutionalUsername: string; email?: string; role: 'STUDENT' | 'TEACHER' }): Promise<ProvisionedMembership>;
  inviteMembership(membershipId: string): Promise<InvitationState>;
  createActivationChallenge(membershipId: string): Promise<ActivationChallenge>;
}

const publicRoutes = new Set(['/login', '/activate', '/activate-code', '/forgot-password', '/reset-password', '/componentes']);

function roleWorkspace(roles: readonly string[]): { workspace: WorkspaceKind; roleLabel: string } | null {
  if (roles.includes('TENANT_ADMIN')) return { workspace: 'tenant-admin', roleLabel: 'Administración académica' };
  if (roles.includes('TEACHER')) return { workspace: 'teacher', roleLabel: 'Docente' };
  if (roles.includes('STUDENT')) return { workspace: 'student', roleLabel: 'Estudiante' };
  return null;
}

export function destinationForRoles(roles: readonly string[]): string {
  if (roles.includes('TENANT_ADMIN')) return '/administracion';
  if (roles.includes('TEACHER')) return '/docente';
  if (roles.includes('STUDENT')) return '/estudiante';
  return '/login';
}

function displayTenant(handle: string): string {
  return handle.split('-').filter(Boolean).map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`).join(' ');
}

function supportedRoles(roles: readonly string[]): IdentityRole[] {
  return roles.filter((role): role is IdentityRole => ['SYSTEM_ADMIN', 'TENANT_ADMIN', 'TEACHER', 'STUDENT'].includes(role));
}

function trustedSession(response: IdentityTokenResponse, userId: string): TrustedCurrentSession {
  const membership = response.activeMembership;
  const mapped = membership ? roleWorkspace(membership.roles) : null;
  if (!membership || !mapped) {
    throw new IdentityApiError({ code: 'FORBIDDEN', message: 'No academic workspace is available.', status: 403 });
  }
  return {
    displayName: 'Cuenta EduPay',
    identityUserId: userId,
    membershipId: membership.membershipId,
    roles: supportedRoles(membership.roles),
    roleLabel: mapped.roleLabel,
    tenantDisplayName: displayTenant(membership.tenantHandle),
    tenantId: membership.tenantId,
    workspace: mapped.workspace,
  };
}

function isOrdinaryUnauthenticated(error: unknown): boolean {
  return error instanceof IdentityApiError && error.status === 401;
}

export function useIdentitySession(): IdentitySessionContextValue | null {
  return useContext(IdentitySessionContext);
}

export function IdentitySessionProvider({ children, client: suppliedClient }: { children: ReactNode; client?: IdentityBrowserClient }) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [session, setSession] = useState<TrustedCurrentSession | null>(null);
  const [memberships, setMemberships] = useState<IdentityMembership[]>([]);
  const tokenRef = useRef<string | null>(null);
  const expiresAtRef = useRef(0);
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);
  const client = useMemo(() => suppliedClient ?? new IdentityBrowserClient({
    baseUrl: getClientEnvironment().NEXT_PUBLIC_IDENTITY_BASE_URL,
  }), [suppliedClient]);

  const clearMemory = useCallback(() => {
    tokenRef.current = null;
    expiresAtRef.current = 0;
    setSession(null);
    setMemberships([]);
    setStatus('unauthenticated');
  }, []);

  const consumeToken = useCallback(async (response: IdentityTokenResponse): Promise<TrustedCurrentSession> => {
    tokenRef.current = response.accessToken;
    expiresAtRef.current = Date.now() + response.expiresIn * 1_000;
    try {
      const [profile, choices] = await Promise.all([
        client.me(response.accessToken),
        client.memberships(response.accessToken),
      ]);
      const nextSession = trustedSession(response, profile.userId);
      setSession(nextSession);
      setMemberships(choices);
      setStatus('authenticated');
      return nextSession;
    } catch (error) {
      tokenRef.current = null;
      expiresAtRef.current = 0;
      throw error;
    }
  }, [client]);

  const refresh = useCallback(async (): Promise<string | null> => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;
    const operation = (async () => {
      try {
        const response = await client.refresh();
        await consumeToken(response);
        return response.accessToken;
      } catch (error) {
        if (isOrdinaryUnauthenticated(error)) {
          clearMemory();
          return null;
        }
        throw error;
      } finally {
        refreshPromiseRef.current = null;
      }
    })();
    refreshPromiseRef.current = operation;
    return operation;
  }, [clearMemory, client, consumeToken]);

  const retryBootstrap = useCallback(async () => {
    setStatus('loading');
    try {
      await refresh();
    } catch {
      setStatus('error');
    }
  }, [refresh]);

  const adapter = useMemo<IdentitySessionAdapter>(() => ({
    getCurrentSession: async () => session,
    getAccessToken: async () => {
      if (!tokenRef.current) return null;
      if (expiresAtRef.current > Date.now() + 30_000) return tokenRef.current;
      return refresh();
    },
    refreshAccessToken: refresh,
    clearSession: async () => clearMemory(),
  }), [clearMemory, refresh, session]);

  useEffect(() => {
    configureIdentitySessionAdapter(adapter);
    return () => clearIdentitySessionAdapter();
  }, [adapter]);

  useEffect(() => {
    const timer = window.setTimeout(() => void retryBootstrap(), 0);
    return () => window.clearTimeout(timer);
  }, [retryBootstrap]);

  useEffect(() => {
    const isPublic = publicRoutes.has(pathname);
    if (status === 'unauthenticated' && !isPublic) {
      const returnTo = pathname.startsWith('/') ? pathname : '/';
      router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    }
    if (status === 'authenticated' && session && pathname === '/login') {
      router.replace(destinationForRoles(session.roles));
    }
    if (status === 'authenticated' && session) {
      const requiredRole = pathname.startsWith('/administracion') ? 'TENANT_ADMIN'
        : pathname.startsWith('/docente') ? 'TEACHER'
          : pathname.startsWith('/estudiante') ? 'STUDENT'
            : null;
      if (requiredRole && !session.roles.includes(requiredRole)) {
        router.replace(destinationForRoles(session.roles));
      }
    }
  }, [pathname, router, session, status]);

  const login = useCallback(async (input: { identifier: string; password: string; tenantHandle?: string; deviceLabel: string }) => {
    const response = await client.login({
      identifier: input.identifier,
      password: input.password,
      ...(input.tenantHandle ? { tenantHandle: input.tenantHandle } : {}),
      device: { label: input.deviceLabel },
    });
    return consumeToken(response);
  }, [client, consumeToken]);

  const logout = useCallback(async () => {
    const token = tokenRef.current;
    try {
      if (token) await client.logout(token);
    } finally {
      clearMemory();
      router.replace('/login');
    }
  }, [clearMemory, client, router]);

  const switchMembership = useCallback(async (membershipId: string) => {
    const token = tokenRef.current;
    if (!token) throw new IdentityApiError({ code: 'TOKEN_INVALID', message: 'The access token is unavailable.', status: 401 });
    const response = await client.switchContext(token, membershipId);
    return consumeToken(response);
  }, [client, consumeToken]);

  const requireManagementContext = useCallback(() => {
    if (!tokenRef.current || !session || !session.roles.includes('TENANT_ADMIN')) {
      throw new IdentityApiError({ code: 'FORBIDDEN', message: 'Tenant administration is required.', status: 403 });
    }
    return { accessToken: tokenRef.current, tenantId: session.tenantId };
  }, [session]);

  const value = useMemo<IdentitySessionContextValue>(() => ({
    status,
    session,
    memberships,
    login,
    logout,
    refresh,
    retryBootstrap,
    switchMembership,
    provisionMembership: async (input) => {
      const context = requireManagementContext();
      return client.provisionMembership(context.accessToken, context.tenantId, {
        institutionalUsername: input.institutionalUsername,
        ...(input.email ? { email: input.email } : {}),
        roles: [input.role],
      });
    },
    inviteMembership: async (membershipId) => {
      const context = requireManagementContext();
      return client.inviteMembership(context.accessToken, context.tenantId, membershipId);
    },
    createActivationChallenge: async (membershipId) => {
      const context = requireManagementContext();
      return client.createActivationChallenge(context.accessToken, context.tenantId, membershipId);
    },
  }), [client, login, logout, memberships, refresh, requireManagementContext, retryBootstrap, session, status, switchMembership]);

  const isPublic = publicRoutes.has(pathname);
  let content = children;
  if (!isPublic && status === 'loading') {
    content = <main aria-busy="true" aria-label="Restaurando sesión" className="session-gate"><div><Skeleton /><Skeleton /><p>Restaurando tu sesión segura…</p></div></main>;
  } else if (!isPublic && status === 'error') {
    content = <main className="session-gate"><Alert action={<Button onClick={() => void retryBootstrap()} variant="secondary">Reintentar</Button>} title="No pudimos restaurar tu sesión" tone="error">Revisa tu conexión. Tu información académica permanece protegida y aún no se ha mostrado.</Alert></main>;
  } else if (!isPublic && status === 'unauthenticated') {
    content = <main aria-busy="true" aria-label="Redirigiendo al inicio de sesión" className="session-gate"><p>Abriendo el inicio de sesión…</p></main>;
  }

  return <IdentitySessionContext.Provider value={value}>{content}</IdentitySessionContext.Provider>;
}
