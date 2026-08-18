import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    // Building the Fastify app per test file (plugins + swagger + route registration) is slow on cold/loaded
    // machines and CI runners; the defaults (5s/10s) produced spurious timeouts, not real failures. Hooks that
    // dynamically import the whole app (e.g. donations-enabled.test.ts) can exceed 30s when every file in the
    // suite is transforming in parallel, so they get extra headroom.
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
