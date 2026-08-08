export const identityRoles = [
  'SYSTEM_ADMIN',
  'TENANT_ADMIN',
  'TEACHER',
  'STUDENT',
] as const;

export type IdentityRole = (typeof identityRoles)[number];

/** Exact external claim names from the accepted EduPay Identity contract. */
export interface IdentityAccessTokenClaims {
  aud: string | string[];
  exp: number;
  iat: number;
  iss: string;
  jti: string;
  membership_id: string;
  nbf: number;
  roles: IdentityRole[];
  scope?: string;
  sid: string;
  sub: string;
  tenant_id: string;
}

/** Internal trusted representation produced only after future JWT validation. */
export interface TrustedIdentityPrincipal {
  audience: string | string[];
  expiresAt: number;
  identityUserId: string;
  issuedAt: number;
  issuer: string;
  membershipId: string;
  roles: readonly IdentityRole[];
  sessionId: string;
  tenantId: string;
  tokenId: string;
}
