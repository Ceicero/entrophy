import { afterEach, describe, expect, it } from 'vitest';
import { supportServerUrl } from '../src/lib/site';

describe('supportServerUrl', () => {
  const original = process.env.NEXT_PUBLIC_SUPPORT_SERVER_URL;

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_SUPPORT_SERVER_URL;
    else process.env.NEXT_PUBLIC_SUPPORT_SERVER_URL = original;
  });

  it('returns null when unset, so callers can render nothing instead of a broken link', () => {
    delete process.env.NEXT_PUBLIC_SUPPORT_SERVER_URL;
    expect(supportServerUrl()).toBeNull();
  });

  it('returns null when set to an empty/whitespace-only string', () => {
    process.env.NEXT_PUBLIC_SUPPORT_SERVER_URL = '   ';
    expect(supportServerUrl()).toBeNull();
  });

  it('returns the configured invite URL unchanged', () => {
    process.env.NEXT_PUBLIC_SUPPORT_SERVER_URL = 'https://discord.gg/example';
    expect(supportServerUrl()).toBe('https://discord.gg/example');
  });
});
