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
  IDENTITY_INTERNAL_BASE_URL: 'http://identity.local/',
  IDENTITY_INTERNAL_SERVICE_TOKEN:
    'academic_test_service_token_000000000000000000000000',
  ACADEMIC_TRUSTED_WEB_ORIGINS: 'http://localhost:3000',
  ACADEMIC_MALWARE_SCANNER: 'fake',
};

const validProductionEnvironment = {
  ...validEnvironment,
  NODE_ENV: 'production',
  IDENTITY_ISSUER: 'https://identity.example.test',
  IDENTITY_JWKS_URI: 'https://identity.example.test/.well-known/jwks.json',
  IDENTITY_INTERNAL_BASE_URL: 'https://identity.internal.test',
  EDUPAY_INTEGRATION_BASE_URL: 'https://edupay.internal.test',
  EDUPAY_INTEGRATION_TOKEN: 'synthetic-edupay-token-000000000000000000000000',
  ACADEMIC_TRUSTED_WEB_ORIGINS: 'https://academico.example.test',
  ACADEMIC_MALWARE_SCANNER: 'clamav',
  ACADEMIC_CLAMAV_HOST: 'clamav',
  ACADEMIC_CLAMAV_PORT: '3310',
  ACADEMIC_CLAMAV_TIMEOUT_MS: '5000',
  STORAGE_MIN_FREE_BYTES: '1073741824',
  STORAGE_MIN_FREE_PERCENTAGE: '5',
  STORAGE_ROOT: 'C:\\edupay-academico\\files',
  STORAGE_TEMP_ROOT: 'C:\\edupay-academico\\tmp',
  ACADEMIC_PUBLIC_BASE_URL: 'https://academico.example.test',
  ACADEMIC_RESEND_API_KEY: 'synthetic-resend-key',
};

