import { beforeAll, describe, expect, it, vi } from 'vitest';

// This file is the "Stripe configured, CAPTCHA NOT configured" case — donations must still be reported/treated
// as unavailable, because `POST /checkout` requires BOTH to be configured (see routes/donations.ts's file
// header — the 2026-08-26 card-testing incident). `test/setup.ts` configures a Turnstile provider by default;
// this file overrides `CAPTCHA_PROVIDER` back to 'none' so `resolveProvider()` returns null here. Same
// lazy-evaluation reasoning as `donations-enabled.test.ts`: env vars are set before any static import that
// transitively pulls in `@entrophy/core`, and `./helpers/build-test-app` is imported dynamically in `beforeAll`.
process.env.STRIPE_SECRET_KEY = 'sk_test_donations_captcha_unavailable';
process.env.WEB_URL = 'http://localhost:3003';
process.env.CAPTCHA_PROVIDER = 'none';

// `resolveProvider()` returning null must short-circuit the checkout handler before it ever reaches CAPTCHA
// verification or Stripe. Both mocks throw instead of just recording calls, so an ordering regression becomes
// an obvious test failure instead of a silent real network call.
vi.mock('../src/lib/captcha', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/captcha')>();
  return {
    ...actual,
    siteverify: vi.fn(async () => {
      throw new Error('siteverify must not be called when no CAPTCHA provider is configured');
    }),
  };
});

vi.mock('stripe', () => {
  class FakeStripe {
    checkout = {
      sessions: {
        create: vi.fn(async () => {
          throw new Error('Stripe must not be called when no CAPTCHA provider is configured');
        }),
      },
    };
    constructor(public secretKey: string) {}
  }
  return { default: FakeStripe };
});

let buildTestApp: typeof import('./helpers/build-test-app').buildTestApp;

beforeAll(async () => {
  ({ buildTestApp } = await import('./helpers/build-test-app'));
});

describe('GET /donations/presets (Stripe configured, CAPTCHA not configured)', () => {
  it('reports enabled:false with a null captchaProvider/captchaSiteKey', async () => {
    const { app } = await buildTestApp();

    const res = await app.inject({ method: 'GET', url: '/donations/presets' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      enabled: false,
      captchaProvider: null,
      captchaSiteKey: null,
    });

    await app.close();
  });
});

describe('POST /donations/checkout (Stripe configured, CAPTCHA not configured)', () => {
  it('returns 503 donations_unavailable even though Stripe is configured', async () => {
    const { app, prismaCalls } = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/donations/checkout',
      payload: { amountCents: 500, currency: 'usd', captchaToken: 'some-token' },
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('donations_unavailable');
    expect(prismaCalls.some((c) => c.model === 'donation')).toBe(false);

    await app.close();
  });
});
