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
    vi.stubEnv('ACADEMIC_TRUSTED_WEB_ORIGINS', 'http://localhost:3000');
    vi.stubEnv('ACADEMIC_MALWARE_SCANNER', 'fake');

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

  it('serves liveness separately from dependency readiness', async () => {
    await request(application.getHttpServer())
      .get('/api/v1/health/live')
      .expect(200, { service: 'edupay-academico-api', status: 'ok' });

    const response = await request(application.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(503);

    expect(response.body.error).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'The request could not be completed.',
    });
  });

  it('reflects only the exact configured Academic web origin for CORS', async () => {
    const trusted = await request(application.getHttpServer())
      .options('/api/v1/health')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'GET')
      .expect(204);

    expect(trusted.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(trusted.headers['access-control-allow-origin']).not.toBe('*');

    const untrusted = await request(application.getHttpServer())
      .options('/api/v1/health')
      .set('Origin', 'http://evil.localhost:3000')
      .set('Access-Control-Request-Method', 'GET')
      .expect(404);

    expect(untrusted.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('permits CORS preflight with PUT method and required headers for student identity linking', async () => {
    const preflight = await request(application.getHttpServer())
      .options('/api/v1/students/54431c75-10be-4e3f-b7f1-06f8f99b42ff/identity-link')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'PUT')
      .set('Access-Control-Request-Headers', 'authorization,content-type,x-request-id')
      .expect(204);

    expect(preflight.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(preflight.headers['access-control-allow-methods']).toContain('PUT');
    expect(preflight.headers['access-control-allow-headers']).toBeDefined();

    const untrusted = await request(application.getHttpServer())
      .options('/api/v1/students/54431c75-10be-4e3f-b7f1-06f8f99b42ff/identity-link')
      .set('Origin', 'https://untrusted-attacker.test')
      .set('Access-Control-Request-Method', 'PUT')
      .set('Access-Control-Request-Headers', 'authorization,content-type,x-request-id')
      .expect(404);

    expect(untrusted.headers['access-control-allow-origin']).toBeUndefined();
  });
});
