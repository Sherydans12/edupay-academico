import { ForbiddenException } from '@nestjs/common';

import type { TrustedIdentityPrincipal } from '../identity/identity.types';
import { TrustedTenantContext } from './trusted-tenant-context';

/**
 * In-process server-created carrier for future job dispatch. Persisted queue
 * envelopes will require a separately approved authenticated codec/transport.
 */
export class TrustedTenantJobContext {
  readonly identityUserId: string;
  readonly membershipId: string;
  readonly roles: TrustedIdentityPrincipal['roles'];
  readonly sessionId: string;
  readonly tenantId: string;

  private constructor(context: TrustedTenantContext) {
    this.identityUserId = context.identityUserId;
    this.membershipId = context.membershipId;
    this.roles = context.roles;
    this.sessionId = context.sessionId;
    this.tenantId = context.tenantId;
    Object.freeze(this);
  }

  static fromTrustedRequestContext(
    context: TrustedTenantContext,
  ): TrustedTenantJobContext {
    if (!TrustedTenantContext.isTrusted(context)) {
      throw new ForbiddenException('Trusted tenant context is required.');
    }
    return new TrustedTenantJobContext(context);
  }

  static isTrusted(value: unknown): value is TrustedTenantJobContext {
    return value instanceof TrustedTenantJobContext && Object.isFrozen(value);
  }
}

export interface TenantJobContextDecoder {
  /** Future workers must authenticate/verify an envelope before returning this. */
  verify(encodedContext: unknown): Promise<TrustedTenantJobContext>;
}
