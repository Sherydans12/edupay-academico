import { describe, expect, it } from 'vitest';

import { validateEnvironment } from './environment';

const validEnvironment = {
  NODE_ENV: 'test',
  API_HOST: '127.0.0.1',
  API_PORT: '3001',
  DATABASE_URL: 'postgresql://USER:PASSWORD@localhost:5432/edupay_academico',
  IDENTITY_ISSUER: 'http://identity.local',
  IDENTITY_AUDIENCE: 'edupay-academico-api',
  IDENTITY_JWKS_URI: 'http://identity.local/.well-known/jwks.json',
};

describe('validateEnvironment', () => {
  it('parses a complete environment contract', () => {
    expect(validateEnvironment(validEnvironment)).toMatchObject({
      API_PORT: 3001,
      IDENTITY_AUDIENCE: 'edupay-academico-api',
      NODE_ENV: 'test',
    });
  });

  it('fails closed when security and database configuration is missing', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'test' })).toThrow(
      /DATABASE_URL/,
    );
    expect(() => validateEnvironment({ NODE_ENV: 'test' })).toThrow(
      /IDENTITY_ISSUER/,
    );
  });

  it('requires HTTPS for Identity endpoints in production', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, NODE_ENV: 'production' }),
    ).toThrow(/must use HTTPS in production/);
  });
});
