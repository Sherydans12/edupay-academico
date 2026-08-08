import { ForbiddenException, Injectable } from '@nestjs/common';

import type { TrustedIdentityPrincipal } from '../identity/identity.types';
import { TrustedTenantContext } from '../tenant/trusted-tenant-context';
import { capabilityRoles, TenantCapability } from './authorization.types';
import type { ResourcePolicy, TenantOwnedResource } from './resource-policy';

@Injectable()
export class AuthorizationService {
  requireCapability(
    principal: TrustedIdentityPrincipal,
    tenant: TrustedTenantContext,
    capability: TenantCapability,
  ): void {
    this.requireTrustedTenant(principal, tenant);
    const allowedRoles = capabilityRoles[capability] as
      readonly string[] | undefined;
    if (
      !allowedRoles ||
      !principal.roles.some((role) => allowedRoles.includes(role))
    ) {
      this.deny();
    }
  }

  async requireResourcePolicy<
    TResource extends TenantOwnedResource,
    TAction extends string,
  >(
    principal: TrustedIdentityPrincipal,
    tenant: TrustedTenantContext,
    policy: ResourcePolicy<TResource, TAction>,
    action: TAction,
    resource: TResource,
  ): Promise<void> {
    this.requireTrustedTenant(principal, tenant);
    if (resource.tenantId !== tenant.tenantId) {
      this.deny();
    }
    if (!(await policy.evaluate({ principal, tenant }, action, resource))) {
      this.deny();
    }
  }

  private requireTrustedTenant(
    principal: TrustedIdentityPrincipal,
    tenant: TrustedTenantContext,
  ): void {
    if (
      !TrustedTenantContext.isTrusted(tenant) ||
      principal.identityUserId !== tenant.identityUserId ||
      principal.sessionId !== tenant.sessionId ||
      principal.membershipId !== tenant.membershipId ||
      principal.tenantId !== tenant.tenantId
    ) {
      this.deny();
    }
  }

  private deny(): never {
    throw new ForbiddenException('The requested action is not authorized.');
  }
}
