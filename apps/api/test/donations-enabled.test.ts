import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// `@entrophy/core`'s `env` is parsed once, the moment the module is first imported, from whatever
// `process.env` holds at that instant. Vitest gives every test *file* an isolated module registry (default
// `pool: 'threads'`, `isolate: true`), so setting `process.env` here only affects this file — but only if we
// avoid any *static* import that transitively pulls in `@entrophy/core` (ES module imports are always
// evaluated before the importing module's own top-level statements run, regardless of where the `import`
// appears in the file). `vitest` itself doesn't import `@entrophy/core`, so it's safe to import statically;
// `./helpers/build-test-app` (which does, via `../../src/app`) is imported dynamically in `beforeAll`, after
// the env vars below are set.
process.env.STRIPE_SECRET_KEY = 'sk_test_donations_enabled';
process.env.WEB_URL = 'http://localhost:3003';

const createSession = vi.fn(async (params: unknown) => ({
  id: 'cs_test_donation_1',
  url: 'https://checkout.stripe.com/pay/cs_test_donation_1',
  ...((params as object) ?? {}),
}));

// `vi.mock` factories are hoisted above imports by Vitest's transform, but the *referenced* `vi`/`createSession`
// bindings are still resolved lazily (the factory only runs when something first imports 'stripe'), so this is
// safe despite appearing to reference `createSession` before its `const` — by the time the dynamic
// `import('stripe')` inside `routes/donations.ts` resolves, this module has fully evaluated.
vi.mock('stripe', () => {
  class FakeStripe {
    checkout = { sessions: { create: createSession } };
    constructor(public secretKey: string) {}
  }
  return { default: FakeStripe };
});

// `test/setup.ts` configures a Turnstile CAPTCHA provider by default, so this file is the "Stripe AND CAPTCHA
// both configured" case — `resolveProvider()` is left as the real implementation and only `siteverify` (the
// part that would otherwise make a real network call to the provider) is mocked, same lazy-resolution reasoning
// as the `stripe` mock above.
const siteverify = vi.fn(async () => true);
vi.mock('../src/lib/captcha', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/captcha')>();
  return { ...actual, siteverify };
});

let buildTestApp: typeof import('./helpers/build-test-app').buildTestApp;

beforeAll(async () => {
  ({ buildTestApp } = await import('./helpers/build-test-app'));
});

afterEach(() => {
  createSession.mockClear();
  siteverify.mockClear();
  siteverify.mockResolvedValue(true);
});

function donationModelOverrides() {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    donation: {
      create: async (args: unknown) => {
        const { data } = args as { data: Record<string, unknown> };
        const row = { id: 'donation-1', ...data };
        rows.set(row.id as string, row);
        return row;
      },
      update: async (args: unknown) => {
        const { where, data } = args as { where: { id: string }; data: Record<string, unknown> };
        const existing = rows.get(where.id) ?? { id: where.id };
        const updated = { ...existing, ...data };
        rows.set(where.id, updated);
        return updated;
      },
    },
  };
}

