import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    hookTimeout: 30_000,
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    pool: 'forks',
    fileParallelism: false,
  },
});
