import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    // Screen tests share browser globals and identity adapter seams. Running
    // files serially prevents one workspace fixture from leaking into another.
    fileParallelism: false,
    include: ['src/**/*.spec.{ts,tsx}'],
  },
});
