import type { TrustedCurrentSession } from '@/auth/current-session';

/**
 * Fallback shell identities used by the visual foundation and tests when the
 * host has not configured the Identity adapter. They are never sent as API
 * tenant or resource identifiers; real API responses remain the source for
 * academic and learning data.
 */
export const demoSessions = {
  student: {
    displayName: 'Sofía Herrera',
    identityUserId: 'demo-user-student',
    membershipId: 'demo-membership-student',
    roles: ['STUDENT'],
    roleLabel: 'Estudiante · 7º Básico A',
    tenantDisplayName: 'Institución de demostración',
    tenantId: 'demo-tenant',
    workspace: 'student',
  },
  teacher: {
    displayName: 'Camila Rojas',
    identityUserId: 'demo-user-teacher',
    membershipId: 'demo-membership-teacher',
    roles: ['TEACHER'],
    roleLabel: 'Docente',
    tenantDisplayName: 'Institución de demostración',
    tenantId: 'demo-tenant',
    workspace: 'teacher',
  },
  admin: {
    displayName: 'Martín Silva',
    identityUserId: 'demo-user-admin',
    membershipId: 'demo-membership-admin',
    roles: ['TENANT_ADMIN'],
    roleLabel: 'Administración académica',
    tenantDisplayName: 'Institución de demostración',
    tenantId: 'demo-tenant',
    workspace: 'tenant-admin',
  },
} as const satisfies Record<string, TrustedCurrentSession>;
