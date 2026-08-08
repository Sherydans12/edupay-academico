import type { TrustedIdentityPrincipal } from './identity.types';

export const IDENTITY_ACCESS_TOKEN_VERIFIER = Symbol(
  'IDENTITY_ACCESS_TOKEN_VERIFIER',
);
export const IDENTITY_SESSION_STATUS_ADAPTER = Symbol(
  'IDENTITY_SESSION_STATUS_ADAPTER',
);

export interface IdentityAccessTokenVerifier {
  validateAccessToken(
    encodedAccessToken: string,
  ): Promise<TrustedIdentityPrincipal>;
}

export interface IdentitySessionStatusRequest {
  correlationId: string;
  identityUserId: string;
  membershipId: string;
  sessionId: string;
  tenantId: string;
}

export interface IdentitySessionStatus {
  active: boolean;
  identityUserId: string;
  membershipActive: boolean;
  membershipId: string;
  sessionActive: boolean;
  sessionId: string;
  tenantId: string;
}

/** Restricted online Identity boundary for explicitly high-risk actions. */
export interface IdentitySessionStatusAdapter {
  checkSessionStatus(
    request: IdentitySessionStatusRequest,
  ): Promise<IdentitySessionStatus>;
}
