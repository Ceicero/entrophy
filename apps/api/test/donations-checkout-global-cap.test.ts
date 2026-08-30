import { beforeAll, describe, expect, it } from 'vitest';

// `env.DONATION_MAX_PER_HOUR` is read once at import time (see packages/core/src/env.ts), so it must be set
// before any static import that transitively pulls in `@entrophy/core` — same env-override pattern as
// donations-enabled.test.ts. Set small here so the test doesn't need to send real per-hour volumes.
process.env.DONATION_MAX_PER_HOUR = '3';

let buildTestApp: typeof import('./helpers/build-test-app').buildTestApp;

beforeAll(async () => {
  ({ buildTestApp } = await import('./helpers/build-test-app'));
});

// Every request below is deliberately missing `captchaToken`, so it 400s at Fastify's schema-validation layer
// before the route handler (and therefore `siteverify`, which would otherwise make a real network call) ever
// runs. That's fine for this test: the global cap hook in app.ts runs at `onRequest`, before body parsing and
// schema validation, so it counts every attempt at the route regardless of how the request later fails or
// succeeds — exactly like the real incident, where Stripe attempts the card charge at Checkout Session creation
// time, so a "failed" checkout is still a live card-testing probe.
function attempt(app: Awaited<ReturnType<typeof buildTestApp>>['app'], forwardedFor?: string) {
  return app.inject({
    method: 'POST',
    url: '/donations/checkout',
    headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
    payload: { amountCents: 500, currency: 'usd' },
  });
}

// Regression test for the 2026-08-26 incident: an attacker made ~125 unauthenticated `POST /checkout` calls,
// defeating the per-IP rate limit (10/min, set in donations.ts) by rotating IPs/`X-Forwarded-For` on every
// request. `DONATION_MAX_PER_HOUR` (enforced in app.ts, backed by `packages/core/src/ratelimit.ts`'s Redis
// `RateLimiter`) is a single shared ceiling across ALL callers combined, keyed on nothing but the route itself —
// so it MUST still trip even when no two requests share an apparent source IP.
describe('POST /donations/checkout — global hourly cap (2026-08-26 card-testing regression)', () => {
  it('trips after DONATION_MAX_PER_HOUR attempts even when every attempt claims a different X-Forwarded-For', async () => {
    const { app } = await buildTestApp();

    // 3 attempts (== DONATION_MAX_PER_HOUR), each from a distinct apparent IP, are let through by the global cap.
    const first = await attempt(app, '1.1.1.1');
    const second = await attempt(app, '2.2.2.2');
    const third = await attempt(app, '3.3.3.3');
    for (const res of [first, second, third]) {
      expect(res.statusCode).not.toBe(429);
    }

    // A 4th attempt, from yet another brand-new IP, is rejected by the GLOBAL cap — proving it's the shared
    // bucket (not a per-IP counter, which a 4th distinct IP would never trip on its own) that fired.
    const fourth = await attempt(app, '4.4.4.4');
    expect(fourth.statusCode).toBe(429);
    expect(fourth.json()).toEqual({ error: { code: 'rate_limited', message: 'Rate limit exceeded.' } });

    // A 5th attempt, again from a brand-new IP, is also rejected — the cap doesn't reset per caller.
    const fifth = await attempt(app, '5.5.5.5');
    expect(fifth.statusCode).toBe(429);

    await app.close();
  });

  it('does not affect other routes — only POST /donations/checkout is capped', async () => {
    const { app } = await buildTestApp();

    for (let i = 0; i < 3; i++) {
      await attempt(app, `10.0.0.${i}`);
    }
    const capped = await attempt(app, '10.0.0.99');
    expect(capped.statusCode).toBe(429);

    // GET /donations/presets is a different route and is unaffected by the checkout-only cap.
    const presets = await app.inject({ method: 'GET', url: '/donations/presets' });
    expect(presets.statusCode).toBe(200);

    await app.close();
  });
});
