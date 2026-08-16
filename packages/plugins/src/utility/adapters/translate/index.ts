import type { EnvLike } from '../../../sdk';
import { DeeplTranslateAdapter } from './deepl';
import { LibreTranslateAdapter } from './libretranslate';
import type { TranslateAdapter } from './types';

export * from './types';
export { DeeplTranslateAdapter } from './deepl';
export { LibreTranslateAdapter } from './libretranslate';

export interface TranslateEnv extends EnvLike {
  TRANSLATE_PROVIDER?: string;
  DEEPL_API_KEY?: string;
  LIBRETRANSLATE_URL?: string;
  LIBRETRANSLATE_API_KEY?: string;
}

/**
 * Selects the configured translate adapter from env, or `null` if translation isn't configured
 * (`TRANSLATE_PROVIDER` unset/`none`, or the selected provider is missing its required env var).
 */
export function getTranslateAdapter(env: TranslateEnv, fetchImpl: typeof fetch = fetch): TranslateAdapter | null {
  const provider = (env.TRANSLATE_PROVIDER ?? 'none').toLowerCase();

  if (provider === 'deepl') {
    if (!env.DEEPL_API_KEY) return null;
    return new DeeplTranslateAdapter(env.DEEPL_API_KEY, fetchImpl);
  }

  if (provider === 'libretranslate') {
    if (!env.LIBRETRANSLATE_URL) return null;
    return new LibreTranslateAdapter(env.LIBRETRANSLATE_URL, env.LIBRETRANSLATE_API_KEY, fetchImpl);
  }

  return null;
}
