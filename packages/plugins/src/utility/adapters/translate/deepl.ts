import { TranslateAdapterError, type TranslateAdapter, type TranslateResult } from './types';

interface DeeplTranslation {
  detected_source_language?: string;
  text: string;
}

interface DeeplResponse {
  translations?: DeeplTranslation[];
  message?: string;
}

/** DeepL API v2 adapter. Free-tier keys end in `:fx` and use the api-free host; paid keys use the api host. */
export class DeeplTranslateAdapter implements TranslateAdapter {
  readonly provider = 'deepl';

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private get baseUrl(): string {
    return this.apiKey.trim().endsWith(':fx') ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate';
  }

  async translate(text: string, to: string, from?: string): Promise<TranslateResult> {
    const body = new URLSearchParams();
    body.set('text', text);
    body.set('target_lang', to.toUpperCase());
    if (from) body.set('source_lang', from.toUpperCase());

    let response: Response;
    try {
      response = await this.fetchImpl(this.baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `DeepL-Auth-Key ${this.apiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });
    } catch (err) {
      throw new TranslateAdapterError(`Could not reach DeepL: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!response.ok) {
      let detail = '';
      try {
        const errBody = (await response.json()) as DeeplResponse;
        detail = errBody.message ?? '';
      } catch {
        // Non-JSON error body; ignore.
      }
      throw new TranslateAdapterError(`DeepL returned an error (${response.status})${detail ? `: ${detail}` : '.'}`);
    }

    const data = (await response.json()) as DeeplResponse;
    const translation = data.translations?.[0];
    if (!translation) {
      throw new TranslateAdapterError('DeepL returned no translation.');
    }

    return {
      translatedText: translation.text,
      detectedSourceLanguage: translation.detected_source_language?.toLowerCase(),
      provider: this.provider,
    };
  }
}
