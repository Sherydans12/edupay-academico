import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  TrustedIdentityPrincipal,
  type IdentityRole,
} from '../identity/identity.types';

/**
 * Contexto de confianza por tenant, inmutable y verificado.
 * Solo se construye si el principal tiene membresía activa en el tenant
 * y un rol distinto de SYSTEM_ADMIN.
 * Además, valida que el tenantId del cliente coincida con el del JWT (T-03).
 */
@Injectable()
export class TrustedTenantContext {
  readonly identityUserId: string;
  readonly tenantId: string;
  readonly membershipId: string;
  readonly roles: ReadonlyArray<IdentityRole>;
  readonly sessionId: string;

  private constructor(principal: TrustedIdentityPrincipal) {
    this.identityUserId = principal.identityUserId;
    this.tenantId = principal.tenantId!;
    this.membershipId = principal.membershipId!;
    this.roles = Object.freeze([...principal.roles]);
    this.sessionId = principal.sessionId;
  }

  static fromPrincipal(
    principal: TrustedIdentityPrincipal,
    clientTenantId?: string,
  ): TrustedTenantContext {
    const { tenantId, membershipId, roles } = principal;

    if (!tenantId || !membershipId) {
      throw new ForbiddenException('Tenant access is not authorized.');
    }

    const hasNonSystemAdminRole = roles.some((role) => role !== 'SYSTEM_ADMIN');
    if (!hasNonSystemAdminRole) {
      throw new ForbiddenException('Tenant access is not authorized.');
    }

    // T-03: Rechazar si el tenantId del cliente no coincide con el del JWT
    if (clientTenantId && clientTenantId !== tenantId) {
      throw new ForbiddenException('Tenant access is not authorized.');
    }

    return Object.freeze(new TrustedTenantContext(principal));
  }

  static isTrusted(value: unknown): value is TrustedTenantContext {
    return value instanceof TrustedTenantContext && Object.isFrozen(value);
  }
}
