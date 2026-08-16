/** A single turn in the conversation sent to a provider. System instructions are passed separately (see `AiCompleteRequest.system`). */
export interface AiProviderMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiCompleteRequest {
  system: string;
  messages: AiProviderMessage[];
  maxTokens: number;
  temperature?: number;
  /** Abort/timeout signal — providers must respect it and map an abort into a clear `ExternalServiceError`. */
  signal?: AbortSignal;
}

export interface AiCompleteResponse {
  text: string;
  promptTokens: number;
  completionTokens: number;
  model: string;
}

/** Implemented per-provider by `openai.ts`/`anthropic.ts` — the only shape `service.ts` depends on. */
export interface AiProvider {
  readonly id: string;
  complete(request: AiCompleteRequest): Promise<AiCompleteResponse>;
}
