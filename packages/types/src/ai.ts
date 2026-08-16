/** DTOs for the `ai` plugin (ARCHITECTURE.md §7.1 row 'ai', SPEC.md §K). Imported via the `@entrophy/types/ai` subpath — not re-exported from `./index` (see the `ai` build stage's ownership notes). */

export type AiProviderId = 'openai' | 'anthropic' | 'compatible';

/** `GET/PUT /guilds/:guildId/ai/settings` response shape. The encrypted key itself is never returned — only `hasKey`. */
export interface AiSettingsDto {
  guildId: string;
  provider: AiProviderId;
  model: string;
  /** Only meaningful for `provider: 'compatible'`; null otherwise. */
  baseUrl: string | null;
  hasKey: boolean;
  allowEnvKeys: boolean;
  allowedChannelIds: string[];
  userCooldownSeconds: number;
  dailyTokenBudget: number;
  perUserDailyTokenBudget: number;
}

/** `PUT /guilds/:guildId/ai/settings` request body. `apiKey` sets a new key (encrypted server-side); `clearKey` removes it. */
export interface AiSettingsPatchDto {
  provider?: AiProviderId;
  model?: string;
  baseUrl?: string | null;
  apiKey?: string;
  clearKey?: boolean;
  allowEnvKeys?: boolean;
  allowedChannelIds?: string[];
  userCooldownSeconds?: number;
  dailyTokenBudget?: number;
  perUserDailyTokenBudget?: number;
}

export interface AiUsageDailyPointDto {
  /** `YYYY-MM-DD`, UTC. */
  date: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requests: number;
}

export interface AiUsageTopCommandDto {
  command: string;
  requests: number;
  totalTokens: number;
}

/** `GET /guilds/:guildId/ai/usage` response — token counts only, never message content (ARCHITECTURE.md §K). */
export interface AiUsageSummaryDto {
  guildId: string;
  rangeDays: number;
  totalRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  dailyTokenBudget: number;
  perUserDailyTokenBudget: number;
  daily: AiUsageDailyPointDto[];
  topCommands: AiUsageTopCommandDto[];
}

/** `POST /guilds/:guildId/ai/test` response, mirrored from the bot-action `ai.test` result. */
export interface AiTestResultDto {
  ok: boolean;
  detail?: string;
}
