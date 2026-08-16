import { describe, expect, it } from 'vitest';
import { registerLocaleBundle, resolveLocale, t } from '../src/i18n/index';

describe('t (core namespace, registered at module load)', () => {
  it('resolves a nested core key without a namespace prefix', () => {
    expect(t('common.confirm')).toBe('Confirm');
    expect(t('errors.hierarchy.self')).toBe("You can't do that to yourself.");
  });

  it('interpolates {vars} into the template', () => {
    expect(t('errors.cooldown', { seconds: 5 })).toBe("You're doing that too fast. Try again in 5s.");
    expect(t('common.page_of', { page: 2, total: 10 })).toBe('Page 2 of 10');
  });

  it('falls back to the raw key when no translation exists anywhere', () => {
    expect(t('this.key.does.not.exist')).toBe('this.key.does.not.exist');
  });
});

describe('registerLocaleBundle', () => {
  it('flattens nested objects into dot keys and namespaces them', () => {
    registerLocaleBundle('moderation', 'en', { errors: { hierarchy: { self: 'Custom self message.' } } });
    expect(t('moderation.errors.hierarchy.self')).toBe('Custom self message.');
  });

  it('falls back from a missing locale to en within the same namespace', () => {
    registerLocaleBundle('moderation', 'en', { greeting: 'Hello' });
    registerLocaleBundle('moderation', 'fr', { farewell: 'Au revoir' });

    // 'greeting' only exists in en, but we ask for fr — should fall back to en.
    expect(t('moderation.greeting', undefined, 'fr')).toBe('Hello');
    // 'farewell' exists in fr directly.
    expect(t('moderation.farewell', undefined, 'fr')).toBe('Au revoir');
  });

  it('merges repeated registrations instead of overwriting the whole bundle', () => {
    registerLocaleBundle('community', 'en', { poll: { create: 'Create poll' } });
    registerLocaleBundle('community', 'en', { poll: { end: 'End poll' } });
    expect(t('community.poll.create')).toBe('Create poll');
    expect(t('community.poll.end')).toBe('End poll');
  });
});

describe('resolveLocale', () => {
  it('maps en-US and en-GB to en', () => {
    expect(resolveLocale('en-US')).toBe('en');
    expect(resolveLocale('en-GB')).toBe('en');
  });

  it('takes the primary subtag for other locales', () => {
    expect(resolveLocale('pt-BR')).toBe('pt');
    expect(resolveLocale('es-ES')).toBe('es');
  });

  it('defaults to en for null/undefined', () => {
    expect(resolveLocale(undefined)).toBe('en');
    expect(resolveLocale(null)).toBe('en');
  });
});
