import { exampleLicensedProvider } from './example-licensed';
import { noneProvider } from './none';
import type { MediaProvider, MediaProviderEnv } from './types';

const PROVIDERS: MediaProvider[] = [noneProvider, exampleLicensedProvider];

/** Picks the `MediaProvider` named by `env.MEDIA_PROVIDER` (unset/unrecognized falls back to `noneProvider`). */
export function resolveMediaProvider(env: MediaProviderEnv): MediaProvider {
  const id = (env.MEDIA_PROVIDER ?? 'none').trim().toLowerCase();
  return PROVIDERS.find((p) => p.id === id) ?? noneProvider;
}

/** True only when the resolved provider is both non-`none` and reports itself configured. */
export function isMediaAvailable(env: MediaProviderEnv): boolean {
  const provider = resolveMediaProvider(env);
  return provider.id !== 'none' && provider.isConfigured(env);
}
