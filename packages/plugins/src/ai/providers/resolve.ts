import { createAnthropicProvider } from './anthropic';
import { createOpenAiProvider } from './openai';
import type { AiProvider } from './types';
import type { AiConfig } from '../manifest';

export interface ResolveProviderInput {
  config: AiConfig;
  apiKey: string;
}

/** Builds the `AiProvider` implementation for `config.provider`. `compatible` reuses the OpenAI shape with `config.baseUrl`. */
export function resolveProvider({ config, apiKey }: ResolveProviderInput): AiProvider {
  if (config.provider === 'anthropic') {
    return createAnthropicProvider({ apiKey, model: config.model });
  }
  if (config.provider === 'compatible') {
    return createOpenAiProvider({ apiKey, model: config.model, baseUrl: config.baseUrl });
  }
  return createOpenAiProvider({ apiKey, model: config.model });
}

/** Which env var (if any) `config.allowEnvKeys` falls back to for this provider (compatible reuses the OpenAI-shaped key). */
export function envKeyNameFor(provider: AiConfig['provider']): 'OPENAI_API_KEY' | 'ANTHROPIC_API_KEY' {
  return provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
}
