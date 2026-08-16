import { defineConfig } from 'vitest/config';

/**
 * Vitest config for the dashboard's unit tests. Scoped to `test/**` and `src/**` `*.test.ts`
 * files (matching every other package's convention) so vitest's default glob never picks up
 * `e2e/**` — those are Playwright specs run separately via `pnpm test:e2e`, and calling their
 * `test.describe()` outside the Playwright runner throws.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
  },
});
