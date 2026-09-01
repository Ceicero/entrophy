import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchDonationConfig } from '../src/lib/donations';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchDonationConfig', () => {
  it('degrades to disabled when the API is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network down'))),
    );

    const config = await fetchDonationConfig();

    expect(config.enabled).toBe(false);
    expect(config.kofiUrl).toBeNull();
  });

  it('degrades to disabled on a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 500 }))),
    );

    const config = await fetchDonationConfig();

    expect(config.enabled).toBe(false);
    expect(config.kofiUrl).toBeNull();
  });

  it('returns the API response unchanged when enabled', async () => {
    const apiResponse = {
      enabled: true,
      kofiUrl: 'https://ko-fi.com/example',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(apiResponse), { status: 200 }))),
    );

    const config = await fetchDonationConfig();

    expect(config).toEqual(apiResponse);
  });
});
