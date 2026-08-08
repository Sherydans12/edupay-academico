import { ForbiddenException } from '@nestjs/common';

import type { TrustedIdentityPrincipal } from '../identity/identity.types';

export class TrustedTenantContext {
  readonly identityUserId: string;
  readonly membershipId: string;
  readonly roles: TrustedIdentityPrincipal['roles'];
  readonly sessionId: string;
  readonly tenantId: string;

  private constructor(principal: TrustedIdentityPrincipal) {
    this.identityUserId = principal.identityUserId;
    this.membershipId = principal.membershipId as string;
    this.roles = principal.roles;
    this.sessionId = principal.sessionId;
    this.tenantId = principal.tenantId as string;
    Object.freeze(this);
  }

  static fromPrincipal(
    principal: TrustedIdentityPrincipal,
  ): TrustedTenantContext {
    const hasActiveMembership =
      principal.tenantId !== undefined && principal.membershipId !== undefined;
    const hasTenantMembershipRole = principal.roles.some(
      (role) => role !== 'SYSTEM_ADMIN',
    );

    if (!hasActiveMembership || !hasTenantMembershipRole) {
      throw new ForbiddenException('Tenant access is not authorized.');
    }

    return new TrustedTenantContext(principal);
  }

  static isTrusted(value: unknown): value is TrustedTenantContext {
    return value instanceof TrustedTenantContext && Object.isFrozen(value);
  }
}
