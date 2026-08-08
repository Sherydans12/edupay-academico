import { ConfigService } from '@nestjs/config';
import { decodeJwt } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { validateEnvironment, type Environment } from '../config/environment';
import { IdentityJwksFixture } from '../../test/support/identity-jwks.fixture';
import { JwksIdentityAccessTokenVerifier } from './jwks-identity-access-token-verifier';

describe('JwksIdentityAccessTokenVerifier', () => {
  const fixture = new IdentityJwksFixture();
  let verifier: JwksIdentityAccessTokenVerifier;

  beforeAll(async () => {
    await fixture.start();
    const environment = validateEnvironment(fixture.environment());
    verifier = new JwksIdentityAccessTokenVerifier(
      new ConfigService<Environment, true>(environment),
    );
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('accepts an asymmetrically signed Identity token and freezes the principal', async () => {
    const principal = await verifier.validateAccessToken(await fixture.sign());

    expect(principal).toMatchObject({
      identityUserId: 'identity-user-a',
      membershipId: 'membership-a',
      roles: ['TEACHER'],
      sessionId: 'session-a',
      tenantId: 'tenant-a',
    });
    expect(Object.isFrozen(principal)).toBe(true);
    expect(Object.isFrozen(principal.roles)).toBe(true);
  });

  it.each([
    ['wrong issuer', { iss: 'https://wrong-issuer.example' }],
    ['wrong audience', { aud: 'another-api' }],
  ])('rejects a token with %s', async (_label, overrides) => {
    await expect(
      verifier.validateAccessToken(await fixture.sign(overrides)),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('rejects expired tokens outside the configured clock tolerance', async () => {
    const now = Math.floor(Date.now() / 1000);
    await expect(
      verifier.validateAccessToken(
        await fixture.sign({ exp: now - 31, iat: now - 631, nbf: now - 631 }),
      ),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('honors bounded clock skew for nbf', async () => {
    const now = Math.floor(Date.now() / 1000);
    await expect(
      verifier.validateAccessToken(
        await fixture.sign({ exp: now + 600, iat: now, nbf: now + 29 }),
      ),
    ).resolves.toMatchObject({ tenantId: 'tenant-a' });
  });

  it('rejects a bad signature even when the attacker reuses a trusted key ID', async () => {
    await expect(
      verifier.validateAccessToken(
        await fixture.sign({}, { attackerKey: true }),
      ),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('rejects an unsigned token', async () => {
    const signedToken = await fixture.sign();
    const payload = signedToken.split('.')[1];
    const unsignedHeader = Buffer.from(
      JSON.stringify({ alg: 'none', typ: 'JWT' }),
    ).toString('base64url');

    await expect(
      verifier.validateAccessToken(`${unsignedHeader}.${payload}.`),
    ).rejects.toMatchObject({ status: 401 });
  });

  it.each([
    ['missing subject', { sub: undefined }],
    ['non-array roles', { roles: 'TEACHER' }],
    ['unknown role', { roles: ['SUPER_TEACHER'] }],
    ['tenant without membership', { membership_id: undefined }],
    ['membership without tenant', { tenant_id: undefined }],
    ['non-string membership', { membership_id: 123 }],
  ])('rejects malformed claims: %s', async (_label, overrides) => {
    await expect(
      verifier.validateAccessToken(await fixture.sign(overrides)),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('rejects tokens whose issued lifetime exceeds ten minutes', async () => {
    const now = Math.floor(Date.now() / 1000);
    await expect(
      verifier.validateAccessToken(
        await fixture.sign({ exp: now + 601, iat: now, nbf: now }),
      ),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('accepts a context-free authenticated token but does not invent tenant claims', async () => {
    const token = await fixture.sign({
      membership_id: undefined,
      roles: ['SYSTEM_ADMIN'],
      tenant_id: undefined,
    });
    expect(decodeJwt(token)).not.toHaveProperty('tenant_id');

    await expect(verifier.validateAccessToken(token)).resolves.toMatchObject({
      identityUserId: 'identity-user-a',
      membershipId: undefined,
      tenantId: undefined,
    });
  });
});
