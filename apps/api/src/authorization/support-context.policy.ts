import { Injectable } from '@nestjs/common';

import type { TrustedIdentityPrincipal } from '../identity/identity.types';
import type { TrustedTenantContext } from '../tenant/trusted-tenant-context';

export const SUPPORT_CONTEXT_POLICY = Symbol('SUPPORT_CONTEXT_POLICY');

export interface SupportContextRequest {
  readonly principal: TrustedIdentityPrincipal;
  readonly requestId: string;
}

/**
 * Replacement seam for a future accepted, audited elevation contract. No
 * target tenant is read directly from client input here.
 */
export interface SupportContextPolicy {
  resolveApprovedContext(
    request: SupportContextRequest,
  ): Promise<TrustedTenantContext | null>;
}

@Injectable()
export class DisabledSupportContextPolicy implements SupportContextPolicy {
  resolveApprovedContext(): Promise<TrustedTenantContext | null> {
    return Promise.resolve(null);
  }
}