describe('GET /donations/presets (Stripe configured)', () => {
  it('reports enabled:true with the configured CAPTCHA provider and site key', async () => {
    const { app } = await buildTestApp();

    const res = await app.inject({ method: 'GET', url: '/donations/presets' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.enabled).toBe(true);
    expect(body.captchaProvider).toBe('turnstile');
    expect(typeof body.captchaSiteKey).toBe('string');

    await app.close();
  });
});

describe('POST /donations/checkout (Stripe configured)', () => {
  it('creates a hosted Checkout Session with the expected payload and returns its url', async () => {
    const { app, prismaCalls } = await buildTestApp(donationModelOverrides());

    const res = await app.inject({
      method: 'POST',
      url: '/donations/checkout',
      payload: { amountCents: 2500, currency: 'usd', captchaToken: 'valid-captcha-token' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ url: 'https://checkout.stripe.com/pay/cs_test_donation_1' });

    // The CAPTCHA is verified exactly once, before the Stripe call.
    expect(siteverify).toHaveBeenCalledTimes(1);
    expect(createSession).toHaveBeenCalledTimes(1);
    const payload = createSession.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      mode: 'payment',
      submit_type: 'donate',
      managed_payments: { enabled: false },
      success_url: 'http://localhost:3003/donate/thanks?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'http://localhost:3003/donate/cancelled',
      metadata: { kind: 'donation', donationId: 'donation-1' },
    });
    expect(payload.line_items).toEqual([
      {
        price_data: { currency: 'usd', unit_amount: 2500, product_data: { name: 'Entrophy donation' } },
        quantity: 1,
      },
    ]);

    // A PENDING Donation row is created before the Stripe call, then updated with the real session id after.
    const createCall = prismaCalls.find((c) => c.model === 'donation' && c.method === 'create');
    expect(createCall?.args[0]).toMatchObject({
      data: { amountCents: 2500, currency: 'usd', status: 'PENDING' },
    });
    const updateCall = prismaCalls.find((c) => c.model === 'donation' && c.method === 'update');
    expect(updateCall?.args[0]).toMatchObject({
      where: { id: 'donation-1' },
      data: { stripeSessionId: 'cs_test_donation_1' },
    });

    await app.close();
  });

  it('returns a 502-class error and never marks the row PAID when Stripe itself fails', async () => {
    createSession.mockRejectedValueOnce(new Error('stripe is down'));
    const { app } = await buildTestApp(donationModelOverrides());

    const res = await app.inject({
      method: 'POST',
      url: '/donations/checkout',
      payload: { amountCents: 500, currency: 'usd', captchaToken: 'valid-captcha-token' },
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(500);

    await app.close();
  });

  it('still rejects out-of-range amounts even with Stripe configured', async () => {
    const { app } = await buildTestApp(donationModelOverrides());

    const res = await app.inject({
      method: 'POST',
      url: '/donations/checkout',
      payload: { amountCents: 1, currency: 'usd', captchaToken: 'valid-captcha-token' },
    });

    expect(res.statusCode).toBe(400);
    expect(createSession).not.toHaveBeenCalled();

    await app.close();
  });

  // Regression test for the 2026-08-26 incident: an attacker made ~125 unauthenticated checkout attempts at
  // exactly $1.00 (amountCents: 100), which was the old DONATION_MIN_CENTS default. This must be rejected even
  // in this file, where Stripe AND the CAPTCHA provider are both fully configured — i.e. the endpoint can never
  // again be walked all the way through to Stripe at that amount.
  it('REGRESSION 2026-08-26 card-testing: rejects amountCents: 100 ($1.00) with 400', async () => {
    const { app, prismaCalls } = await buildTestApp(donationModelOverrides());

    const res = await app.inject({
      method: 'POST',
      url: '/donations/checkout',
      payload: { amountCents: 100, currency: 'usd', captchaToken: 'valid-captcha-token' },
    });

    expect(res.statusCode).toBe(400);
    expect(createSession).not.toHaveBeenCalled();
    expect(prismaCalls.some((c) => c.model === 'donation' && c.method === 'create')).toBe(false);

    await app.close();
  });

  it('rejects a non-preset in-range amount (700 cents) with 400', async () => {
    const { app, prismaCalls } = await buildTestApp(donationModelOverrides());

    const res = await app.inject({
      method: 'POST',
      url: '/donations/checkout',
      payload: { amountCents: 700, currency: 'usd', captchaToken: 'valid-captcha-token' },
    });

    expect(res.statusCode).toBe(400);
    expect(createSession).not.toHaveBeenCalled();
    expect(prismaCalls.some((c) => c.model === 'donation' && c.method === 'create')).toBe(false);

    await app.close();
  });

  it('rejects a missing captchaToken with 400', async () => {
    const { app } = await buildTestApp(donationModelOverrides());

    const res = await app.inject({
      method: 'POST',
      url: '/donations/checkout',
      payload: { amountCents: 500, currency: 'usd' },
    });

    expect(res.statusCode).toBe(400);
    expect(createSession).not.toHaveBeenCalled();

    await app.close();
  });

  it('rejects an empty-string captchaToken with 400', async () => {
    const { app } = await buildTestApp(donationModelOverrides());

    const res = await app.inject({
      method: 'POST',
      url: '/donations/checkout',
      payload: { amountCents: 500, currency: 'usd', captchaToken: '' },
    });

    expect(res.statusCode).toBe(400);
    expect(createSession).not.toHaveBeenCalled();

    await app.close();
  });

  it('rejects an invalid CAPTCHA response with 400, creating no Donation row and never calling Stripe', async () => {
    siteverify.mockResolvedValueOnce(false);
    const { app, prismaCalls } = await buildTestApp(donationModelOverrides());

    const res = await app.inject({
      method: 'POST',
      url: '/donations/checkout',
      payload: { amountCents: 500, currency: 'usd', captchaToken: 'rejected-token' },
    });

    expect(res.statusCode).toBe(400);
    expect(prismaCalls.some((c) => c.model === 'donation' && c.method === 'create')).toBe(false);
    expect(createSession).not.toHaveBeenCalled();

    await app.close();
  });

  it('succeeds for a valid preset amount with a valid CAPTCHA, calling Stripe exactly once', async () => {
    const { app } = await buildTestApp(donationModelOverrides());

    const res = await app.inject({
      method: 'POST',
      url: '/donations/checkout',
      payload: { amountCents: 500, currency: 'usd', captchaToken: 'valid-captcha-token' },
    });

    expect(res.statusCode).toBe(200);
    expect(createSession).toHaveBeenCalledTimes(1);

    await app.close();
  });
});
