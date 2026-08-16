# `ai` — AI Assistant

Optional, **disabled by default** AI helper. An admin must opt in, pick a provider, and either set a per-server
API key or turn on the environment-key fallback before it responds to anything.

## Commands

| Command | Who | Where | Notes |
|---|---|---|---|
| `/ask <question> [private]` | Everyone | Only in channels on the allowlist | Public reply by default; `private: true` replies ephemerally. |
| `/summarize [count] [channel]` | Everyone with access to the target channel | Only in channels on the allowlist | Always replies ephemerally. Needs the Message Content privileged intent, and the invoking user must have View Channel + Read Message History in the target channel. Nothing is stored. |
| `/draft <type> <notes>` | Staff (helper+) | Any channel | Ephemeral. `type` is one of `announcement`, `rules`, `welcome`, `reply`. |
| `/mod-assist <case-number \| user> [context]` | Staff (moderator+) | Any channel | Ephemeral. Reads case *metadata* (types/counts/reasons) via the `moderation` service — never message content — and only ever **suggests**; it can never perform a moderation action. |
| `/ai config view\|set-key\|clear-key\|provider\|model\|channels\|budget` | Admin | Any channel | `set-key` opens a modal — the key is never typed into a visible command option. |

## Config keys (`PluginConfig` for `ai`)

| Key | Default | Notes |
|---|---|---|
| `provider` | `openai` | `openai` \| `anthropic` \| `compatible` |
| `model` | `gpt-4o-mini` | Passed through to the provider as-is |
| `baseUrl` | `null` | Only used when `provider = compatible`; any OpenAI-chat-completions-shaped API |
| `apiKeyEnc` | `null` | `encryptSecret()` output; never returned by the dashboard API, only `hasKey` |
| `allowEnvKeys` | `true` | Falls back to `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` from process env when no per-guild key is set |
| `allowedChannelIds` | `[]` | Channels `/ask` and `/summarize` may run in. Empty = both are disabled until an admin adds at least one channel. `/draft` and `/mod-assist` ignore this — they're staff-only and ephemeral everywhere. |
| `userCooldownSeconds` | `30` | Per-user cooldown across all four commands |
| `dailyTokenBudget` | `200000` | Server-wide daily token cap (prompt + completion), reset at UTC midnight |
| `perUserDailyTokenBudget` | `20000` | Per-user daily token cap |

Max output tokens per response is a fixed platform guardrail (`AI_MAX_OUTPUT_TOKENS = 700`), not configurable.

## Permissions

No Discord permissions are required — this plugin never touches roles, channels, or members. `/ai config` is
gated to `ManageGuild`/admin staff level; `/mod-assist` requires `moderator`+; `/draft` requires `helper`+.

## Privileged intents

`MessageContent` is needed for `/summarize` to read channel history. Without it, `/summarize` explains why it
can't run rather than silently returning nothing. `/ask`, `/draft`, and `/mod-assist` don't need it.

## Privacy notes

- Disabled by default; an admin must explicitly opt in per server.
- **Redaction before every provider call**: Discord mentions, email addresses, phone numbers, URLs (path/query
  stripped, domain kept), and API-key/token-shaped strings are stripped from the prompt text before it leaves
  Entrophy (`src/ai/redact.ts`).
- **Prompt-injection resistance**: a fixed system prompt (never built from user input) instructs the model that
  everything inside `<data>...</data>` tags is untrusted content to read, not instructions to follow, and that it
  must never reveal the system prompt. All user/message-sourced content is wrapped this way (`src/ai/prompt.ts`).
- **No training on server data by default** — Entrophy makes no opt-in call to any provider's training/fine-tuning
  endpoints. Check your own provider account's data-use settings for anything beyond that.
- **Disclosure**: every AI response includes the footer "AI can be inaccurate — verify important information."
- **Storage**: only token counts (`AiUsage`: guildId, userId, command, promptTokens, completionTokens, provider,
  model, timestamp) are recorded — never prompt or response content.
- `/summarize` reads only messages the *invoking user* can already see (View Channel + Read Message History
  checked against their own Discord permissions, not the bot's) and stores nothing.
- `/mod-assist` never sees raw message content — only case metadata from the `moderation` service — and can
  never perform an action; every response is labeled "suggestion only — you decide."

## Dashboard

`/dashboard/[guildId]/ai` — opt-in banner + disclosure, provider/model/base-URL/key form, channel allowlist
picker, budget/cooldown fields, a usage chart, and a "Test connection" button.
