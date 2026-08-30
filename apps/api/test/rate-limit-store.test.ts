import { describe, expect, it } from 'vitest';
import { buildTestApp } from './helpers/build-test-app';

// `app.ts` now backs `@fastify/rate-limit` with Redis (`deps.redis`, `ioredis-mock` in tests) instead of the
// plugin's default in-process `LocalStore` — see the comment on that registration in app.ts for why. This test
// exists to prove that swap didn't change per-route rate-limiting behavior: `GET /auth/discord/login` still
// enforces its existing 20/min limit (`AUTH_ROUTE_RATE_LIMIT` in routes/auth.ts) and still produces the same
// 429 response shape as before.
describe('per-route rate limiting after the Redis store swap', () => {
  it('GET /auth/discord/login still enforces its existing 20/min limit and 429s in the standard shape', async () => {
    const { app } = await buildTestApp();

    const responses = [];
    for (let i = 0; i < 21; i++) {
      responses.push(await app.inject({ method: 'GET', url: '/auth/discord/login' }));
    }

    const allowed = responses.slice(0, 20);
    const blocked = responses[20];

    expect(allowed.every((res) => res.statusCode === 302)).toBe(true);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toEqual({ error: { code: 'rate_limited', message: 'Rate limit exceeded.' } });

    await app.close();
  });

  it('GET /health is exempt from rate limiting (config: { rateLimit: false }), unaffected by the store swap', async () => {
    const { app } = await buildTestApp();

    for (let i = 0; i < 25; i++) {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).not.toBe(429);
    }

    await app.close();
  });
});
