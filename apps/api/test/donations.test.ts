import { describe, expect, it } from 'vitest';
import { env } from '@entrophy/core';
import { buildTestApp } from './helpers/build-test-app';

// This file intentionally relies on the default test env (`test/setup.ts` never sets `STRIPE_SECRET_KEY`), so
// donations are "unavailable" here. The "Stripe configured" happy path lives in `donations-enabled.test.ts`,
// which sets `STRIPE_SECRET_KEY`/`WEB_URL` and mocks the `stripe` module before anything imports `@entrophy/core`.
describe('GET /donations/presets (Stripe not configured)', () => {
  it('reports enabled:false and the configured min/max/preset amounts', async () => {
    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
    const { app } = await buildTestApp();

    const res = await app.inject({ method: 'GET', url: '/donations/presets' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      enabled: false,
      currency: 'usd',
      presetsCents: [300, 500, 1000, 2500, 5000],
      minCents: env.DONATION_MIN_CENTS,
      maxCents: env.DONATION_MAX_CENTS,
    });

    await app.close();
  });
});

describe('POST /donations/checkout (Stripe not configured)', () => {
  it('rejects an amount below DONATION_MIN_CENTS with 400 before checking Stripe availability', async () => {
    const { app } = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/donations/checkout',
      payload: { amountCents: env.DONATION_MIN_CENTS - 1, currency: 'usd' },
    });

    expect(res.statusCode).toBe(400);

    await app.close();
  });

  it('rejects an amount above DONATION_MAX_CENTS with 400', async () => {
    const { app } = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/donations/checkout',
      payload: { amountCents: env.DONATION_MAX_CENTS + 1, currency: 'usd' },
    });

    expect(res.statusCode).toBe(400);

    await app.close();
  });

  it('rejects a non-integer or non-positive amountCents at the schema level', async () => {
    const { app } = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/donations/checkout',
      payload: { amountCents: 12.5, currency: 'usd' },
    });

    expect(res.statusCode).toBe(400);

    await app.close();
  });

  it('rejects a non-usd currency at the schema level', async () => {
    const { app } = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/donations/checkout',
      payload: { amountCents: 1000, currency: 'eur' },
    });

    expect(res.statusCode).toBe(400);

    await app.close();
  });

  it('returns 503 donations_unavailable for an in-range amount when STRIPE_SECRET_KEY is unset', async () => {
    const { app, prismaCalls } = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/donations/checkout',
      payload: { amountCents: 1000, currency: 'usd' },
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('donations_unavailable');
    // No Donation row should be created when checkout can't proceed.
    expect(prismaCalls.some((c) => c.model === 'donation')).toBe(false);

    await app.close();
  });
});
