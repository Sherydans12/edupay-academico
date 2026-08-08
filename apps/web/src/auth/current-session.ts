export type WorkspaceKind = 'student' | 'teacher' | 'tenant-admin';

/**
 * Read-only view of server-validated Identity and Académico context.
 * This model never contains credentials, refresh tokens, or mutable JWT claims.
 */
export interface TrustedCurrentSession {
  displayName: string;
  identityUserId: string;
  membershipId: string;
  roleLabel: string;
  tenantDisplayName: string;
  tenantId: string;
  workspace: WorkspaceKind;
}

export interface CurrentSessionConsumerProps {
  session: TrustedCurrentSession;
}
