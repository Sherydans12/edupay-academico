import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { AcademicIdentityLinkRequest } from '../academic/identity-link.port';
import { validateEnvironment, type Environment } from '../config/environment';
import { TrustedTenantContext } from '../tenant/trusted-tenant-context';
import { CurrentIdentityStatusService } from './current-identity-status.service';
import { HttpAcademicIdentityLinkVerifier } from './http-academic-identity-link-verifier';
import { HttpIdentitySessionStatusAdapter } from './http-identity-session-status.adapter';
import { IdentityInternalHttpClient } from './identity-internal-http.client';
import { TrustedIdentityPrincipal } from './identity.types';
import { IdentityInternalFixture } from '../../test/support/identity-internal.fixture';

const BASE_SESSION_RESPONSE = {
  active: true,
  identityUserId: 'actor-user',
  membershipActive: true,
  membershipId: 'actor-membership',
  sessionActive: true,
  sessionId: 'actor-session',
  tenantId: 'tenant-a',
};

const BASE_LINK_RESPONSE = {
  verified: true,
  identityUserId: 'target-user',
  membershipId: 'target-membership',
  membershipStatus: 'ACTIVE',
  roles: ['STUDENT'],
  tenantId: 'tenant-a',
};

describe('Identity internal HTTP bridge', () => {
  const fixture = new IdentityInternalFixture();

  beforeAll(() => fixture.start());
  beforeEach(() => {
    fixture.reset();
    fixture.registerSession({
      identityUserId: 'actor-user',
      membershipId: 'actor-membership',
      sessionId: 'actor-session',
      tenantId: 'tenant-a',
    });
  });
  afterAll(() => fixture.close());

  it('uses the exact session URL and method with service auth and correlation', async () => {
    const adapter = sessionAdapter();

    await expect(adapter.checkSessionStatus(sessionRequest())).resolves.toEqual(
      BASE_SESSION_RESPONSE,
    );

    expect(fixture.requests).toHaveLength(1);
    expect(fixture.requests[0]).toMatchObject({
      method: 'GET',
      url: '/internal/v1/sessions/actor-session/status',
    });
    expect(fixture.requests[0]?.headers).toMatchObject({
      accept: 'application/json',
      authorization: `Bearer ${fixture.serviceToken}`,
      'x-request-id': 'request-123',
    });
  });

  it.each([
    ['identity user', { identityUserId: 'other-user' }],
    ['membership', { membershipId: 'other-membership' }],
    ['tenant', { tenantId: 'tenant-b' }],
    ['session', { sessionId: 'other-session' }],
  ])('denies a current-context %s mismatch', async (_label, change) => {
    fixture.sessionResponse = { ...BASE_SESSION_RESPONSE, ...change };

    await expect(requireCurrentContext()).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it.each([
    ['aggregate inactive', { active: false }],
    ['session inactive', { sessionActive: false }],
    ['membership inactive', { membershipActive: false }],
  ])('denies %s status', async (_label, change) => {
    fixture.sessionResponse = { ...BASE_SESSION_RESPONSE, ...change };

    await expect(requireCurrentContext()).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('fails session verification closed on malformed responses', async () => {
    fixture.sessionResponse = { ...BASE_SESSION_RESPONSE, unexpected: true };

    await expect(
      sessionAdapter().checkSessionStatus(sessionRequest()),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it.each([401, 403])(
    'fails session verification closed on Identity HTTP %s',
    async (status) => {
      fixture.forcedStatus = status;

      await expect(
        sessionAdapter().checkSessionStatus(sessionRequest()),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    },
  );

  it('uses a bounded timeout and does not expose the service token in errors', async () => {
    fixture.delayMs = 250;

    let failure: unknown;
    try {
      await sessionAdapter(100).checkSessionStatus(sessionRequest());
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(ServiceUnavailableException);
    expect(String(failure)).not.toContain(fixture.serviceToken);
    expect(JSON.stringify(failure)).not.toContain(fixture.serviceToken);
  });

  it('does not expose the service token or rejected response body', async () => {
    fixture.forcedStatus = 403;

    let failure: unknown;
    try {
      await sessionAdapter().checkSessionStatus(sessionRequest());
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(ServiceUnavailableException);
    expect(String(failure)).not.toContain(fixture.serviceToken);
    expect(JSON.stringify(failure)).not.toContain(fixture.serviceToken);
  });

  it.each([
    ['STUDENT', 'STUDENT'],
    ['TEACHER', 'TEACHER'],
  ] as const)(
    'derives expectedRole %s for an academic %s link',
    async (recordType, expectedRole) => {
      const request = linkRequest(recordType);

      await expect(
        linkVerifier().verifyExactLink(request),
      ).resolves.toBeUndefined();

      expect(fixture.requests.at(-1)).toMatchObject({
        body: {
          actor: {
            identityUserId: 'actor-user',
            membershipId: 'actor-membership',
            sessionId: 'actor-session',
            tenantId: 'tenant-a',
          },
          expectedRole,
          targetIdentityUserId: 'target-user',
        },
        method: 'POST',
        url: '/internal/v1/identity-users/resolve',
      });
    },
  );

  it('accepts an exact verified target with PENDING_ACTIVATION membership', async () => {
    fixture.identityLinkResponse = {
      ...BASE_LINK_RESPONSE,
      membershipStatus: 'PENDING_ACTIVATION',
    };

    await expect(
      linkVerifier().verifyExactLink(linkRequest('STUDENT')),
    ).resolves.toBeUndefined();
  });

  it.each([
    ['unverified response', { verified: false }],
    ['wrong target', { identityUserId: 'other-user' }],
    ['wrong tenant', { tenantId: 'tenant-b' }],
    ['missing expected role', { roles: ['TEACHER'] }],
    ['suspended membership', { membershipStatus: 'SUSPENDED' }],
    ['revoked membership', { membershipStatus: 'REVOKED' }],
  ])('rejects identity links with %s', async (_label, change) => {
    fixture.identityLinkResponse = { ...BASE_LINK_RESPONSE, ...change };

    await expect(
      linkVerifier().verifyExactLink(linkRequest('STUDENT')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('maps Identity non-enumerating target-not-found to a denied link', async () => {
    fixture.forcedStatus = 404;

    await expect(
      linkVerifier().verifyExactLink(linkRequest('STUDENT')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails identity linking closed on a malformed verification response', async () => {
    fixture.identityLinkResponse = {
      ...BASE_LINK_RESPONSE,
      unexpected: 'must-not-be-part-of-the-minimal-response',
    };

    await expect(
      linkVerifier().verifyExactLink(linkRequest('STUDENT')),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  function client(timeoutMs = 3_000): IdentityInternalHttpClient {
    const environment = validateEnvironment({
      API_HOST: '127.0.0.1',
      API_PORT: '3001',
      DATABASE_URL: 'postgresql://user:password@localhost:5432/academic',
      IDENTITY_AUDIENCE: 'edupay-academico-api',
      IDENTITY_ISSUER: 'http://identity.local',
      IDENTITY_JWKS_URI: 'http://identity.local/.well-known/jwks.json',
      NODE_ENV: 'test',
      ...fixture.environment(timeoutMs),
    });
    return new IdentityInternalHttpClient(
      new ConfigService<Environment, true>(environment),
    );
  }

  function linkVerifier(): HttpAcademicIdentityLinkVerifier {
    return new HttpAcademicIdentityLinkVerifier(client());
  }

  function sessionAdapter(timeoutMs = 3_000): HttpIdentitySessionStatusAdapter {
    return new HttpIdentitySessionStatusAdapter(client(timeoutMs));
  }

  function principal(): TrustedIdentityPrincipal {
    const now = Math.floor(Date.now() / 1_000);
    return TrustedIdentityPrincipal.fromValidatedAccessTokenClaims({
      aud: 'edupay-academico-api',
      exp: now + 600,
      iat: now,
      iss: 'http://identity.local',
      jti: 'token-a',
      membership_id: 'actor-membership',
      nbf: now,
      roles: ['TENANT_ADMIN'],
      sid: 'actor-session',
      sub: 'actor-user',
      tenant_id: 'tenant-a',
    });
  }

  function linkRequest(
    academicRecordType: 'STUDENT' | 'TEACHER',
  ): AcademicIdentityLinkRequest {
    const actor = principal();
    return {
      academicRecordId: 'academic-record-a',
      academicRecordType,
      context: {
        principal: actor,
        requestId: 'request-123',
        tenant: TrustedTenantContext.fromPrincipal(actor),
      },
      identityUserId: 'target-user',
    };
  }

  function sessionRequest() {
    return {
      correlationId: 'request-123',
      identityUserId: 'actor-user',
      membershipId: 'actor-membership',
      sessionId: 'actor-session',
      tenantId: 'tenant-a',
    };
  }

  function requireCurrentContext(): Promise<void> {
    const actor = principal();
    return new CurrentIdentityStatusService(
      sessionAdapter(),
    ).requireCurrentActiveContext(
      actor,
      TrustedTenantContext.fromPrincipal(actor),
      'request-123',
    );
  }
});
