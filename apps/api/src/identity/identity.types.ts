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
  auth_time?: number | undefined;
  exp: number;
  iat: number;
  iss: string;
  jti: string;
  membership_id?: string | undefined;
  nbf: number;
  roles: IdentityRole[];
  scope?: string | string[] | undefined;
  sid: string;
  sub: string;
  tenant_id?: string | undefined;
}

/**
 * Immutable internal identity produced only by the validated access-token
 * adapter. Tenant membership fields are absent together when Identity has not
 * selected an active membership context.
 */
export class TrustedIdentityPrincipal {
  readonly audience: string | readonly string[];
  readonly expiresAt: number;
  readonly identityUserId: string;
  readonly issuedAt: number;
  readonly issuer: string;
  readonly membershipId: string | undefined;
  readonly roles: readonly IdentityRole[];
  readonly sessionId: string;
  readonly tenantId: string | undefined;
  readonly tokenId: string;

  private constructor(claims: IdentityAccessTokenClaims) {
    this.audience = Array.isArray(claims.aud)
      ? Object.freeze([...claims.aud])
      : claims.aud;
    this.expiresAt = claims.exp;
    this.identityUserId = claims.sub;
    this.issuedAt = claims.iat;
    this.issuer = claims.iss;
    this.membershipId = claims.membership_id;
    this.roles = Object.freeze([...claims.roles]);
    this.sessionId = claims.sid;
    this.tenantId = claims.tenant_id;
    this.tokenId = claims.jti;
    Object.freeze(this);
  }

  /** @internal The JWT verifier is the only production caller. */
  static fromValidatedAccessTokenClaims(
    claims: IdentityAccessTokenClaims,
  ): TrustedIdentityPrincipal {
    return new TrustedIdentityPrincipal(claims);
  }
}
