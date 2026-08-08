import type { INestApplication } from '@nestjs/common';
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { RequireCapabilities } from '../src/authorization/require-capabilities.decorator';
import { TenantCapability } from '../src/authorization/authorization.types';
import { configureApplication } from '../src/bootstrap/configure-application';
import {
  IDENTITY_SESSION_STATUS_ADAPTER,
  type IdentitySessionStatusAdapter,
  type IdentitySessionStatusRequest,
} from '../src/identity/identity-adapter.port';
import { RequireCurrentIdentityStatus } from '../src/identity/require-current-identity-status.decorator';
import {
  CurrentPrincipal,
  CurrentTenant,
} from '../src/tenant/current-context.decorators';
import type { TrustedIdentityPrincipal } from '../src/identity/identity.types';
import type { TrustedTenantContext } from '../src/tenant/trusted-tenant-context';
import { IdentityJwksFixture } from './support/identity-jwks.fixture';

@Controller('security-probe')
class SecurityProbeController {
  @Get('tenant/:tenantId')
  @RequireCapabilities(TenantCapability.AccessTenant)
  tenant(
    @Param('tenantId') _tenantSelector: string,
    @CurrentPrincipal() principal: TrustedIdentityPrincipal,
    @CurrentTenant() tenant: TrustedTenantContext,
  ): object {
    return {
      identityUserId: principal.identityUserId,
      membershipId: tenant.membershipId,
      tenantId: tenant.tenantId,
    };
  }

  @Post('tenant-selector')
  @RequireCapabilities(TenantCapability.AccessTenant)
  bodySelector(@Body() body: unknown): object {
    void body;
    return { accepted: true };
  }

  @Get('admin')
  @RequireCapabilities(TenantCapability.AdministerAcademicStructure)
  admin(): object {
    return { accepted: true };
  }

  @Get('deny-by-default')
  @RequireCapabilities()
  denyByDefault(): object {
    return { accepted: true };
  }

  @Get('high-risk')
  @RequireCapabilities(TenantCapability.AdministerAcademicStructure)
  @RequireCurrentIdentityStatus()
  highRisk(): object {
    return { accepted: true };
  }
}

describe('Tenancy and authorization foundation (e2e)', () => {
  const fixture = new IdentityJwksFixture();
  const statusAdapter: IdentitySessionStatusAdapter & {
    active: boolean;
    calls: number;
  } = {
    active: true,
    calls: 0,
    async checkSessionStatus(request: IdentitySessionStatusRequest) {
      this.calls += 1;
      return {
        active: this.active,
        identityUserId: request.identityUserId,
        membershipActive: this.active,
        membershipId: request.membershipId,
        sessionActive: this.active,
        sessionId: request.sessionId,
        tenantId: request.tenantId,
      };
    },
  };
  let application: INestApplication;

  beforeAll(async () => {
    await fixture.start();
    for (const [key, value] of Object.entries(fixture.environment())) {
      vi.stubEnv(key, value);
    }

    const { AppModule } = await import('../src/app.module');
    const testingModule = await Test.createTestingModule({
      controllers: [SecurityProbeController],
      imports: [AppModule],
    })
      .overrideProvider(IDENTITY_SESSION_STATUS_ADAPTER)
      .useValue(statusAdapter)
      .compile();

    application = testingModule.createNestApplication();
    configureApplication(application);
    await application.init();
  });

  beforeEach(() => {
    statusAdapter.active = true;
    statusAdapter.calls = 0;
  });

  afterAll(async () => {
    await application.close();
    await fixture.close();
    vi.unstubAllEnvs();
  });

  it('accepts a valid token and exposes only the validated principal membership', async () => {
    const response = await request(application.getHttpServer())
      .get('/api/v1/security-probe/tenant/tenant-a')
      .auth(await fixture.sign(), { type: 'bearer' })
      .expect(200);

    expect(response.body).toEqual({
      identityUserId: 'identity-user-a',
      membershipId: 'membership-a',
      tenantId: 'tenant-a',
    });
    expect(statusAdapter.calls).toBe(0);
  });

  it('rejects a tenant endpoint when the valid token has no active context', async () => {
    const token = await fixture.sign({
      membership_id: undefined,
      roles: ['SYSTEM_ADMIN'],
      tenant_id: undefined,
    });
    await request(application.getHttpServer())
      .get('/api/v1/security-probe/tenant/tenant-a')
      .auth(token, { type: 'bearer' })
      .expect(403);
  });

  it('does not let a teacher in tenant A establish tenant B from a URL', async () => {
    await request(application.getHttpServer())
      .get('/api/v1/security-probe/tenant/tenant-b')
      .auth(await fixture.sign({ roles: ['TEACHER'] }), { type: 'bearer' })
      .expect(403);
  });

  it.each([
    ['header', 'header'],
    ['request body', 'body'],
    ['membership body', 'membership'],
  ])(
    'rejects a conflicting client selector from the %s',
    async (_label, source) => {
      const call = request(application.getHttpServer())
        .post('/api/v1/security-probe/tenant-selector')
        .auth(await fixture.sign(), { type: 'bearer' });

      if (source === 'header') {
        call.set('x-tenant-id', 'tenant-b').send({});
      } else if (source === 'body') {
        call.send({ tenantId: 'tenant-b' });
      } else {
        call.send({ membershipId: 'membership-b' });
      }

      await call.expect(403);
    },
  );

  it('does not grant tenant access from SYSTEM_ADMIN plus client-selected tenant claims', async () => {
    await request(application.getHttpServer())
      .get('/api/v1/security-probe/tenant/tenant-a')
      .auth(await fixture.sign({ roles: ['SYSTEM_ADMIN'] }), { type: 'bearer' })
      .expect(403);
  });

  it('centralizes capability decisions and denies a teacher an admin capability', async () => {
    await request(application.getHttpServer())
      .get('/api/v1/security-probe/admin')
      .auth(await fixture.sign({ roles: ['TEACHER'] }), { type: 'bearer' })
      .expect(403);

    await request(application.getHttpServer())
      .get('/api/v1/security-probe/admin')
      .auth(await fixture.sign({ roles: ['TENANT_ADMIN'] }), { type: 'bearer' })
      .expect(200);
  });

  it('denies an empty capability policy by default', async () => {
    await request(application.getHttpServer())
      .get('/api/v1/security-probe/deny-by-default')
      .auth(await fixture.sign({ roles: ['TENANT_ADMIN'] }), { type: 'bearer' })
      .expect(403);
  });

  it('fails a high-risk operation closed when Identity reports stale or revoked context', async () => {
    statusAdapter.active = false;

    await request(application.getHttpServer())
      .get('/api/v1/security-probe/high-risk')
      .auth(await fixture.sign({ roles: ['TENANT_ADMIN'] }), { type: 'bearer' })
      .expect(403);
  });

  it('allows a high-risk operation only after the current status adapter agrees', async () => {
    await request(application.getHttpServer())
      .get('/api/v1/security-probe/high-risk')
      .auth(await fixture.sign({ roles: ['TENANT_ADMIN'] }), { type: 'bearer' })
      .expect(200);
    expect(statusAdapter.calls).toBe(1);
  });
});
