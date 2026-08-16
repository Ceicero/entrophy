import coreEn from './locales/en.json';

type FlatBundle = Record<string, string>;

// namespace -> locale -> flat ("a.b.c" -> value) bundle
const bundles = new Map<string, Map<string, FlatBundle>>();

/** Recursively flattens a nested locale object into dot-separated keys. */
function flatten(obj: Record<string, unknown>, prefix = ''): FlatBundle {
  const out: FlatBundle = {};
  for (const [key, value] of Object.entries(obj)) {
    const flatKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flatten(value as Record<string, unknown>, flatKey));
    } else {
      out[flatKey] = String(value);
    }
  }
  return out;
}

/**
 * Registers (merging into any existing bundle) a locale bundle for a namespace. Nested objects are flattened
 * to dot keys, e.g. `{ errors: { generic: '...' } }` becomes the key `errors.generic`.
 */
export function registerLocaleBundle(ns: string, locale: string, bundle: Record<string, unknown>): void {
  const flat = flatten(bundle);
  let localeMap = bundles.get(ns);
  if (!localeMap) {
    localeMap = new Map();
    bundles.set(ns, localeMap);
  }
  const existing = localeMap.get(locale) ?? {};
  localeMap.set(locale, { ...existing, ...flat });
}

/** Interpolates `{name}` placeholders in `template` from `vars`; leaves unmatched placeholders untouched. */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

/**
 * Translates `key`. If `key` starts with a registered namespace followed by a dot (e.g. `moderation.errors.x`),
 * that namespace is used and the remainder is looked up; otherwise the `core` namespace is used with the whole
 * key as the path (so core keys are called plainly, e.g. `t('errors.generic')`).
 *
 * Falls back from `locale` to `'en'`, then to the raw `key` itself if no bundle has a translation.
 */
export function t(key: string, vars?: Record<string, string | number>, locale = 'en'): string {
  const firstDot = key.indexOf('.');
  let ns = 'core';
  let path = key;
  if (firstDot !== -1) {
    const candidateNs = key.slice(0, firstDot);
    if (bundles.has(candidateNs)) {
      ns = candidateNs;
      path = key.slice(firstDot + 1);
    }
  }

  const nsMap = bundles.get(ns);
  const template = nsMap?.get(locale)?.[path] ?? nsMap?.get('en')?.[path];
  if (template === undefined) {
    return key;
  }
  return interpolate(template, vars);
}

/**
 * Maps a Discord locale tag (e.g. `en-US`, `pt-BR`, `es-ES`) to a supported bundle locale. `en-US`/`en-GB`
 * map to `en`; otherwise the primary language subtag is used (`pt-BR` -> `pt`). Defaults to `en`.
 */
export function resolveLocale(discordLocale: string | undefined | null): string {
  if (!discordLocale) return 'en';
  if (discordLocale === 'en-US' || discordLocale === 'en-GB') return 'en';
  const [primary] = discordLocale.split('-');
  return primary || 'en';
}

registerLocaleBundle('core', 'en', coreEn as unknown as Record<string, unknown>);
