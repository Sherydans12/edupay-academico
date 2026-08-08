import { describe, expect, it } from 'vitest';

import { validateClientEnvironment } from './environment';

describe('validateClientEnvironment', () => {
  it('accepts the versioned API base URL', () => {
    expect(
      validateClientEnvironment({
        NEXT_PUBLIC_API_BASE_URL: 'http://localhost:3001/api/v1',
      }),
    ).toEqual({
      NEXT_PUBLIC_API_BASE_URL: 'http://localhost:3001/api/v1',
    });
  });

  it('fails when the API base URL is absent', () => {
    expect(() => validateClientEnvironment({})).toThrow(
      /Client environment validation failed/,
    );
  });
});
