import type { TrustedIdentityPrincipal } from './identity.types';

export const IDENTITY_ADAPTER = Symbol('IDENTITY_ADAPTER');

export interface IdentitySessionStatusRequest {
  membershipId: string;
  sessionId: string;
  tenantId: string;
}

export interface IdentitySessionStatus {
  active: boolean;
  membershipActive: boolean;
  sessionActive: boolean;
}

/**
 * Consumer boundary only. Phase 1 must implement JWKS verification and the
 * restricted high-risk status check against the accepted Identity contract.
 */
export interface IdentityAdapter {
  checkSessionStatus(
    request: IdentitySessionStatusRequest,
  ): Promise<IdentitySessionStatus>;
  validateAccessToken(
    encodedAccessToken: string,
  ): Promise<TrustedIdentityPrincipal>;
}
