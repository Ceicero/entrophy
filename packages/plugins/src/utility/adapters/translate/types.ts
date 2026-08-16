export interface TranslateResult {
  translatedText: string;
  detectedSourceLanguage?: string;
  provider: string;
}

export interface TranslateAdapter {
  readonly provider: string;
  translate(text: string, to: string, from?: string): Promise<TranslateResult>;
}

export class TranslateAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranslateAdapterError';
  }
}
