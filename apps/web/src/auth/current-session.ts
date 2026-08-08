export type WorkspaceKind = 'student' | 'teacher' | 'tenant-admin';
export type IdentityRole = 'SYSTEM_ADMIN' | 'TENANT_ADMIN' | 'TEACHER' | 'STUDENT';

/**
 * Read-only view of server-validated Identity and Académico context.
 * This model never contains credentials, refresh tokens, or mutable JWT claims.
 */
export interface TrustedCurrentSession {
  displayName: string;
  identityUserId: string;
  membershipId: string;
  roles: readonly IdentityRole[];
  roleLabel: string;
  tenantDisplayName: string;
  tenantId: string;
  workspace: WorkspaceKind;
}

export interface CurrentSessionConsumerProps {
  session: TrustedCurrentSession;
}

/**
 * Explicit seam for the Identity-owned browser/session boundary.
 * Implementations must be supplied by the host application; this package never
 * reads credentials, refresh tokens, cookies, or mutable JWT claims itself.
 */
export interface IdentitySessionAdapter {
  getCurrentSession(): Promise<TrustedCurrentSession | null>;
  getAccessToken(): Promise<string | null>;
  refreshAccessToken(): Promise<string | null>;
  clearSession?(): Promise<void>;
}

let activeSessionAdapter: IdentitySessionAdapter | null = null;

export function configureIdentitySessionAdapter(
  adapter: IdentitySessionAdapter,
): void {
  activeSessionAdapter = adapter;
}

export function getIdentitySessionAdapter(): IdentitySessionAdapter | null {
  return activeSessionAdapter;
}

export function clearIdentitySessionAdapter(): void {
  activeSessionAdapter = null;
}

export function useTrustedCurrentSession(fallback: TrustedCurrentSession): {
  loading: boolean;
  session: TrustedCurrentSession;
} {
  const [session, setSession] = useState(fallback);
  const [loading, setLoading] = useState(Boolean(activeSessionAdapter));

  useEffect(() => {
    const adapter = activeSessionAdapter;
    if (!adapter) {
      return;
    }
    let mounted = true;
    void adapter.getCurrentSession().then((current) => {
      if (!mounted) return;
      if (current) setSession(current);
      setLoading(false);
    }).catch(() => {
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [fallback]);

  return { loading, session };
}
import { useEffect, useState } from 'react';
