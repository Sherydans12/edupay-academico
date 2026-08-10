import { describe, expect, it } from 'vitest';

import { validateClientEnvironment } from './environment';

describe('validateClientEnvironment', () => {
  it('accepts the versioned API base URL', () => {
    expect(
      validateClientEnvironment({
        NEXT_PUBLIC_API_BASE_URL: 'http://localhost:3001/api/v1',
        NEXT_PUBLIC_IDENTITY_BASE_URL: 'http://localhost:3000',
      }),
    ).toEqual({
      NEXT_PUBLIC_API_BASE_URL: 'http://localhost:3001/api/v1',
      NEXT_PUBLIC_IDENTITY_BASE_URL: 'http://localhost:3000',
    });
  });

  it('fails when the API base URL is absent', () => {
    expect(() => validateClientEnvironment({})).toThrow(
      /Client environment validation failed/,
    );
  });

  it('rejects an Identity URL with an application path', () => {
    expect(() => validateClientEnvironment({
      NEXT_PUBLIC_API_BASE_URL: 'http://localhost:3001/api/v1',
      NEXT_PUBLIC_IDENTITY_BASE_URL: 'https://identity.example.test/api/v1',
    })).toThrow(/NEXT_PUBLIC_IDENTITY_BASE_URL/);
  });

  it('requires HTTPS for both public browser-facing services in production', () => {
    expect(() => validateClientEnvironment({
      NODE_ENV: 'production',
      NEXT_PUBLIC_API_BASE_URL: 'http://academico.example.test/api/v1',
      NEXT_PUBLIC_IDENTITY_BASE_URL: 'https://identity.example.test',
    })).toThrow(/NEXT_PUBLIC_API_BASE_URL/);

    expect(() => validateClientEnvironment({
      NODE_ENV: 'production',
      NEXT_PUBLIC_API_BASE_URL: 'https://academico.example.test/api/v1',
      NEXT_PUBLIC_IDENTITY_BASE_URL: 'http://identity.example.test',
    })).toThrow(/NEXT_PUBLIC_IDENTITY_BASE_URL/);
  });
});
