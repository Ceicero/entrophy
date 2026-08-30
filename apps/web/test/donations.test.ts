import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchDonationPresets } from '../src/lib/donations';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchDonationPresets', () => {
  it('degrades to a fail-closed "unavailable" shape (matching the API\'s own shape) when the API is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network down'))),
    );

    const presets = await fetchDonationPresets();

    // `enabled: false` is the correct fail-closed default — donations must never render a live form when the
    // API can't be reached to confirm Stripe + CAPTCHA are actually configured.
    expect(presets.enabled).toBe(false);
    expect(presets.captchaProvider).toBeNull();
    expect(presets.captchaSiteKey).toBeNull();
    expect(presets.currency).toBe('usd');
    expect(presets.presetsCents).toEqual([500, 1000, 2500, 5000]);
    expect(presets.minCents).toBe(500);
  });

  it('degrades the same way on a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 500 }))),
    );

    const presets = await fetchDonationPresets();

    expect(presets.enabled).toBe(false);
    expect(presets.captchaProvider).toBeNull();
    expect(presets.captchaSiteKey).toBeNull();
  });

  it('passes through the real API response shape unchanged, including CAPTCHA fields', async () => {
    const apiResponse = {
      enabled: true,
      currency: 'usd' as const,
      presetsCents: [500, 1000, 2500, 5000],
      minCents: 500,
      maxCents: 50000,
      captchaProvider: 'turnstile' as const,
      captchaSiteKey: 'test-site-key',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(apiResponse), { status: 200 }))),
    );

    const presets = await fetchDonationPresets();

    expect(presets).toEqual(apiResponse);
  });
});
