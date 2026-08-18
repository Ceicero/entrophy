import { defineConfig } from 'vitest/config';

/** Vitest config for `@entrophy/ui`. Needs jsdom (not the workspace-default `node` env) because
 * these are React component render tests. */
export default defineConfig({
  test: {
    environment: 'jsdom',
  },
});
