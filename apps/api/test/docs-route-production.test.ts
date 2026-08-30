import { beforeAll, describe, expect, it } from 'vitest';

// `@entrophy/core`'s `env` (and the `isProduction` flag derived from it) is parsed once, the moment the module
// is first imported, from whatever `process.env` holds at that instant. Vitest gives every test *file* an
// isolated module registry (default `pool: 'threads'`, `isolate: true`), so setting `process.env.NODE_ENV` here
// only affects this file — but only if we avoid any *static* import that transitively pulls in `@entrophy/core`
// (ES module imports are always evaluated before the importing module's own top-level statements run,
// regardless of where the `import` appears in the file). `vitest` itself doesn't import `@entrophy/core`, so
// it's safe to import statically; `./helpers/build-test-app` (which does, via `../../src/app`) is imported
// dynamically in `beforeAll`, after the env var below is set. Same pattern as donations-enabled.test.ts.
process.env.NODE_ENV = 'production';

let buildTestApp: typeof import('./helpers/build-test-app').buildTestApp;

beforeAll(async () => {
  ({ buildTestApp } = await import('./helpers/build-test-app'));
});

// Publicly documenting the exact request/response shape of every endpoint (including public, unauthenticated
// ones like `/donations/checkout`) is a gift to anyone probing for abuse — `app.ts` never registers
// `@fastify/swagger`/`@fastify/swagger-ui` when `NODE_ENV=production`, so `/docs` falls through to the app's
// normal 404 handler instead of existing at all.
describe('GET /docs (Swagger UI) in production', () => {
  it('404s — the Swagger UI is never registered when NODE_ENV=production', async () => {
    const { app } = await buildTestApp();

    const res = await app.inject({ method: 'GET', url: '/docs' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'not_found' } });

    await app.close();
  });
});