describe('validateEnvironment', () => {
  it('parses a complete environment contract', () => {
    expect(validateEnvironment(validEnvironment)).toMatchObject({
      API_PORT: 3001,
      IDENTITY_AUDIENCE: 'edupay-academico-api',
      IDENTITY_CLOCK_SKEW_SECONDS: 30,
      IDENTITY_INTERNAL_BASE_URL: 'http://identity.local',
      IDENTITY_INTERNAL_TIMEOUT_MS: 3000,
      IDENTITY_JWT_ALGORITHMS: ['RS256'],
      ACADEMIC_TRUSTED_WEB_ORIGINS: ['http://localhost:3000'],
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
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        IDENTITY_INTERNAL_SERVICE_TOKEN: '',
      }),
    ).toThrow(/IDENTITY_INTERNAL_SERVICE_TOKEN/);
  });

  it('requires HTTPS for Identity endpoints in production', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, NODE_ENV: 'production' }),
    ).toThrow(/must use HTTPS in production/);
  });

  it('requires an exact Academic web origin and explicit absolute storage paths in production', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        IDENTITY_ISSUER: 'https://identity.example.test',
        IDENTITY_JWKS_URI:
          'https://identity.example.test/.well-known/jwks.json',
        IDENTITY_INTERNAL_BASE_URL: 'https://identity.internal.test',
        ACADEMIC_PUBLIC_BASE_URL: 'https://academico.example.test',
        ACADEMIC_RESEND_API_KEY: 'synthetic-resend-key',
        ACADEMIC_TRUSTED_WEB_ORIGINS: '*',
        STORAGE_MIN_FREE_BYTES: '1073741824',
        STORAGE_MIN_FREE_PERCENTAGE: '5',
        STORAGE_ROOT: '/var/lib/edupay-academico/files',
        STORAGE_TEMP_ROOT: '/var/lib/edupay-academico/tmp',
      }),
    ).toThrow(/ACADEMIC_TRUSTED_WEB_ORIGINS/);

    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        IDENTITY_ISSUER: 'https://identity.example.test',
        IDENTITY_JWKS_URI:
          'https://identity.example.test/.well-known/jwks.json',
        IDENTITY_INTERNAL_BASE_URL: 'https://identity.internal.test',
        ACADEMIC_PUBLIC_BASE_URL: 'https://academico.example.test',
        ACADEMIC_RESEND_API_KEY: 'synthetic-resend-key',
        ACADEMIC_TRUSTED_WEB_ORIGINS: 'https://academico.example.test',
        ACADEMIC_MALWARE_SCANNER: 'fake',
        STORAGE_MIN_FREE_BYTES: '1073741824',
        STORAGE_MIN_FREE_PERCENTAGE: '5',
        STORAGE_ROOT: 'relative/files',
        STORAGE_TEMP_ROOT: 'relative/tmp',
      }),
    ).toThrow(/STORAGE_ROOT/);
  });

  it('requires ClamAV configuration in production and rejects the fake scanner', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        IDENTITY_ISSUER: 'https://identity.example.test',
        IDENTITY_JWKS_URI:
          'https://identity.example.test/.well-known/jwks.json',
        IDENTITY_INTERNAL_BASE_URL: 'https://identity.internal.test',
        ACADEMIC_PUBLIC_BASE_URL: 'https://academico.example.test',
        ACADEMIC_RESEND_API_KEY: 'synthetic-resend-key',
        ACADEMIC_TRUSTED_WEB_ORIGINS: 'https://academico.example.test',
        ACADEMIC_MALWARE_SCANNER: 'fake',
        STORAGE_MIN_FREE_BYTES: '1073741824',
        STORAGE_MIN_FREE_PERCENTAGE: '5',
        STORAGE_ROOT: '/var/lib/edupay-academico/files',
        STORAGE_TEMP_ROOT: '/var/lib/edupay-academico/tmp',
      }),
    ).toThrow(/production requires.*clamav/);

    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        IDENTITY_ISSUER: 'https://identity.example.test',
        IDENTITY_JWKS_URI:
          'https://identity.example.test/.well-known/jwks.json',
        IDENTITY_INTERNAL_BASE_URL: 'https://identity.internal.test',
        ACADEMIC_PUBLIC_BASE_URL: 'https://academico.example.test',
        ACADEMIC_RESEND_API_KEY: 'synthetic-resend-key',
        ACADEMIC_TRUSTED_WEB_ORIGINS: 'https://academico.example.test',
        ACADEMIC_MALWARE_SCANNER: 'clamav',
        STORAGE_MIN_FREE_BYTES: '1073741824',
        STORAGE_MIN_FREE_PERCENTAGE: '5',
        STORAGE_ROOT: '/var/lib/edupay-academico/files',
        STORAGE_TEMP_ROOT: '/var/lib/edupay-academico/tmp',
      }),
    ).toThrow(/ACADEMIC_CLAMAV_HOST/);
  });

  it('rejects symmetric, unsigned, and excessive clock-skew configuration', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        IDENTITY_JWT_ALGORITHMS: 'HS256,none',
      }),
    ).toThrow(/approved asymmetric algorithms/);
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        IDENTITY_CLOCK_SKEW_SECONDS: '121',
      }),
    ).toThrow(/<=120/);
  });

  it('rejects unsafe internal Identity base URLs', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        IDENTITY_INTERNAL_BASE_URL:
          'https://service-token@identity.local?token=unsafe',
      }),
    ).toThrow(/IDENTITY_INTERNAL_BASE_URL/);
  });

  it('requires an Identity-compatible high-entropy service token shape', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        IDENTITY_INTERNAL_SERVICE_TOKEN: 'human-password',
      }),
    ).toThrow(/IDENTITY_INTERNAL_SERVICE_TOKEN/);
  });

  it('requires the server-only EduPay origin and token in production', () => {
    expect(validateEnvironment(validProductionEnvironment)).toMatchObject({
      EDUPAY_INTEGRATION_BASE_URL: 'https://edupay.internal.test',
      EDUPAY_INTEGRATION_TIMEOUT_MS: 5000,
      EDUPAY_SYNC_INCREMENTAL_INTERVAL_MINUTES: 60,
      EDUPAY_SYNC_FULL_HOUR_UTC: 2,
    });
    expect(() =>
      validateEnvironment({
        ...validProductionEnvironment,
        EDUPAY_INTEGRATION_TOKEN: '',
      }),
    ).toThrow(/EDUPAY_INTEGRATION_TOKEN/);
    expect(() =>
      validateEnvironment({
        ...validProductionEnvironment,
        EDUPAY_INTEGRATION_BASE_URL: 'https://edupay.internal.test/path',
      }),
    ).toThrow(/exact HTTP\(S\) origin/);
  });

  it('requires HTTPS for EduPay unless private HTTP is explicitly approved', () => {
    expect(() =>
      validateEnvironment({
        ...validProductionEnvironment,
        EDUPAY_INTEGRATION_BASE_URL: 'http://edupay.private.test',
      }),
    ).toThrow(/unless private HTTP is explicitly approved/);
    expect(
      validateEnvironment({
        ...validProductionEnvironment,
        EDUPAY_INTEGRATION_BASE_URL: 'http://edupay.private.test',
        EDUPAY_INTEGRATION_ALLOW_PRIVATE_HTTP: 'true',
      }),
    ).toMatchObject({
      EDUPAY_INTEGRATION_BASE_URL: 'http://edupay.private.test',
      EDUPAY_INTEGRATION_ALLOW_PRIVATE_HTTP: true,
    });
  });
});
