import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';

import type { Environment } from '../config/environment';
import type { IdentityAccessTokenVerifier } from './identity-adapter.port';
import { identityRoles, TrustedIdentityPrincipal } from './identity.types';

const MAXIMUM_ACCESS_TOKEN_LIFETIME_SECONDS = 600;
const OPAQUE_ID = z.string().trim().min(1).max(255);

const identityAccessTokenClaimsSchema = z
  .object({
    aud: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
    auth_time: z.number().int().nonnegative().optional(),
    exp: z.number().int().nonnegative(),
    iat: z.number().int().nonnegative(),
    iss: z.string().min(1),
    jti: OPAQUE_ID,
    membership_id: OPAQUE_ID.optional(),
    nbf: z.number().int().nonnegative(),
    roles: z.array(z.enum(identityRoles)).min(1),
    scope: z
      .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
      .optional(),
    sid: OPAQUE_ID,
    sub: OPAQUE_ID,
    tenant_id: OPAQUE_ID.optional(),
  })
  .passthrough()
  .superRefine((claims, context) => {
    if (
      (claims.tenant_id === undefined) !==
      (claims.membership_id === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'tenant_id and membership_id must be present together',
      });
    }

    if (claims.exp <= claims.iat) {
      context.addIssue({
        code: 'custom',
        message: 'exp must be later than iat',
        path: ['exp'],
      });
    }

    if (claims.exp - claims.iat > MAXIMUM_ACCESS_TOKEN_LIFETIME_SECONDS) {
      context.addIssue({
        code: 'custom',
        message: 'access token lifetime exceeds the accepted maximum',
        path: ['exp'],
      });
    }

    if (new Set(claims.roles).size !== claims.roles.length) {
      context.addIssue({
        code: 'custom',
        message: 'roles must not contain duplicates',
        path: ['roles'],
      });
    }
  });

@Injectable()
export class JwksIdentityAccessTokenVerifier implements IdentityAccessTokenVerifier {
  private readonly algorithms: string[];
  private readonly audience: string;
  private readonly clockTolerance: number;
  private readonly issuer: string;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(config: ConfigService<Environment, true>) {
    this.algorithms = config.get('IDENTITY_JWT_ALGORITHMS', { infer: true });
    this.audience = config.get('IDENTITY_AUDIENCE', { infer: true });
    this.clockTolerance = config.get('IDENTITY_CLOCK_SKEW_SECONDS', {
      infer: true,
    });
    this.issuer = config.get('IDENTITY_ISSUER', { infer: true });
    this.jwks = createRemoteJWKSet(
      new URL(config.get('IDENTITY_JWKS_URI', { infer: true })),
      {
        cacheMaxAge: config.get('IDENTITY_JWKS_CACHE_MAX_AGE_MS', {
          infer: true,
        }),
        cooldownDuration: config.get('IDENTITY_JWKS_COOLDOWN_MS', {
          infer: true,
        }),
        timeoutDuration: config.get('IDENTITY_JWKS_TIMEOUT_MS', {
          infer: true,
        }),
      },
    );
  }

  async validateAccessToken(
    encodedAccessToken: string,
  ): Promise<TrustedIdentityPrincipal> {
    try {
      const result = await jwtVerify(encodedAccessToken, this.jwks, {
        algorithms: this.algorithms,
        audience: this.audience,
        clockTolerance: this.clockTolerance,
        issuer: this.issuer,
        maxTokenAge: '10 minutes',
        requiredClaims: [
          'aud',
          'exp',
          'iat',
          'iss',
          'jti',
          'nbf',
          'roles',
          'sid',
          'sub',
        ],
      });
      const claims = identityAccessTokenClaimsSchema.parse(result.payload);

      return TrustedIdentityPrincipal.fromValidatedAccessTokenClaims(claims);
    } catch {
      throw new UnauthorizedException('The access token is invalid.');
    }
  }
}
