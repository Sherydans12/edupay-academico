import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import {
  TrustedIdentityPrincipal,
  type IdentityRole,
} from '../identity/identity.types';
import { TrustedTenantContext } from './trusted-tenant-context';

function principal(
  overrides: Partial<{
    tenantId: string | undefined;
    membershipId: string | undefined;
    roles: IdentityRole[];
  }> = {},
): TrustedIdentityPrincipal {
  return TrustedIdentityPrincipal.fromValidatedAccessTokenClaims({
    aud: 'academic-api',
    exp: 2_000_000_000,
    iat: 1_999_999_000,
    iss: 'https://identity.example.test',
    jti: 'token-test',
    membership_id: Object.prototype.hasOwnProperty.call(
      overrides,
      'membershipId',
    )
      ? overrides.membershipId
      : 'membership-1',
    nbf: 1_999_999_000,
    roles: overrides.roles ?? ['TEACHER'],
    sid: 'session-test',
    sub: 'identity-test',
    tenant_id: Object.prototype.hasOwnProperty.call(overrides, 'tenantId')
      ? overrides.tenantId
      : 'tenant-A',
  });
}

describe('TrustedTenantContext', () => {
  describe('fromPrincipal', () => {
    it('creates context when principal has active membership and non-SYSTEM_ADMIN role', () => {
      const actor = principal({
        tenantId: 'tenant-A',
        membershipId: 'membership-1',
        roles: ['TEACHER'],
      });

      const ctx = TrustedTenantContext.fromPrincipal(actor);

      expect(ctx.tenantId).toBe('tenant-A');
      expect(ctx.membershipId).toBe('membership-1');
      expect(ctx.roles).toEqual(['TEACHER']);
      expect(ctx.identityUserId).toBe('identity-test');
      expect(ctx.sessionId).toBe('session-test');
      expect(Object.isFrozen(ctx)).toBe(true);
    });

    it('creates context when clientTenantId matches principal tenantId', () => {
      const actor = principal({
        tenantId: 'tenant-A',
        membershipId: 'membership-1',
        roles: ['TEACHER'],
      });

      const ctx = TrustedTenantContext.fromPrincipal(actor, 'tenant-A');

      expect(ctx.tenantId).toBe('tenant-A');
      expect(ctx.membershipId).toBe('membership-1');
      expect(ctx.roles).toEqual(['TEACHER']);
      expect(Object.isFrozen(ctx)).toBe(true);
    });

    it('throws when tenantId is missing', () => {
      const actor = principal({ tenantId: undefined });

      expect(() => TrustedTenantContext.fromPrincipal(actor)).toThrow(
        ForbiddenException,
      );
    });

    it('throws when membershipId is missing', () => {
      const actor = principal({ membershipId: undefined });

      expect(() => TrustedTenantContext.fromPrincipal(actor)).toThrow(
        ForbiddenException,
      );
    });

    it('throws when only SYSTEM_ADMIN role', () => {
      const actor = principal({ roles: ['SYSTEM_ADMIN'] });

      expect(() => TrustedTenantContext.fromPrincipal(actor)).toThrow(
        ForbiddenException,
      );
    });

    it('throws when roles array is empty', () => {
      const actor = principal({ roles: [] });

      expect(() => TrustedTenantContext.fromPrincipal(actor)).toThrow(
        ForbiddenException,
      );
    });

    // T-03: Tenant mismatch tests
    it('throws 403 when clientTenantId differs from principal tenantId (T-03)', () => {
      const actor = principal({
        tenantId: 'tenant-A',
        membershipId: 'membership-1',
        roles: ['TEACHER'],
      });

      expect(() =>
        TrustedTenantContext.fromPrincipal(actor, 'tenant-B'),
      ).toThrow(ForbiddenException);
    });

    it('throws 403 when clientTenantId is provided but principal has no tenantId (T-03)', () => {
      const actor = principal({
        tenantId: undefined,
        membershipId: 'membership-1',
        roles: ['TEACHER'],
      });

      expect(() =>
        TrustedTenantContext.fromPrincipal(actor, 'tenant-B'),
      ).toThrow(ForbiddenException);
    });

    it('allows when clientTenantId is not provided (backward compatibility)', () => {
      const actor = principal({
        tenantId: 'tenant-A',
        membershipId: 'membership-1',
        roles: ['TEACHER'],
      });

      const ctx = TrustedTenantContext.fromPrincipal(actor);

      expect(ctx.tenantId).toBe('tenant-A');
    });

    it('allows when clientTenantId is empty string', () => {
      const actor = principal({
        tenantId: 'tenant-A',
        membershipId: 'membership-1',
        roles: ['TEACHER'],
      });

      const ctx = TrustedTenantContext.fromPrincipal(actor, '');

      expect(ctx.tenantId).toBe('tenant-A');
    });
  });
});
