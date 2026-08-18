import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    // Building the Fastify app per test file (plugins + swagger + route registration) is slow on cold/loaded
    // machines and CI runners; the defaults (5s/10s) produced spurious timeouts, not real failures.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
