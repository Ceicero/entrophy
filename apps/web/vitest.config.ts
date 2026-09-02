import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Vitest config for the website's unit tests. Scoped to `test/**` and `src/**` `*.test.ts`
 * files (matching every other package's convention, see apps/dashboard/vitest.config.ts) so
 * vitest's default glob never picks up `e2e/**` — those are Playwright specs run separately via
 * `pnpm test:e2e`, and calling their `test.describe()` outside the Playwright runner throws.
 *
 * The `@/*` alias mirrors `tsconfig.json`'s `paths` entry. Next.js resolves that alias itself
 * (it reads tsconfig `paths` directly), but Vite/Vitest doesn't pick up tsconfig `paths`
 * automatically, so it needs restating here — otherwise importing the moved dashboard code
 * (which uses `@/lib/dashboard/...` / `@/components/dashboard/...`, see the dashboard→web merge)
 * resolves fine under `tsc`/`next build` but fails at test runtime.
 *
 * `esbuild.jsx: 'automatic'` matches how Next's own SWC compiler transforms every `.tsx` file in this app
 * (tsconfig's `"jsx": "preserve"` just defers the transform to Next, which defaults to the automatic
 * runtime) — none of them `import React from 'react'`, relying on the automatic runtime's implicit
 * `jsx-runtime` import instead. Without this, vitest's default esbuild transform falls back to the classic
 * runtime, which compiles JSX to bare `React.createElement(...)` calls and throws `React is not defined` the
 * moment a test actually invokes one of those components (rather than just importing it for its exports).
 */
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
  },
});
