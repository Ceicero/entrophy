import { describe, expect, it, vi } from 'vitest';

// `LibreTranslateAdapter` runs its base URL through core's `assertPublicHttpUrl`, which does a real DNS lookup
// for non-literal hostnames — mock it so the "happy path" tests don't depend on outbound network access or a
// real DNS record for the example hostname used below.
vi.mock('node:dns/promises', () => ({
  default: { lookup: vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]) },
  lookup: vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]),
}));

import { DeeplTranslateAdapter } from '../adapters/translate/deepl';
import { LibreTranslateAdapter } from '../adapters/translate/libretranslate';
import { TranslateAdapterError } from '../adapters/translate/types';
import { getTranslateAdapter } from '../adapters/translate';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('getTranslateAdapter (provider selection)', () => {
  it('returns null when the provider is "none" or unset', () => {
    expect(getTranslateAdapter({ TRANSLATE_PROVIDER: 'none' })).toBeNull();
    expect(getTranslateAdapter({})).toBeNull();
  });

  it('returns null for deepl without an API key, and an adapter with one', () => {
    expect(getTranslateAdapter({ TRANSLATE_PROVIDER: 'deepl' })).toBeNull();
    expect(getTranslateAdapter({ TRANSLATE_PROVIDER: 'deepl', DEEPL_API_KEY: 'abc:fx' })).toBeInstanceOf(
      DeeplTranslateAdapter,
    );
  });

  it('returns null for libretranslate without a URL, and an adapter with one', () => {
    expect(getTranslateAdapter({ TRANSLATE_PROVIDER: 'libretranslate' })).toBeNull();
    expect(
      getTranslateAdapter({
        TRANSLATE_PROVIDER: 'libretranslate',
        LIBRETRANSLATE_URL: 'https://translate.example.com',
      }),
    ).toBeInstanceOf(LibreTranslateAdapter);
  });
});

describe('DeeplTranslateAdapter', () => {
  it('POSTs to the free-tier host for a ":fx" key, with the expected form body and auth header', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ translations: [{ text: 'Hola', detected_source_language: 'EN' }] }));
    const adapter = new DeeplTranslateAdapter('secret:fx', fetchMock);

    const result = await adapter.translate('Hello', 'es');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api-free.deepl.com/v2/translate');
    expect((init.headers as Record<string, string>).Authorization).toBe('DeepL-Auth-Key secret:fx');
    const body = new URLSearchParams(init.body as string);
    expect(body.get('text')).toBe('Hello');
    expect(body.get('target_lang')).toBe('ES');

    expect(result).toEqual({ translatedText: 'Hola', detectedSourceLanguage: 'en', provider: 'deepl' });
  });

  it('uses the paid host for a non-":fx" key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ translations: [{ text: 'Hola' }] }));
    const adapter = new DeeplTranslateAdapter('secret-paid-key', fetchMock);
    await adapter.translate('Hello', 'es');
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe('https://api.deepl.com/v2/translate');
  });

  it('throws TranslateAdapterError on a non-OK response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: 'Quota exceeded' }, false, 456));
    const adapter = new DeeplTranslateAdapter('key:fx', fetchMock);
    await expect(adapter.translate('Hello', 'es')).rejects.toThrow(TranslateAdapterError);
  });

  it('throws TranslateAdapterError when fetch itself rejects', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    const adapter = new DeeplTranslateAdapter('key:fx', fetchMock);
    await expect(adapter.translate('Hello', 'es')).rejects.toThrow(TranslateAdapterError);
  });
});

describe('LibreTranslateAdapter', () => {
  it('POSTs JSON to <baseUrl>/translate with source/target/format', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ translatedText: 'Hola', detectedLanguage: { language: 'en', confidence: 0.9 } }),
      );
    const adapter = new LibreTranslateAdapter('https://translate.example.com', 'my-key', fetchMock);

    const result = await adapter.translate('Hello', 'es');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://translate.example.com/translate');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      q: 'Hello',
      source: 'auto',
      target: 'es',
      format: 'text',
      api_key: 'my-key',
    });
    expect(result).toEqual({
      translatedText: 'Hola',
      detectedSourceLanguage: 'en',
      provider: 'libretranslate',
    });
  });

  it('rejects a misconfigured (private/internal) LIBRETRANSLATE_URL before making a request', async () => {
    const fetchMock = vi.fn();
    const adapter = new LibreTranslateAdapter('http://localhost:5000', undefined, fetchMock);
    await expect(adapter.translate('Hello', 'es')).rejects.toThrow(TranslateAdapterError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws TranslateAdapterError on an error response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'bad request' }, false, 400));
    const adapter = new LibreTranslateAdapter('https://translate.example.com', undefined, fetchMock);
    await expect(adapter.translate('Hello', 'es')).rejects.toThrow(TranslateAdapterError);
  });
});
