import { vi } from 'vitest';
import { describe, expect, it } from 'vitest';

import HomePage from './page';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

describe('HomePage', () => {
  it('routes the entry point to the student demonstration workspace', async () => {
    HomePage();

    const { redirect } = await import('next/navigation');
    expect(redirect).toHaveBeenCalledWith('/estudiante');
  });
});
