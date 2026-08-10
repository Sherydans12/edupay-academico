import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { configureApplication } from '../src/bootstrap/configure-application';

describe('Health endpoint (e2e)', () => {
  let application: INestApplication;

  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv(
      'DATABASE_URL',
      'postgresql://USER:PASSWORD@localhost:5432/edupay_academico',
    );
    vi.stubEnv('IDENTITY_ISSUER', 'http://identity.local');
    vi.stubEnv('IDENTITY_AUDIENCE', 'edupay-academico-api');
    vi.stubEnv(
      'IDENTITY_JWKS_URI',
      'http://identity.local/.well-known/jwks.json',
    );
    vi.stubEnv('IDENTITY_INTERNAL_BASE_URL', 'http://identity.local');
    vi.stubEnv(
      'IDENTITY_INTERNAL_SERVICE_TOKEN',
      'academic_test_service_token_000000000000000000000000',
    );

    const { AppModule } = await import('../src/app.module');
    const testingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    application = testingModule.createNestApplication();
    configureApplication(application);
    await application.init();
  });

  afterAll(async () => {
    await application.close();
    vi.unstubAllEnvs();
  });

  it('serves health under the versioned API prefix and propagates correlation IDs', async () => {
    const response = await request(application.getHttpServer())
      .get('/api/v1/health')
      .set('x-request-id', 'bootstrap-test-request')
      .expect(200);

    expect(response.headers['x-request-id']).toBe('bootstrap-test-request');
    expect(response.body).toEqual({
      service: 'edupay-academico-api',
      status: 'ok',
    });
  });
});
