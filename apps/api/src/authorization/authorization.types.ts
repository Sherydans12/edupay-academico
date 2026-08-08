import type { IdentityRole } from '../identity/identity.types';

export enum TenantCapability {
  AccessTenant = 'tenant:access',
  AdministerAcademicStructure = 'academic-structure:administer',
  ManageLearningContent = 'learning-content:manage',
  ViewTenantSubmissions = 'submissions:view-tenant',
}

export const capabilityRoles = Object.freeze({
  [TenantCapability.AccessTenant]: [
    'TENANT_ADMIN',
    'TEACHER',
    'STUDENT',
  ] as const,
  [TenantCapability.AdministerAcademicStructure]: ['TENANT_ADMIN'] as const,
  [TenantCapability.ManageLearningContent]: [
    'TENANT_ADMIN',
    'TEACHER',
  ] as const,
  [TenantCapability.ViewTenantSubmissions]: ['TENANT_ADMIN'] as const,
}) satisfies Readonly<Record<TenantCapability, readonly IdentityRole[]>>;
