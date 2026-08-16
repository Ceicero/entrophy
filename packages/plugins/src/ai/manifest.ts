import { z } from 'zod';
import { defineManifest } from '../sdk';

/** Every output response carries this disclosure, per SPEC.md §K ("Clear disclosure that AI responses can be inaccurate"). */
export const AI_DISCLOSURE = 'AI can be inaccurate — verify important information.';

/** Hard ceiling on completion length, independent of any per-guild config (ARCHITECTURE.md task spec: "max output tokens 700"). */
export const AI_MAX_OUTPUT_TOKENS = 700;

export const configSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'compatible']).default('openai'),
  model: z.string().trim().min(1).max(200).default('gpt-4o-mini'),
  /** Only used when `provider === 'compatible'` — an OpenAI-chat-completions-shaped base URL override. */
  baseUrl: z.string().trim().url().nullable().default(null),
  /** `encryptSecret()` output (`v1:<iv>:<tag>:<ciphertext>`), or null if no per-guild key is configured. Never sent to the dashboard in plaintext. */
  apiKeyEnc: z.string().nullable().default(null),
  /** When true (default) and no per-guild key is set, fall back to `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` from process env. */
  allowEnvKeys: z.boolean().default(true),
  /** Channels `/ask` and `/summarize` may run in. Empty = nowhere for those two (they stay disabled until an admin picks channels). `/draft` and `/mod-assist` are staff-only and ephemeral, so they ignore this list. */
  allowedChannelIds: z.array(z.string()).max(50).default([]),
  userCooldownSeconds: z.number().int().min(0).max(3600).default(30),
  dailyTokenBudget: z.number().int().min(1000).max(10_000_000).default(200_000),
  perUserDailyTokenBudget: z.number().int().min(100).max(1_000_000).default(20_000),
});
export type AiConfig = z.infer<typeof configSchema>;

export const manifest = defineManifest({
  id: 'ai',
  name: 'AI Assistant',
  description:
    'Optional, disabled-by-default AI helper (/ask, /summarize, /draft, /mod-assist) with per-server opt-in, per-channel allowlisting, cooldowns, and token budgets.',
  category: 'ai',
  version: '0.1.0',
  defaultEnabled: false,
  permissions: [],
  intents: [],
  // No global env var is required to load the plugin — the provider and API key are configured per-guild via
  // `/ai config` (or the dashboard), not through process env. `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` are an
  // optional env fallback (config.allowEnvKeys) checked at request time, not at plugin-availability time.
  requiredEnv: [],
  optionalEnv: ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY'],
  configSchema,
  dashboard: { path: '/dashboard/[guildId]/ai', label: 'AI Assistant', icon: 'sparkles' },
  privacyNotes: [
    'Disabled by default. An admin must opt in and configure a provider and API key (or enable the env-key fallback) before it will respond.',
    `${AI_DISCLOSURE} This disclosure is attached to every AI response.`,
    'Message content sent to the configured provider is redacted where possible first (mentions, emails, phone numbers, URL paths, and token/key-shaped strings are stripped before the request leaves Entrophy).',
    "The platform does not opt server data into provider model training by default; check your provider's own data-use terms for your account.",
    "/summarize only reads messages the invoking user could already see and permits (channel view + read history) — it never reads other channels on the user's behalf.",
    '/mod-assist reads moderation case metadata (types, counts, reasons) for context, never raw message content, and only ever suggests — it can never perform a moderation action itself.',
    'Only token counts (prompt/completion), not message content, are stored in usage records (`AiUsage`), visible to server staff in the dashboard.',
  ],
});
