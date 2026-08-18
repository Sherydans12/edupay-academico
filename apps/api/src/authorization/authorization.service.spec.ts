import { describe, expect, it, vi } from 'vitest';

import type { IdentityRole } from '../identity/identity.types';
import { TrustedIdentityPrincipal } from '../identity/identity.types';
import { TenantQueryScope } from '../persistence/tenant-query-scope';
import { TrustedTenantJobContext } from '../tenant/trusted-tenant-job-context';
import { TrustedTenantContext } from '../tenant/trusted-tenant-context';
import { AuthorizationService } from './authorization.service';
import { TenantCapability } from './authorization.types';
import type { ResourcePolicy } from './resource-policy';

function principal(
  roles: IdentityRole[] = ['TEACHER'],
): TrustedIdentityPrincipal {
  return TrustedIdentityPrincipal.fromValidatedAccessTokenClaims({
    aud: 'edupay-academico-api',
    exp: 1_786_200_600,
    iat: 1_786_200_000,
    iss: 'https://identity.edupay.example',
    jti: 'access-a',
    membership_id: 'membership-a',
    nbf: 1_786_200_000,
    roles,
    sid: 'session-a',
    sub: 'user-a',
    tenant_id: 'tenant-a',
  });
}

describe('AuthorizationService', () => {
  const authorization = new AuthorizationService();

  it('allows only mapped role capabilities', () => {
    const admin = principal(['TENANT_ADMIN']);
    const adminContext = TrustedTenantContext.fromPrincipal(admin);

    expect(() =>
      authorization.requireCapability(
        admin,
        adminContext,
        TenantCapability.AdministerAcademicStructure,
      ),
    ).not.toThrow();

    const teacher = principal(['TEACHER']);
    const context = TrustedTenantContext.fromPrincipal(teacher);

    expect(() =>
      authorization.requireCapability(
        teacher,
        context,
        TenantCapability.AccessTenant,
      ),
    ).not.toThrow();
    expect(() =>
      authorization.requireCapability(
        teacher,
        context,
        TenantCapability.AdministerAcademicStructure,
      ),
    ).toThrow(/not authorized/);

    const student = principal(['STUDENT']);
    const studentContext = TrustedTenantContext.fromPrincipal(student);

    expect(() =>
      authorization.requireCapability(
        student,
        studentContext,
        TenantCapability.AccessTenant,
      ),
    ).not.toThrow();
    expect(() =>
      authorization.requireCapability(
        student,
        studentContext,
        TenantCapability.AdministerAcademicStructure,
      ),
    ).toThrow(/not authorized/);
  });

  it('denies an unknown capability by default', () => {
    const actor = principal(['TENANT_ADMIN']);
    const context = TrustedTenantContext.fromPrincipal(actor);

    expect(() =>
      authorization.requireCapability(
        actor,
        context,
        'unknown:capability' as TenantCapability,
      ),
    ).toThrow(/not authorized/);
  });

  it('blocks a cross-tenant resource before a permissive resource policy runs', async () => {
    const actor = principal();
    const context = TrustedTenantContext.fromPrincipal(actor);
    const evaluate = vi.fn(() => true);
    const policy: ResourcePolicy<{ tenantId: string }, 'read'> = { evaluate };

    await expect(
      authorization.requireResourcePolicy(actor, context, policy, 'read', {
        tenantId: 'tenant-b',
      }),
    ).rejects.toThrow(/not authorized/);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('requires an academic resource policy to explicitly allow the action', async () => {
    const actor = principal();
    const context = TrustedTenantContext.fromPrincipal(actor);
    const policy: ResourcePolicy<{ tenantId: string }, 'read'> = {
      evaluate: () => false,
    };

    await expect(
      authorization.requireResourcePolicy(actor, context, policy, 'read', {
        tenantId: 'tenant-a',
      }),
    ).rejects.toThrow(/not authorized/);
  });

  it('creates repository and job carriers only from a trusted tenant context', () => {
    const context = TrustedTenantContext.fromPrincipal(principal());

    expect(TenantQueryScope.fromTrustedContext(context)).toMatchObject({
      tenantId: 'tenant-a',
    });
    expect(
      TrustedTenantJobContext.fromTrustedRequestContext(context),
    ).toMatchObject({ tenantId: 'tenant-a' });
    expect(() =>
      TenantQueryScope.fromTrustedContext({
        tenantId: 'tenant-b',
      } as TrustedTenantContext),
    ).toThrow(/Trusted tenant query scope/);
    expect(() =>
      TrustedTenantJobContext.fromTrustedRequestContext({
        tenantId: 'tenant-b',
      } as TrustedTenantContext),
    ).toThrow(/Trusted tenant context/);
  });
});
