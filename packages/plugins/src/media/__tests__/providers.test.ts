import { describe, expect, it } from 'vitest';
import { noneProvider } from '../providers/none';
import { exampleLicensedProvider } from '../providers/example-licensed';
import { isMediaAvailable, resolveMediaProvider } from '../providers/resolve';
import { MediaUnavailableError } from '../errors';

describe('media providers', () => {
  it('noneProvider is never configured and explains why', async () => {
    expect(noneProvider.isConfigured({})).toBe(false);
    await expect(noneProvider.search('x')).rejects.toThrow(MediaUnavailableError);
    await expect(noneProvider.resolve('x')).rejects.toThrow(MediaUnavailableError);
  });

  it('exampleLicensedProvider is a template — never configured even with an API key set', () => {
    expect(exampleLicensedProvider.isConfigured({ EXAMPLE_LICENSED_API_KEY: 'anything' })).toBe(false);
  });

  it('resolveMediaProvider defaults to none when MEDIA_PROVIDER is unset', () => {
    expect(resolveMediaProvider({}).id).toBe('none');
    expect(resolveMediaProvider({ MEDIA_PROVIDER: 'none' }).id).toBe('none');
  });

  it('resolveMediaProvider falls back to none for an unrecognized value', () => {
    expect(resolveMediaProvider({ MEDIA_PROVIDER: 'some-unknown-thing' }).id).toBe('none');
  });

  it('resolveMediaProvider picks a known provider by id', () => {
    expect(resolveMediaProvider({ MEDIA_PROVIDER: 'example-licensed' }).id).toBe('example-licensed');
  });

  it('isMediaAvailable is false for every shipped provider (none is never configured; example-licensed is a template)', () => {
    expect(isMediaAvailable({})).toBe(false);
    expect(isMediaAvailable({ MEDIA_PROVIDER: 'none' })).toBe(false);
    expect(isMediaAvailable({ MEDIA_PROVIDER: 'example-licensed', EXAMPLE_LICENSED_API_KEY: 'x' })).toBe(false);
  });
});
