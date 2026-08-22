# Entrophy — Architecture & Coding Conventions

This document is binding for everyone (human or agent) writing code in this repo. It fixes the decisions that
`SPEC.md` leaves open so that independently-built parts fit together. When SPEC.md and this file conflict on a
mechanism, this file wins; when they conflict on a _requirement_, SPEC.md wins.

---

## 1. Repository layout

```
entrophy/
├── apps/
│   ├── bot/            @entrophy/bot        Discord gateway process + BullMQ workers
│   ├── api/            @entrophy/api        Fastify REST API, Discord OAuth, webhook receivers, OpenAPI
│   └── dashboard/      @entrophy/dashboard  Next.js 15 (App Router) admin dashboard
├── packages/
│   ├── types/          @entrophy/types      Shared TS types (no runtime deps)
│   ├── core/           @entrophy/core       env config, logger, errors, encryption, permissions, rate limiting, i18n, utils
│   ├── database/       @entrophy/database   Prisma schema, client singleton, migrations, seed
│   ├── plugins/        @entrophy/plugins    Plugin SDK + every feature plugin
│   └── ui/             @entrophy/ui         Dashboard component library (Tailwind + Radix)
├── infra/
│   ├── docker/         Dockerfile.bot, Dockerfile.api, Dockerfile.dashboard
│   └── DEPLOYMENT.md
├── docs/               SPEC.md, ARCHITECTURE.md, PERMISSIONS.md, SECURITY.md, PRIVACY_POLICY_TEMPLATE.md, ROADMAP.md, PLUGINS.md, TROUBLESHOOTING.md
├── .github/workflows/ci.yml
├── docker-compose.yml
├── .env.example
├── package.json  pnpm-workspace.yaml  tsconfig.base.json  eslint.config.js  .prettierrc  .gitignore  .nvmrc
└── README.md
```

## 2. Toolchain & versions (pin these ranges)

| Tool                                                                                     | Version                                    | Notes                                                                                                                                                             |
| ---------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node                                                                                     | >=22 (`.nvmrc` = 22)                       | dev machine runs 24                                                                                                                                               |
| pnpm                                                                                     | 9.15.x (`"packageManager": "pnpm@9.15.9"`) | pnpm workspaces, **no turbo**                                                                                                                                     |
| typescript                                                                               | ^5.6                                       | strict                                                                                                                                                            |
| discord.js                                                                               | ^14.16                                     |                                                                                                                                                                   |
| prisma / @prisma/client                                                                  | ^6.1                                       |                                                                                                                                                                   |
| ioredis                                                                                  | ^5.4                                       |                                                                                                                                                                   |
| bullmq                                                                                   | ^5.30                                      |                                                                                                                                                                   |
| fastify                                                                                  | ^5.1                                       | + @fastify/cookie ^11, @fastify/cors ^10, @fastify/helmet ^13, @fastify/rate-limit ^10, @fastify/swagger ^9, @fastify/swagger-ui ^5, fastify-type-provider-zod ^4 |
| next                                                                                     | ^15.1                                      | react ^19, react-dom ^19                                                                                                                                          |
| tailwindcss                                                                              | ^3.4                                       | classic `tailwind.config.ts` (NOT v4 CSS-first)                                                                                                                   |
| zod                                                                                      | ^3.23                                      | (not zod 4)                                                                                                                                                       |
| pino                                                                                     | ^9                                         | pino-pretty ^13 (dev only)                                                                                                                                        |
| vitest                                                                                   | ^3                                         |                                                                                                                                                                   |
| @playwright/test                                                                         | ^1.49                                      |                                                                                                                                                                   |
| eslint                                                                                   | ^9 (flat config)                           | typescript-eslint ^8, eslint-config-prettier                                                                                                                      |
| prettier                                                                                 | ^3                                         |                                                                                                                                                                   |
| tsx                                                                                      | ^4.19                                      | runs bot & api from TS source                                                                                                                                     |
| @tanstack/react-query                                                                    | ^5                                         | dashboard data fetching                                                                                                                                           |
| next-themes                                                                              | ^0.4                                       | dark mode                                                                                                                                                         |
| lucide-react                                                                             | latest                                     | icons                                                                                                                                                             |
| class-variance-authority, clsx, tailwind-merge                                           | latest                                     | ui                                                                                                                                                                |
| @radix-ui/react-{dialog,switch,select,tabs,tooltip,dropdown-menu,checkbox,label,popover} | latest                                     | ui primitives                                                                                                                                                     |
| safe-regex2                                                                              | ^4                                         | regex safety heuristic                                                                                                                                            |
| dotenv                                                                                   | ^16                                        |                                                                                                                                                                   |

## 3. Module system & build strategy — SOURCE-FIRST WORKSPACE PACKAGES

- Every package/app has `"type": "module"`. ESM everywhere. **No `__dirname`/`require`** — use `import.meta.url` + `fileURLToPath` when a path is needed.
- Workspace packages export **TypeScript source directly** — no build step for libraries:
  ```json
  {
    "name": "@entrophy/core",
    "version": "0.1.0",
    "private": true,
    "type": "module",
    "exports": { ".": "./src/index.ts", "./*": "./src/*.ts" },
    "types": "./src/index.ts",
    "scripts": { "typecheck": "tsc --noEmit", "lint": "eslint src", "test": "vitest run" }
  }
  ```
  (Packages with subpath entry points may add explicit entries, e.g. `"./manifests": "./src/manifests.ts"`.)
- Apps `bot` and `api` run with `tsx` in dev (`tsx watch src/index.ts`) **and** in production Docker (`tsx src/index.ts`). This is deliberate: zero build pipeline, one less thing to break. `typecheck` = `tsc --noEmit`.
- Dashboard uses `next build`; `next.config.ts` sets `transpilePackages: ['@entrophy/ui', '@entrophy/types', '@entrophy/core']`. The dashboard **never imports `@entrophy/database` or `@entrophy/plugins`** — it talks to the API only.
- Workspace deps are declared as `"@entrophy/core": "workspace:*"`.
- `tsconfig.base.json`:
  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "lib": ["ES2022"],
      "module": "ESNext",
      "moduleResolution": "Bundler",
      "strict": true,
      "esModuleInterop": true,
      "skipLibCheck": true,
      "resolveJsonModule": true,
      "isolatedModules": true,
      "forceConsistentCasingInFileNames": true,
      "noEmit": true,
      "declaration": false,
      "types": ["node"]
    }
  }
  ```
  Each package: `{ "extends": "../../tsconfig.base.json", "include": ["src", "test", "vitest.config.ts"], "compilerOptions": { ... } }`. Dashboard adds `"jsx": "preserve"`, `"lib": ["dom","dom.iterable","ES2022"]`, `"plugins": [{"name":"next"}]`, `"incremental": true`.
- Imports between files inside a package use relative paths **without** `.js` extensions (Bundler resolution + tsx + vitest + next all accept this).
- Root scripts (`package.json`):
  ```
  dev            → concurrently runs bot, api, dashboard dev (script `pnpm -r --parallel --filter ./apps/* run dev`)
  lint           → pnpm -r run lint
  typecheck      → pnpm -r run typecheck
  test           → pnpm -r run test
  test:e2e       → pnpm --filter @entrophy/dashboard test:e2e
  build          → pnpm -r run build          (only dashboard has a real build; others are no-ops or omitted)
  db:generate    → pnpm --filter @entrophy/database generate
  db:migrate     → pnpm --filter @entrophy/database migrate:deploy
  db:migrate:dev → pnpm --filter @entrophy/database migrate:dev
  db:seed        → pnpm --filter @entrophy/database seed
  commands:register → pnpm --filter @entrophy/bot register
  format         → prettier --write .
  ```
- Root `.env` is the single env file; apps load it with `dotenv` from repo root (`config({ path: findUp('.env') })` — core exposes `loadEnv()` which walks up from `process.cwd()` looking for `.env`; missing file is fine).
- ESLint: one root `eslint.config.js` (flat) using typescript-eslint recommended (non-type-checked, to keep it fast), `eslint-config-prettier` last, ignores `**/dist`, `**/.next`, `**/node_modules`, `**/generated`. Rule tweaks: `@typescript-eslint/no-unused-vars: ["warn", {argsIgnorePattern:"^_", varsIgnorePattern:"^_"}]`, `@typescript-eslint/no-explicit-any: "warn"`. Package `lint` scripts run `eslint .` from the package dir using the root config (`eslint` finds the root config automatically since flat config lookup starts from cwd — so each package's lint script is `eslint --config ../../eslint.config.js src` to be explicit).

## 4. Environment variables (`.env.example`) — all read through `@entrophy/core` `env`

Required (process fails fast with a clear message if missing where needed):

```
NODE_ENV=development
LOG_LEVEL=info
DATABASE_URL=postgresql://entrophy:entrophy@localhost:5432/entrophy
REDIS_URL=redis://localhost:6379
DISCORD_TOKEN=                # bot only
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=        # api only (OAuth)
DISCORD_OAUTH_REDIRECT_URI=http://localhost:3001/auth/discord/callback
ENCRYPTION_KEY=               # 32 bytes, base64. Generate: openssl rand -base64 32
SESSION_SECRET=               # >=32 chars random. cookie signing
API_PORT=3001
API_BASE_URL=http://localhost:3001
DASHBOARD_URL=http://localhost:3000            # CORS allowlist + OAuth return
NEXT_PUBLIC_API_URL=http://localhost:3001      # dashboard → api
```

Optional:

```
BOT_OWNER_IDS=                # comma-separated user IDs (bot-owner-only commands, protected from moderation)
DEV_GUILD_ID=                 # if set, `register` registers commands to this guild only (instant) instead of globally
BOT_HEALTH_PORT=3002          # tiny HTTP /health for Docker
ENABLE_MESSAGE_CONTENT_INTENT=false   # privileged; enable only after Discord approval/eligibility
ENABLE_GUILD_MEMBERS_INTENT=true      # privileged; needed for joins/leaves, welcome, raid detection, role persistence
ENABLE_GUILD_PRESENCES_INTENT=false   # privileged; not used by default
COOKIE_DOMAIN=                # prod: shared parent domain for api+dashboard cookies
TRUST_PROXY=false
E2E_TEST_MODE=false           # enables /auth/test-login (NEVER in production; api refuses if NODE_ENV=production)
# Integrations / adapters (all optional; features disable themselves when unset)
TWITCH_CLIENT_ID= TWITCH_CLIENT_SECRET= TWITCH_EVENTSUB_SECRET=
YOUTUBE_API_KEY=
GITHUB_WEBHOOK_SECRET=
STRIPE_SECRET_KEY= STRIPE_WEBHOOK_SECRET=
REDDIT_CLIENT_ID= REDDIT_CLIENT_SECRET= REDDIT_USER_AGENT=
STEAM_API_KEY=
GOOGLE_CLIENT_ID= GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID= MICROSOFT_CLIENT_SECRET=
NOTION_CLIENT_ID= NOTION_CLIENT_SECRET=
OPENAI_API_KEY= ANTHROPIC_API_KEY=
TRANSLATE_PROVIDER=none       # none | deepl | libretranslate
DEEPL_API_KEY= LIBRETRANSLATE_URL= LIBRETRANSLATE_API_KEY=
WEATHER_PROVIDER=none         # none | openweathermap | open-meteo (open-meteo needs no key)
OPENWEATHERMAP_API_KEY=
CAPTCHA_PROVIDER=none         # none | hcaptcha | turnstile
HCAPTCHA_SITE_KEY= HCAPTCHA_SECRET= TURNSTILE_SITE_KEY= TURNSTILE_SECRET=
MEDIA_PROVIDER=none           # none | <compliant provider id>; media plugin is unavailable when none
PUBLIC_WEBHOOK_BASE_URL=      # public https base for inbound webhooks (EventSub, GitHub, Stripe)
```

`@entrophy/core` exports `env` (a zod-validated object) with **all keys optional except NODE_ENV/LOG_LEVEL**, plus `requireEnv('DISCORD_TOKEN')` helper that throws `ConfigError` with a helpful message. Each app validates the subset it needs at boot.

## 5. `@entrophy/types` (pure types)

- `StaffLevel = 'member' | 'helper' | 'moderator' | 'admin' | 'owner'` (ordered; helper `STAFF_LEVEL_RANK`).
- `PluginId` string union of all plugin ids (§7.1).
- `PlatformEventMap` — typed in-process event bus payloads (see §7.6).
- API DTOs (shared between api & dashboard): `ApiError`, `SessionUser`, `GuildSummary`, `PluginSummary`, `GuildConfigDto`, `AuditLogEntryDto`, `ModerationCaseDto`, `AutomodRuleDto`, `TicketDto`, `RolePanelDto`, `IntegrationConnectionDto`, `AnalyticsDto`, `RetentionPolicyDto`, `Paginated<T>`.
- Branded `Snowflake = string`.

## 6. `@entrophy/core` (exports from `src/index.ts`)

| Module                     | Exports                                                                                                                                                                                                                                                                                           | Notes                                                                                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `env.ts`                   | `loadEnv()`, `env`, `requireEnv()`, `isProduction`                                                                                                                                                                                                                                                | zod schema; never logs values                                                                                                                                                                              |
| `logger.ts`                | `createLogger(name)`, `logger`                                                                                                                                                                                                                                                                    | pino; `redact` paths: `*.token, *.accessToken, *.refreshToken, *.password, *.secret, *.authorization, req.headers.authorization, req.headers.cookie, *.content, *.messageContent, *.apiKey`; pretty in dev |
| `errors.ts`                | `AppError(code, message, {status, details, expose})`, `ValidationError`, `PermissionError`, `NotFoundError`, `RateLimitError`, `ConfigError`, `ExternalServiceError`, `isAppError`, `toPublicError(err)`                                                                                          | `toPublicError` never leaks stack/secrets                                                                                                                                                                  |
| `crypto/encryption.ts`     | `encryptSecret(plain, key?)`, `decryptSecret(cipher, key?)`, `generateEncryptionKey()`, `EncryptedString` format `v1:<iv b64>:<tag b64>:<ciphertext b64>` (AES-256-GCM, 12-byte IV, key from `ENCRYPTION_KEY` base64)                                                                             | key rotation: `ENCRYPTION_KEY_PREVIOUS` supported for decrypt fallback                                                                                                                                     |
| `crypto/signatures.ts`     | `timingSafeEqualStr`, `verifyHmacSha256(payload, secret, signature, {prefix})`, `verifyGithubSignature`, `verifyStripeSignature(payload, header, secret, toleranceSec)`, `verifyTwitchEventSubSignature`, `verifyDiscordInteractionSignature(publicKey, sig, ts, body)` (ed25519 via node:crypto) | pure functions, unit tested                                                                                                                                                                                |
| `permissions/staff.ts`     | `resolveStaffLevel({ member, guildOwnerId, botOwnerIds, staffRoles: {adminRoleIds, modRoleIds, helperRoleIds} }): StaffLevel`, `hasStaffLevel(level, required)`                                                                                                                                   | Discord perms fallback: Administrator/ManageGuild → admin; ModerateMembers/KickMembers/BanMembers/ManageMessages → moderator                                                                               |
| `permissions/hierarchy.ts` | `checkModerationTarget({ actor, target, botMember, guildOwnerId, botOwnerIds }): { ok: true } \| { ok: false; reason: HierarchyReason }` where reason ∈ `'self' \| 'bot' \| 'guild_owner' \| 'bot_owner' \| 'target_higher_or_equal_than_actor' \| 'target_higher_or_equal_than_bot'`             | takes plain data (`{ id, highestRolePosition, isBot }`) so it is unit-testable without discord.js                                                                                                          |
| `permissions/discord.ts`   | `PERMISSION_NAMES`, `describePermission(flag)`, `missingPermissions(member/channel, required)`, `INVITE_PERMISSIONS` (least-privilege default set), `buildInviteUrl(clientId, permissions)`                                                                                                       |                                                                                                                                                                                                            |
| `ratelimit.ts`             | `RateLimiter` (Redis sliding window via `MULTI INCR/PEXPIRE`), `MemoryRateLimiter` (same interface, for tests), `Cooldowns` (`take(key, seconds)`)                                                                                                                                                | interface `RateLimiterLike { consume(key, limit, windowMs): Promise<{allowed, remaining, resetMs}> }`                                                                                                      |
| `redis.ts`                 | `createRedis(url)`, `getRedis()` singleton, `redisKey(...parts)` → `entrophy:${parts.join(':')}`                                                                                                                                                                                                  |                                                                                                                                                                                                            |
| `i18n/index.ts`            | `t(key, vars?, locale?)`, `locales/en.json`, `resolveLocale(discordLocale)`                                                                                                                                                                                                                       | fallback to en; interpolation `{name}`                                                                                                                                                                     |
| `audit.ts`                 | `AuditAction` string constants (`config.update`, `plugin.enable`, `plugin.disable`, `moderation.*`, `automod.rule.*`, `ticket.*`, `integration.*`, `retention.update`, `data.export`, `data.delete`, ...), `type AuditEntry`                                                                      | writer lives in database package (`writeAudit`)                                                                                                                                                            |
| `utils/safe-regex.ts`      | `validateUserRegex(pattern, flags): {ok, error?}` (max length 256, `safe-regex2`, disallow lookbehind-heavy nesting), `safeTest(re, input, {maxInputLength=2000})`                                                                                                                                |                                                                                                                                                                                                            |
| `utils/ssrf.ts`            | `assertPublicHttpUrl(url): Promise<URL>` (https/http only, no creds in URL, resolves DNS and rejects private/loopback/link-local/metadata IPs, rejects ports other than 80/443 unless allowlisted), `SsrfError`                                                                                   | uses `node:dns/promises`; unit tests mock lookup                                                                                                                                                           |
| `utils/sanitize.ts`        | `escapeMarkdown`, `escapeHtml`, `sanitizeFilename`, `truncate(str, max)`, `sanitizeEmbedText`, `stripMentions`                                                                                                                                                                                    |                                                                                                                                                                                                            |
| `utils/time.ts`            | `parseDuration('10m' \| '2h' \| '3d')` → ms or null, `formatDuration`, `discordTimestamp(date, style)`                                                                                                                                                                                            |                                                                                                                                                                                                            |
| `utils/ids.ts`             | `newId()` (crypto.randomUUID), `shortId()`                                                                                                                                                                                                                                                        |                                                                                                                                                                                                            |
| `utils/pagination.ts`      | `paginate(params)`                                                                                                                                                                                                                                                                                |                                                                                                                                                                                                            |
| `events.ts`                | `PlatformEvents` (typed EventEmitter over `PlatformEventMap`), `createPlatformEvents()`                                                                                                                                                                                                           |                                                                                                                                                                                                            |
| `constants.ts`             | `BRAND = { name: 'Entrophy', color: 0xe5e5e5, ... }`, `brandIconUrl(env)`, `EMBED_LIMITS`                                                                                                                                                                                                         | monochrome per §20                                                                                                                                                                                         |

## 7. Plugin SDK (`@entrophy/plugins`, folder `packages/plugins/src/sdk/`)

### 7.1 Plugin ids and ownership

| id             | Folder             | Command groups / top-level commands                                                                                                                                                                                                                                                                                                                                             | Default                                                |
| -------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `admin`        | `src/admin`        | `/setup wizard\|status`, `/config view\|set\|reset`, `/plugin enable\|disable\|status\|list`, `/permissions audit`, `/health`                                                                                                                                                                                                                                                   | always enabled (cannot be disabled)                    |
| `moderation`   | `src/moderation`   | `/mod warn\|warnings\|clearwarns\|timeout\|untimeout\|kick\|ban\|unban\|softban\|purge\|lock\|unlock\|slowmode\|nick\|note\|case\|cases\|appeal-setup`, `/mod role add\|remove` (subcommand group), `/appeal` (member-facing appeal flow), context menus: "Warn user", "View cases"                                                                                             | enabled                                                |
| `automod`      | `src/automod`      | `/automod rule create\|list\|view\|edit\|delete\|toggle\|test`, `/automod exempt add\|remove\|list`, `/automod dryrun`, `/automod review`, `/automod status`                                                                                                                                                                                                                    | enabled, **dry-run on** by default                     |
| `enforcer`     | `src/enforcer`     | `/enforcer setup\|status\|policy create\|list\|view\|edit\|delete\|toggle\|test\|import\|flag\|search\|record\|history\|export\|appeal\|mute\|unmute`, context menu "Flag for review"                                                                                                                                                                                           | disabled                                               |
| `logging`      | `src/logging`      | `/logs set\|disable\|status\|retention\|test\|search`, `/logs redact add\|remove\|list`                                                                                                                                                                                                                                                                                         | enabled (no channels configured → does nothing)        |
| `tickets`      | `src/tickets`      | `/ticket open\|close\|add\|remove\|transcript\|assign\|reopen\|config`, `/ticket tag add\|remove`, `/ticket panel create`                                                                                                                                                                                                                                                       | disabled                                               |
| `roles`        | `src/roles`        | `/roles panel create\|edit\|delete\|list\|post\|option-add\|option-remove`, `/roles group create\|edit\|delete\|list`, `/roles persist on\|off\|status`, `/welcome set\|embed\|test\|disable`, `/goodbye set\|embed\|test\|disable`, `/verify` (member-facing), `/verification setup\|queue\|approve\|deny`, `/onboarding checklist\|config\|rules-post\|step-add\|step-remove` | disabled                                               |
| `engagement`   | `src/engagement`   | `/level rank\|leaderboard\|config\|reset\|xp give\|remove\|set\|rewards add\|remove\|list\|sync\|ignore add\|remove`, `/rep give\|check\|leaderboard\|revoke`, `/starboard set channel\|threshold\|emoji\|selfstar\|status`, `/tempvoice setup\|lock\|unlock\|limit\|rename\|claim\|kick\|permit`                                                                               | enabled (leveling on, rep on, starboard needs channel) |
| `community`    | `src/community`    | `/poll create\|end\|results`, `/giveaway start\|end\|reroll\|list\|cancel`, `/suggest`, `/suggestions setup\|status\|list`, `/announce schedule\|list\|cancel\|preview`, `/remind set\|list\|cancel`, `/event create\|list\|cancel\|rsvps`                                                                                                                                      | enabled                                                |
| `economy`      | `src/economy`      | `/economy balance\|daily\|give\|leaderboard\|config`, `/economy admin add\|remove` — virtual currency only, **no real money**                                                                                                                                                                                                                                                   | disabled                                               |
| `utility`      | `src/utility`      | `/help`, `/utility userinfo\|serverinfo\|avatar\|banner\|roleinfo\|channelinfo\|timestamp\|timezone set\|get\|list\|calculator\|afk\|translate\|weather\|status`, `/embed builder`, context menu "User info"                                                                                                                                                                    | enabled                                                |
| `media`        | `src/media`        | `/music play\|queue\|skip\|pause\|resume\|volume\|loop\|stop\|shuffle\|nowplaying\|playlist save\|load\|list\|delete` — adapter interface only; unavailable unless `MEDIA_PROVIDER` configured with a compliant provider                                                                                                                                                        | disabled                                               |
| `integrations` | `src/integrations` | `/integration connect\|disconnect\|status\|list`, `/integration alerts add\|remove\|list`, `/integration webhook create\|list\|delete`, `/integration outbound create\|list\|delete\|test`                                                                                                                                                                                      | disabled                                               |
| `ai`           | `src/ai`           | `/ask`, `/summarize`, `/draft`, `/mod-assist`, `/ai config view\|set-key\|clear-key\|provider\|model\|channels\|budget`                                                                                                                                                                                                                                                         | disabled                                               |

`PluginId` union in `@entrophy/types` = exactly these ids. `packages/plugins/src/index.ts` exports `allPlugins: Plugin[]` in this order and `packages/plugins/src/manifests.ts` exports `allManifests: PluginManifest[]` (import each plugin's `manifest.ts` only — **manifest files must not import discord.js runtime code beyond types/enums** so the API can load them cheaply).

Every plugin folder has this shape:

```
src/<id>/
  manifest.ts        export const manifest: PluginManifest  (+ export type <Id>Config = z.infer<typeof configSchema>)
  index.ts           export const plugin: Plugin = { manifest, commands, events?, components?, jobs?, ... }; export default plugin
  commands/*.ts      one file per top-level command or group
  events/*.ts        discord.js event handlers
  components/*.ts    button/select/modal handlers
  jobs/*.ts          BullMQ processors
  service.ts         business logic (pure where possible; injected deps) — this is what unit tests target
  README.md          what it does, config keys, permissions, privacy notes
  __tests__/*.test.ts
```

### 7.2 SDK types (`src/sdk/types.ts`) — implement exactly this shape

```ts
import type { z } from 'zod';
import type {
  Client,
  ChatInputCommandInteraction,
  ContextMenuCommandInteraction,
  AutocompleteInteraction,
  ButtonInteraction,
  AnySelectMenuInteraction,
  ModalSubmitInteraction,
  ClientEvents,
  SlashCommandBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  SlashCommandOptionsOnlyBuilder,
  ContextMenuCommandBuilder,
  PermissionResolvable,
  GatewayIntentBits,
  Locale,
} from 'discord.js';
import type { Job, Queue } from 'bullmq';
import type { PrismaClient } from '@entrophy/database';
import type Redis from 'ioredis';
import type { Logger } from 'pino';
import type { PluginId, StaffLevel, PlatformEventMap } from '@entrophy/types';
import type { PlatformEvents, RateLimiterLike } from '@entrophy/core';

export type PluginCategory =
  'admin' | 'moderation' | 'community' | 'utility' | 'integrations' | 'ai' | 'media';
export type PrivilegedIntent = 'MessageContent' | 'GuildMembers' | 'GuildPresences';

export interface PluginPermissionDoc {
  permission: PermissionResolvable; // e.g. PermissionFlagsBits.BanMembers
  feature: string; // "ban / softban"
  optional: boolean;
  fallback: string; // behaviour when missing
}

export interface PluginManifest {
  id: PluginId;
  name: string;
  description: string;
  category: PluginCategory;
  version: string;
  defaultEnabled: boolean;
  alwaysEnabled?: boolean; // admin only
  permissions: PluginPermissionDoc[]; // used by /permissions audit + README matrix
  intents: GatewayIntentBits[]; // non-privileged intents needed
  privilegedIntents?: PrivilegedIntent[]; // features degrade if not enabled
  requiredEnv: string[]; // ALL must be set or plugin status = 'unavailable'
  optionalEnv?: string[];
  configSchema: z.ZodTypeAny; // per-guild config; MUST have defaults for every field
  defaultConfig: unknown; // = configSchema.parse({})
  dashboard?: { path: string; label: string; icon: string }; // icon = lucide icon name
  privacyNotes?: string[]; // shown in dashboard + README
}

export type CommandBuilder =
  | SlashCommandBuilder
  | SlashCommandSubcommandsOnlyBuilder
  | SlashCommandOptionsOnlyBuilder
  | ContextMenuCommandBuilder
  | Omit<SlashCommandBuilder, 'addSubcommand' | 'addSubcommandGroup'>;

export interface CommandRequirement {
  staffLevel?: StaffLevel; // minimum configured staff level (see core resolveStaffLevel)
  discordPermissions?: PermissionResolvable[]; // actor must have ALL (checked in addition to staffLevel when both given: staffLevel OR discordPermissions satisfies)
  botPermissions?: PermissionResolvable[]; // bot must have in guild/channel; else friendly error
  botOwnerOnly?: boolean;
  guildOnly?: boolean; // default true
  cooldown?: { seconds: number; scope: 'user' | 'guild' | 'channel' };
}

export interface CommandContext {
  interaction: ChatInputCommandInteraction<'cached'>;
  ctx: PluginContext;
  guildId: string;
  staffLevel: StaffLevel;
  locale: Locale;
  t: (key: string, vars?: Record<string, string | number>) => string;
  config: <T = unknown>() => Promise<T>; // this plugin's guild config (parsed with configSchema)
}
export interface ContextMenuContext extends Omit<CommandContext, 'interaction'> {
  interaction: ContextMenuCommandInteraction<'cached'>;
}
export interface AutocompleteContext extends Omit<CommandContext, 'interaction'> {
  interaction: AutocompleteInteraction<'cached'>;
}
export interface ComponentContext<
  I = ButtonInteraction<'cached'> | AnySelectMenuInteraction<'cached'> | ModalSubmitInteraction<'cached'>,
> extends Omit<CommandContext, 'interaction'> {
  interaction: I;
  args: string[];
}

export interface PluginCommand {
  data: CommandBuilder; // name must be unique across ALL plugins
  requirement?: CommandRequirement;
  execute(c: CommandContext): Promise<void>;
  executeContextMenu?(c: ContextMenuContext): Promise<void>;
  autocomplete?(c: AutocompleteContext): Promise<void>;
}

export interface PluginEventHandler<K extends keyof ClientEvents = keyof ClientEvents> {
  event: K;
  once?: boolean;
  /** Return the guildId the event belongs to (so the host can gate on plugin enablement); return null for non-guild events (then handler runs unconditionally). */
  guildIdOf?: (...args: ClientEvents[K]) => string | null | undefined;
  handler: (ctx: PluginContext, ...args: ClientEvents[K]) => Promise<void>;
}

/** Component custom ids are `<pluginId>:<action>:<arg1>:<arg2>...` (max 100 chars). Host routes by pluginId then action. */
export interface ComponentHandler {
  action: string; // e.g. 'confirm-ban'
  kind: 'button' | 'select' | 'modal';
  handler: (c: ComponentContext) => Promise<void>;
  requirement?: Pick<CommandRequirement, 'staffLevel' | 'discordPermissions' | 'botOwnerOnly'>;
  /** if true (default), only the user who created the component may use it. Encode owner user id as first arg for that check: `<plugin>:<action>:<ownerUserId>:...`. */
  ownerOnly?: boolean;
}

export interface PluginJob<T = unknown> {
  name: string; // queue name = `${pluginId}.${name}` (BullMQ forbids ":" in queue names)
  processor: (ctx: PluginContext, job: Job<T>) => Promise<void>;
  concurrency?: number;
  repeat?: { pattern: string }; // cron; scheduled at load with jobId = name (idempotent)
}

export interface PluginHealth {
  status: 'ok' | 'degraded' | 'unavailable' | 'disabled';
  details?: string;
}

export interface PluginContext {
  client: Client<true>;
  prisma: PrismaClient;
  redis: Redis;
  logger: Logger; // child logger with { plugin: id }
  events: PlatformEvents; // in-process typed bus
  rateLimiter: RateLimiterLike;
  queue: (jobName: string) => Queue; // returns/creates queue `${pluginId}.${jobName}`
  getConfig: <T>(guildId: string) => Promise<T>; // this plugin's guild config with defaults applied
  setConfig: <T>(
    guildId: string,
    patch: Partial<T>,
    actor: { id: string; source: 'bot' | 'dashboard' | 'system' },
  ) => Promise<T>;
  isEnabled: (guildId: string, pluginId?: PluginId) => Promise<boolean>;
  services: ServiceRegistry; // cross-plugin services (see §7.5)
  audit: (entry: Omit<AuditEntry, 'id' | 'createdAt'>) => Promise<void>;
  t: (key: string, vars?: Record<string, string | number>, locale?: string) => string;
  env: typeof import('@entrophy/core').env;
  botOwnerIds: string[];
  intentsEnabled: { messageContent: boolean; guildMembers: boolean; guildPresences: boolean };
}

export interface Plugin {
  manifest: PluginManifest;
  commands: PluginCommand[];
  events?: PluginEventHandler<any>[];
  components?: ComponentHandler[];
  jobs?: PluginJob<any>[];
  onLoad?(ctx: PluginContext): Promise<void>;
  onGuildEnable?(ctx: PluginContext, guildId: string): Promise<void>;
  onGuildDisable?(ctx: PluginContext, guildId: string): Promise<void>;
  health?(ctx: PluginContext): Promise<PluginHealth>;
  migrations?: { id: string; run(ctx: PluginContext): Promise<void> }[]; // recorded in PluginMigration table
}
```

Helper `definePlugin(p: Plugin): Plugin` (identity, for typing) and `defineManifest`.

### 7.3 Registry (`src/sdk/registry.ts`)

`class PluginRegistry { constructor(plugins: Plugin[]); get(id); list(); commandsJson(); requiredIntents(opts: {privileged: {...}}); availability(env): Map<PluginId, {available: boolean; reason?: string}> }`. Validates at construction: unique plugin ids, unique command names, custom-id action uniqueness per plugin, `defaultConfig` parses. Throws on violation.

### 7.4 Config store (`src/sdk/config-store.ts`)

`GuildConfigStore` — reads `PluginConfig` rows (`guildId`, `pluginId`, `config Json`) merged over `manifest.defaultConfig` via `configSchema.parse({...defaults, ...stored})`; Redis cache key `entrophy:cfg:<guildId>:<pluginId>` TTL 300s, invalidated on write. Enablement is `PluginState` (`guildId`, `pluginId`, `enabled`) with the same cache pattern (`entrophy:plugin:<guildId>:<pluginId>`); missing row → `manifest.defaultEnabled`. Both **api and bot** use this store, so config changes from the dashboard are visible to the bot after invalidation (api deletes the same Redis keys).

### 7.5 Cross-plugin services (`src/sdk/services.ts`)

`ServiceRegistry` = typed map: `register<K extends keyof ServiceMap>(k, impl)`, `get(k): ServiceMap[K] | undefined`, `require(k)`. `ServiceMap` interface (declared in sdk, extended by module augmentation in plugins):

- `moderation`: `{ createCase(input): Promise<ModerationCase>; warn(input); timeout(input); getCase(guildId, caseNumber); listCases(...) }`
- `logging`: `{ log(guildId, kind: LogKind, payload: LogPayload): Promise<void> }` — kind ∈ `member.join|member.leave|message.edit|message.delete|role.update|channel.update|guild.update|moderation.action|voice.join|voice.leave|invite.use|bot.error|webhook.failure|automod.trigger|ticket.event|verification.event`
- `automod`: `{ quarantine(guildId, userId, reason) }`
- `tickets`, `roles` (`assignRoles`, `verifyMember`), `integrations` (`sendOutbound(guildId, endpointId, payload)`), `ai` (`complete(...)`) — each plugin registers its service in `onLoad` and consumers call `ctx.services.get('x')` and no-op gracefully if absent.

### 7.6 Platform events (`@entrophy/types` `PlatformEventMap`)

```
'guild.configChanged': { guildId; pluginId; actorId; source }
'plugin.enabled' | 'plugin.disabled': { guildId; pluginId; actorId }
'moderation.caseCreated' | 'moderation.caseUpdated': { guildId; caseId; caseNumber; type; targetId; moderatorId; reason? }
'automod.triggered': { guildId; ruleId; ruleType; userId; channelId; action; dryRun }
'ticket.opened' | 'ticket.closed': { guildId; ticketId; userId }
'member.verified': { guildId; userId; method }
'level.up': { guildId; userId; level }
'plugin.error': { pluginId; guildId?; error: string; context? }
'webhook.deliveryFailed': { guildId; endpointId; status?; error }
'moderation.appealOpened': { guildId; appealId; caseId; caseNumber; userId }
'moderation.appealDecided': { guildId; appealId; caseId; caseNumber; userId; accepted: boolean; reviewerId }
'enforcer.flagged': { guildId; recordId; recordNumber; userId; policyId?; source }
'enforcer.decided': { guildId; recordId; recordNumber; userId; decision; moderatorId; caseId? }
```

### 7.7 Command conventions

- Every command file exports `const command: PluginCommand`. Use `SlashCommandBuilder` with `.setDMPermission(false)` and `.setDefaultMemberPermissions(...)` matching the requirement (so Discord hides it from non-staff by default). Set descriptions ≤100 chars, names lowercase.
- Reply **ephemerally** for config, moderation detail, confirmations, errors. Public for community features.
- Destructive actions (kick/ban/softban/purge/bulk role/ticket delete/data delete): reply ephemeral with an embed summarising the action + `Confirm`/`Cancel` buttons (`<plugin>:confirm-<action>:<ownerUserId>:<payload>`), 60s timeout, unless the guild's `admin` config `fastActions=true` **and** the action is not `purge>100`. Payload that doesn't fit in customId → store in Redis `entrophy:pending:<uuid>` TTL 120s and pass the uuid.
- Autocomplete for case ids, config keys, rule ids, ticket ids, plugin ids, timezones.
- Use `t()` for all user-facing strings (add keys to `packages/plugins/src/<id>/locales/en.json`, merged by the SDK into the i18n table under namespace `<pluginId>.`; core i18n exposes `registerLocaleBundle(ns, locale, bundle)`).
- Errors: throw `AppError` subclasses; the host router catches, logs (no user content), and replies with `t('errors.<code>')` ephemerally. Never leak stack traces.
- Rate limits: host applies `requirement.cooldown` via `Cooldowns`; plus a global per-user 20 cmd/10s limiter.

### 7.8 Discord permission model

- Bot invite permission set `INVITE_PERMISSIONS` (core): ViewChannel, SendMessages, SendMessagesInThreads, EmbedLinks, AttachFiles, ReadMessageHistory, AddReactions, UseExternalEmojis, ManageMessages, ManageChannels, ManageRoles, ManageNicknames, ModerateMembers, KickMembers, BanMembers, ManageThreads, CreatePublicThreads, CreatePrivateThreads, ManageWebhooks, ViewAuditLog, Connect, Speak, MoveMembers, ManageEvents, MuteMembers, DeafenMembers. **Never Administrator.**
- Each plugin lists its permissions in `manifest.permissions`; `/permissions audit` diffs against `guild.members.me.permissions` and reports missing ones per feature with the fallback text.

## 8. Database (`@entrophy/database`)

- `prisma/schema.prisma` (postgres). Client singleton in `src/client.ts` (`export const prisma`, `export * from '@prisma/client'` types). `src/index.ts` also exports `writeAudit(prisma, entry)`, `withGuild(guildId)` helpers, and `retention.ts` helpers.
- Migration: `prisma/migrations/0001_init/migration.sql` + `migration_lock.toml`, generated with `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` (no DB needed). Scripts: `generate`, `migrate:dev`, `migrate:deploy`, `migrate:diff`, `seed` (`tsx prisma/seed.ts`), `studio`.
- Conventions: ids `String @id @default(cuid())` unless a Discord snowflake is natural (`Guild.id`, `UserProfile.id` = discord user id). Every tenant table has `guildId String` + `@@index([guildId])` (+ compound indexes for hot lookups). Timestamps `createdAt @default(now())`, `updatedAt @updatedAt`. Soft delete via `deletedAt DateTime?` on ModerationCase, Ticket, RolePanel, AutomodRule, Suggestion, WebhookEndpoint, IntegrationConnection. FK to `Guild` with `onDelete: Cascade` (guild data deletion = delete Guild row → cascades). Json config columns typed `Json`.
- Models (minimum): Guild, GuildConfig (1:1; staff role ids, locale, timezone, fastActions, modLogChannelId, dataCollection flags), PluginState, PluginConfig, PluginMigration, UserProfile, ModerationCase (`caseNumber Int` per guild `@@unique([guildId, caseNumber])`, type enum WARN|TIMEOUT|UNTIMEOUT|KICK|BAN|UNBAN|SOFTBAN|PURGE|LOCK|UNLOCK|SLOWMODE|NICK|ROLE_ADD|ROLE_REMOVE|QUARANTINE|NOTE, targetId, moderatorId, reason, evidenceUrls String[], durationMs, expiresAt, expiredAt, dmSent Boolean, metadata Json, source), ModerationWarning, ModerationNote, ModerationAppeal, ModerationEscalationRule (or inside config Json), AutomodRule, AutomodEvent (with reviewStatus enum PENDING|APPROVED|FALSE_POSITIVE), AuditLog, LogEvent (logging plugin searchable store; content fields nullable), Ticket, TicketParticipant, TicketTranscript, TicketPanel, RolePanel, RolePanelOption, RoleGroup, MemberRoleSnapshot (role persistence), VerificationRequest, OnboardingProgress, ScheduledJob, Reminder, ScheduledAnnouncement, Giveaway, GiveawayEntry, Poll, PollOption, PollVote, Suggestion, SuggestionVote, StarboardEntry, TempVoiceChannel, CommunityEvent, EventRsvp, LevelProfile, LevelReward, ReputationEvent, EconomyAccount, EconomyTransaction, AfkStatus, IntegrationConnection, OAuthToken (encrypted fields `accessTokenEnc`, `refreshTokenEnc`, `expiresAt`, `scopes String[]`), WebhookEndpoint (inbound + outbound, `secretEnc`), WebhookDelivery, ProcessedWebhookEvent (idempotency: `@@unique([provider, eventId])`), DataRetentionPolicy, DataRequest (export/delete jobs), AiUsage, GuildAnalyticsDaily.
- Seed (`prisma/seed.ts`): only creates a **demo guild clearly named `Entrophy Demo (seed)`** with id `000000000000000000`, sample plugin states, one sample automod rule in dry-run, sample retention policy. No fake users/messages.

## 9. Bot host (`apps/bot`)

```
src/index.ts          bootstrap: loadEnv → requireEnv(DISCORD_TOKEN, DATABASE_URL, REDIS_URL) → prisma/redis → registry → client → login → workers → health http → graceful shutdown
src/client.ts         createClient(intents) with partials [Channel, Message, Reaction, GuildMember, User]
src/host/context.ts   builds PluginContext per plugin (child logger, queue factory, config store bindings)
src/host/loader.ts    loads plugins: availability by env/intents; registers events (with guild gating + enablement check + try/catch → events.emit('plugin.error')), components, jobs (BullMQ Worker per queue), onLoad, migrations
src/host/router.ts    interactionCreate: slash → command lookup → guildOnly/availability/enabled/requirement/cooldown → execute; autocomplete; components by customId prefix; modals; unified error handling + t()
src/host/permissions.ts   resolveStaffLevel wrapper using GuildConfig; requirement checks; bot permission checks
src/host/health.ts    tiny http server GET /health → { status, uptime, guilds, ws ping, plugins: {id: health} }
src/register.ts       `pnpm --filter @entrophy/bot register [--global|--guild <id>|--clear]` — REST PUT applicationCommands (DEV_GUILD_ID default when set)
src/workers.ts        BullMQ Worker bootstrap for all plugin jobs + shared queues `bot-actions` (dashboard→bot requests: post role panel, send test welcome, etc.)
```

Also `apps/bot/src/host/bot-actions.ts`: processes `bot-actions` queue jobs `{ type: 'roles.postPanel' | 'welcome.test' | 'tickets.postPanel' | 'moderation.exportCases' | ... , guildId, payload }` by dispatching to `ctx.services`.

## 10. API (`apps/api`)

- Fastify 5 + `fastify-type-provider-zod` (`serializerCompiler`, `validatorCompiler`, `jsonSchemaTransform` for swagger). Swagger UI at `/docs`, JSON at `/docs/json`. Script `openapi:export` writes `docs/openapi.json`.
- Plugins: helmet, cors (`origin: [env.DASHBOARD_URL]`, `credentials: true`), cookie (signed with SESSION_SECRET), rate-limit (global 300/min per IP, auth routes 20/min), sensible.
- Session: `sid` cookie (httpOnly, sameSite `lax`, secure in prod, `domain: COOKIE_DOMAIN?`), 32-byte random id, Redis hash `entrophy:session:<sid>` TTL 7d: `{ userId, username, avatar, accessTokenEnc, refreshTokenEnc, expiresAt, csrfToken }`. `request.session` decorator. Logout deletes.
- CSRF: mutating routes require header `X-CSRF-Token` equal to session csrf token (returned by `GET /auth/me`) **and** `Origin`/`Referer` (when present) must be in the allowlist. Dashboard api client sends the header.
- Auth: `GET /auth/discord/login` (state in Redis 10min, PKCE not required for Discord but include `state`), scopes `identify guilds`; `GET /auth/discord/callback`; `POST /auth/logout`; `GET /auth/me` → `{ user, csrfToken }`. `POST /auth/test-login` only when `E2E_TEST_MODE=true && NODE_ENV!=='production'` (creates a session for a synthetic user + synthetic guild `000000000000000000` where the user is admin) — used by Playwright.
- Guild access: `GET /guilds` → guilds where user has `MANAGE_GUILD` or `ADMINISTRATOR` or is owner (from `/users/@me/guilds` with user token, cached 60s in Redis) intersected with guilds the bot is in (`Guild` table with `botPresent=true`; the bot upserts on guildCreate/guildDelete/ready). Response marks `botPresent` so the dashboard can show an "Add bot" link (invite URL) for others. `preHandler requireGuildAccess` on `/guilds/:guildId/*` re-checks from the cached guild list (403 otherwise). All writes call `writeAudit` with `source: 'dashboard'`.
- Route files (one per feature; each exports `default async function routes(app: FastifyInstance)` registered under prefix `/guilds/:guildId`):
  - `routes/auth.ts`, `routes/guilds.ts` (list, `GET /:guildId` overview — returns `GuildOverviewDto`: `guild` (with `iconUrl`/`botPresent`, a placeholder "Unknown server" row if the bot has never synced the guild), `config`, `stats` (memberCount, pluginsEnabled/pluginCount, openTickets, pendingReviews, moderationCasesLast7d), `plugins` (via `lib/plugin-summaries.ts`'s `buildPluginSummaries`, shared with `routes/plugins.ts`), `setupIncomplete`/`setupIssues`, plus deprecated top-level `pluginCount`/`pluginsEnabled` for older consumers; `GET/PATCH /:guildId/config`)
  - `routes/plugins.ts` — `GET /:guildId/plugins` (manifest summary + enabled + availability + health), `POST /:guildId/plugins/:pluginId/enable|disable`, `GET/PUT /:guildId/plugins/:pluginId/config` (validated with the plugin's zod configSchema; `PUT` also rejects any top-level body key that isn't one of that plugin's own `configSchema` keys with a 400 `validation_error` naming the offending + valid keys — via `assertKnownConfigKeys`, also enforced as a backstop inside `GuildConfigStore.setConfig` itself — so a wrongly-shaped write, e.g. `{ config: {...} }` instead of the bare config object, fails loudly instead of a silent no-op 200 with the extra key persisted into the stored raw JSON, since zod objects strip unknown keys by default)
  - `routes/audit.ts` — `GET /:guildId/audit?cursor&limit&action&actorId`, `GET /:guildId/audit/export.csv`
  - `routes/moderation.ts` — cases list/get/update reason/export.csv, warnings, notes, appeals
  - `routes/automod.ts` — rules CRUD, events (review queue) list/resolve, dry-run toggle
  - `routes/enforcer.ts` — settings get/put, policies CRUD + test, records list/get/decide/export.csv, queue (pending flags) — see §19
  - `routes/donations.ts` (NOT under `/guilds`) — `GET /donations/presets`, `POST /donations/checkout` — see §18
  - `routes/logging.ts` — settings get/put, `GET /:guildId/logs?kind&q&cursor`, export.csv
  - `routes/tickets.ts` — settings, panels CRUD, queue list, ticket get/close/assign, transcript download
  - `routes/roles.ts` — panels CRUD + `POST .../post` (enqueue bot-action), welcome/goodbye config, verification queue approve/deny
  - `routes/engagement.ts`, `routes/community.ts` — leveling config/leaderboard, giveaways/polls/suggestions lists
  - `routes/integrations.ts` — list connections, `GET /:guildId/integrations/:provider/connect` (OAuth start), disconnect, webhook endpoints CRUD (secret shown once), status
  - `routes/ai.ts` — settings + usage
  - `routes/analytics.ts` — `GET /:guildId/analytics?range=7d|30d|90d` (from GuildAnalyticsDaily; only if `GuildConfig.dataCollectionEnabled`)
  - `routes/privacy.ts` — retention policy get/put, `POST /:guildId/data/export` (queues job → downloadable JSON), `POST /:guildId/data/delete` (requires confirmation phrase, queues deletion), `GET /:guildId/data/requests`
  - `routes/webhooks.ts` (NOT under /guilds): `POST /webhooks/github/:endpointId`, `POST /webhooks/stripe`, `POST /webhooks/twitch`, `POST /webhooks/generic/:endpointId` — raw body, signature verification, idempotency via `ProcessedWebhookEvent`, then enqueue to `integrations.inbound` queue
  - `routes/oauth-integrations.ts` — `/integrations/:provider/callback`
- Errors: `setErrorHandler` → `toPublicError` → `{ error: { code, message, details? } }`, zod errors → 400 with issues. Fastify `FST_ERR_*` client errors keep their own 4xx status with a fixed public message table (`empty_body`, `invalid_json`, `unsupported_media_type`, `payload_too_large`); `@fastify/rate-limit`'s 429 → `rate_limited`.
- Tests: `vitest` with `app.inject()` for auth guard, csrf, guild access (mock Redis via `ioredis-mock`), signature verification.

## 11. Dashboard (`apps/dashboard`)

- Next.js 15 App Router, `src/app/`. Tailwind + `@entrophy/ui`. `next-themes` dark mode (class). Responsive sidebar layout.
- Routes:
  ```
  /                                  landing + "Login with Discord" (→ NEXT_PUBLIC_API_URL/auth/discord/login)
  /dashboard                         guild selector (cards; "Add to server" for guilds without bot)
  /dashboard/[guildId]               overview: stats, plugin health, quick links
  /dashboard/[guildId]/plugins       marketplace grid: enable/disable switch, availability badges, config drawer (auto-form from JSON schema of configSchema → API returns `configJsonSchema`)
  /dashboard/[guildId]/moderation    case viewer (table, filters, detail drawer, export)
  /dashboard/[guildId]/automod       rule builder (list + editor form per rule type, dry-run banner, review queue tab)
  /dashboard/[guildId]/enforcer      policies editor, flag queue with decisions, ledger table with search/filter/export, settings
  /dashboard/[guildId]/logging       log channel settings, retention, search, export
  /dashboard/[guildId]/tickets       settings, panels, queue
  /dashboard/[guildId]/roles         role panel builder (+ post), welcome/goodbye embed builder with live preview, verification queue
  /dashboard/[guildId]/engagement    leveling settings + leaderboard
  /dashboard/[guildId]/community     giveaways/polls/suggestions overview
  /dashboard/[guildId]/integrations  connection cards + connect/disconnect + webhook endpoints
  /dashboard/[guildId]/ai            settings + usage
  /dashboard/[guildId]/analytics     charts (only when data collection enabled; otherwise explain + toggle link)
  /dashboard/[guildId]/audit         audit log table + export
  /dashboard/[guildId]/privacy       retention, export/delete controls
  /dashboard/[guildId]/settings      staff roles, locale, timezone, fast actions, data collection toggle
  ```
- Data layer: `src/lib/api.ts` — `apiFetch(path, init)` with `credentials: 'include'`, adds `X-CSRF-Token` from `/auth/me` (cached in a React context `SessionProvider`), throws `ApiClientError`. React Query hooks in `src/lib/queries.ts`. Discord embed preview component `EmbedPreview` in `@entrophy/ui`.
- Auth gate: `src/app/dashboard/layout.tsx` is a client component that calls `/auth/me`; unauthenticated → redirect `/`. (Also `middleware.ts` checks the `sid` cookie exists for a fast redirect — cookies are same-site so present on the dashboard origin only when COOKIE_DOMAIN is a shared parent; skip the middleware check when not.)
- Playwright: `e2e/` with `playwright.config.ts` (`webServer` for dashboard; expects API running with `E2E_TEST_MODE=true`); tests: `login.spec.ts` (unauthenticated redirect; test-login → guild selector visible), `config.spec.ts` (toggle a plugin, change a setting, see audit entry).
- Support link: `src/lib/site.ts#supportServerUrl()` reads `NEXT_PUBLIC_SUPPORT_SERVER_URL` (mirrors the website's
  helper of the same name; `null` when unset). Surfaced as a "Get help on Discord" row in `AppSidebar`'s `Sidebar`
  `footer` slot, and as an extra action in `ErrorState`'s "something went wrong" display — both render nothing
  when the env var is unset.

## 12. `@entrophy/ui`

Components (all accessible, keyboard-friendly, dark-mode aware, `cn()` helper): Button, IconButton, Card, Badge, Input, Textarea, Select, Switch, Checkbox, Label, Tabs, Dialog, Sheet/Drawer, DropdownMenu, Tooltip, Table, Pagination, EmptyState, Skeleton, Alert, Toast (sonner-free simple), FormField, ColorPicker (native input), ChannelPicker/RolePicker (props: options), EmbedPreview (Discord-style), CodeBlock, StatCard, PageHeader, Sidebar/Nav, ThemeToggle. `packages/ui/src/index.ts` re-exports; `tailwind.preset.ts` (colors: brand indigo `#6366f1`, semantic tokens) consumed by dashboard `tailwind.config.ts` (`presets: [preset]`, `content` includes `../../packages/ui/src/**/*.{ts,tsx}`).

## 13. Testing conventions

- Vitest per package (`vitest.config.ts`, `test/**/*.test.ts` or `src/**/__tests__/*.test.ts`). Pure logic is separated from discord.js so tests need no gateway. Mock Redis with `ioredis-mock` where needed. Required suites: core (encryption, signatures, staff level, hierarchy, rate limiter, safe-regex, ssrf, sanitize, time), plugins (automod rule evaluators, moderation escalation + hierarchy integration, registry validation, config store merge), api (auth guard, csrf, guild access, webhook signature routes), database (schema smoke: prisma validate in CI).
- CI (`.github/workflows/ci.yml`): node 22 + pnpm 9 (`pnpm/action-setup`), `pnpm install --frozen-lockfile`, `pnpm db:generate`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`; services postgres:16 + redis:7; step `prisma migrate deploy` + `prisma validate` against the service DB; Playwright job optional (`if: github.event_name == 'push'`) with browsers cached.

## 14. Docker

- `infra/docker/Dockerfile.{bot,api}`: `node:22-alpine`, `corepack enable && corepack prepare pnpm@9.15.9 --activate`, copy workspace manifests, `pnpm install --frozen-lockfile`, copy source, `pnpm db:generate`, `CMD ["pnpm","--filter","@entrophy/bot","start"]` (start = `tsx src/index.ts`). Non-root user. Healthcheck hits `BOT_HEALTH_PORT` / `API_PORT/health`.
- `Dockerfile.dashboard`: multi-stage `next build` with `output: 'standalone'`, `CMD ["node","apps/dashboard/server.js"]`.
- `docker-compose.yml`: `postgres` (16-alpine, volume, healthcheck), `redis` (7-alpine), `migrate` (api image, `pnpm db:migrate`, depends_on healthy postgres), `bot`, `api`, `dashboard` — all `env_file: .env`, DATABASE_URL/REDIS_URL overridden to service hostnames.

## 15. Security defaults (recap, enforced in code)

- No content logging by default (`GuildConfig.logMessageContent=false`, `dataCollectionEnabled=false`).
- All secrets encrypted with `encryptSecret` before DB; decrypted only in-process where used.
- Webhook receivers: raw body, constant-time signature check, idempotency, 5MB limit, no SSRF (outbound URLs pass `assertPublicHttpUrl`).
- Dashboard: session + csrf + origin check + guild permission check on every route; helmet; cors allowlist.
- Bot: staff level + hierarchy + bot permission checks; confirmations for destructive actions; cooldowns; global limiter.
- Regex rules validated with `validateUserRegex`; matches run on truncated content.
- HTML transcripts escaped (`escapeHtml`) and rendered with a strict CSP `<meta>`.
- Errors never leak stack/secrets to users.

## 16. Documentation set (`docs/`, `README.md`)

README (top-level): overview, features, prerequisites, Discord Developer Portal setup, OAuth redirect config, invite URL (scopes `bot applications.commands`, least-privilege permission integer), privileged intents guidance, local setup (with & without Docker), production deployment, plugin configuration guide (link PLUGINS.md), permissions matrix (link PERMISSIONS.md), privacy policy template (link), troubleshooting, roadmap (link). Every plugin's README.md is linked from PLUGINS.md.

## 17. `apps/web` (@entrophy/web)

- Next.js 15 App Router (same versions as dashboard), Tailwind 3, `next dev -p 3003`. Depends only on
  `@entrophy/types` (NOT ui — the website has its own monochrome component set under `src/components/`; NOT core).
- Palette tokens (CSS variables in `src/app/globals.css`): `--ink-0:#050505 --ink-1:#0a0a0a --ink-2:#111111
--ink-3:#171717 --ink-4:#1f1f1f --ink-5:#262626 --ink-6:#333333 --ink-7:#404040 --grey-1:#525252 --grey-2:#737373
--grey-3:#8a8a8a --grey-4:#a3a3a3 --grey-5:#bdbdbd --grey-6:#d4d4d4 --grey-7:#e5e5e5 --paper:#fafafa`.
  Nothing else. Fonts: system stack (`ui-sans-serif, -apple-system, "Segoe UI", Inter, Roboto, sans-serif`) — no
  network font loading (offline builds must work).
- Smoke: `src/components/Smoke.tsx` renders 4–6 absolutely-positioned blurred radial-gradient blobs (`filter: blur(80px)`,
  `mix-blend-mode: screen`, opacity 0.08–0.18) animated with slow translate/scale keyframes (60–120s), disabled under
  `prefers-reduced-motion`; `Grain.tsx` overlays an SVG `feTurbulence` noise data-URI at ~4% opacity; `Glass` card =
  `bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl`.
- Data: `src/data/commands.json` is generated by `pnpm --filter @entrophy/plugins export:commands`
  (`packages/plugins/scripts/export-commands.ts` walks `allPlugins`, calls `data.toJSON()` and emits
  `{ generatedAt, plugins: [{ id, name, description, category, defaultEnabled, privilegedIntents, commands: [{ name,
fullName ("/mod warn"), type: 'slash'|'user'|'message', description, staffLevel?, discordPermissions?: string[],
options: [{name, description, required, type}], subcommands: [{ name, fullName, description, options }] }] }] }`),
  written to `apps/web/src/data/commands.json` AND `docs/commands.json`. Root script `commands:export`. CI runs it and
  fails on `git diff --exit-code` (docs must be regenerated when commands change). Curated copy lives in
  `src/content/plugins.ts` (`Record<PluginId, { headline, whyGaming: string[], highlights: string[] }>`) and
  `src/content/site.ts`.
- Pages: `/`, `/features` (all plugins; anchors per plugin; `/features/[pluginId]` detail with full command table),
  `/enforcer`, `/donate`, `/donate/thanks`, `/donate/cancelled`, `/support`, `/privacy`, `/terms`, `not-found`.
- Donate page: presets [3, 5, 10, 25, 50] USD (from `GET {API}/donations/presets`, which also returns `enabled`),
  custom amount input ($1–$500, whole dollars or cents), single "Donate" CTA → `POST {API}/donations/checkout`
  `{ amountCents, currency: 'usd' }` → `{ url }` → `window.location.assign(url)`. `enabled=false` → explanatory notice.
- Support page (`/support`): the primary support destination — leads with joining the Discord server
  (`supportServerUrl()`; renders a "not linked yet" notice instead of a CTA when unset, same degrade-to-nothing
  contract as the footer), then points to the dashboard (config) and `/features` (command reference). No invented
  SLA or community-size claims. Also linked from the primary nav (`Nav.tsx`) alongside the existing footer link.
- Env (public): `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_DASHBOARD_URL`, `NEXT_PUBLIC_DISCORD_CLIENT_ID`,
  `NEXT_PUBLIC_INVITE_PERMISSIONS` (integer string; default = core `INVITE_PERMISSIONS_BITFIELD`, also exported by the
  commands export as `docs/invite.json`), `NEXT_PUBLIC_SUPPORT_SERVER_URL` (optional; also read by `apps/dashboard`
  via its own `src/lib/site.ts#supportServerUrl()` — see §11). Server env: `WEB_URL`.
- Docker: `infra/docker/Dockerfile.web` (same shape as dashboard, standalone), compose service `web` on 3003.

## 18. Donations API

- Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (already present), `WEB_URL=http://localhost:3003`,
  `DONATION_PRESETS_CENTS=300,500,1000,2500,5000` (optional override), `DONATION_MIN_CENTS=100`,
  `DONATION_MAX_CENTS=50000`. API CORS allowlist = `[DASHBOARD_URL, WEB_URL]`.
- Dependency: `stripe` ^22 in `apps/api`.
- `apps/api/src/routes/donations.ts` (public, no session; rate limit 10/min/IP): `GET /donations/presets` →
  `{ enabled, currency: 'usd', presetsCents: number[], minCents, maxCents }`; `POST /donations/checkout`
  body `{ amountCents: int, currency: 'usd' }` → validates range → creates `Donation` row (PENDING) → Stripe Checkout
  Session (`mode: 'payment'`, `submit_type: 'donate'`, `managed_payments: { enabled: false }` — Stripe's Managed
  Payments (merchant-of-record, adds a 3.5% fee and requires product tax codes) is default-on for new accounts and is
  explicitly disabled per session since donations aren't a merchant-of-record product sale,
  `line_items[0].price_data = { currency, unit_amount, product_data:
{ name: 'Entrophy donation' } }`, `success_url: ${WEB_URL}/donate/thanks?session_id={CHECKOUT_SESSION_ID}`,
  `cancel_url: ${WEB_URL}/donate/cancelled`, `metadata: { kind: 'donation', donationId }`) → stores `stripeSessionId` →
  `{ url }`. 503 `{ error: { code: 'donations_unavailable' } }` when `STRIPE_SECRET_KEY` unset.
- `apps/api/src/lib/donations.ts` exports `handleStripeDonationEvent(prisma, event)` — for `checkout.session.completed`
  / `checkout.session.expired` / `checkout.session.async_payment_failed` with `metadata.kind === 'donation'`: update the
  `Donation` row (PAID with `amountCents = amount_total`, `paidAt`; EXPIRED; FAILED). Idempotent (status transitions
  only forward). **Stores no personal data** (no email/name).
- `routes/webhooks.ts` stripe handler MUST call `handleStripeDonationEvent` first; only non-donation events are
  enqueued to `integrations.inbound`.
- Prisma: `model Donation { id String @id @default(cuid()); stripeSessionId String @unique; stripePaymentIntentId String?;
amountCents Int; currency String @default("usd"); status DonationStatus @default(PENDING); createdAt; paidAt DateTime?;
updatedAt }` + `enum DonationStatus { PENDING PAID FAILED EXPIRED }`.

## 19. `enforcer` plugin

- Plugin id `enforcer` (add to `PluginId` / `PLUGIN_IDS` in `@entrophy/types`, to `allPlugins` after `automod`, and to
  the §7.1 table). Folder `packages/plugins/src/enforcer`. Category `moderation`. `defaultEnabled: false`.
  `privilegedIntents: ['MessageContent']` (automatic flagging only; manual flags via context menu work without it —
  message context-menu interactions include the resolved message content regardless of intent).
  Permissions: ViewChannel, SendMessages, EmbedLinks, ReadMessageHistory (context), ManageChannels (create/lock the
  ledger + queue channels), ManageRoles (mute role), ModerateMembers/KickMembers/BanMembers (executed via the moderation
  service; listed for the audit).
- Depends on the `moderation` plugin being enabled (`/enforcer setup` refuses otherwise with an explanation) and uses
  `ctx.services.require('moderation')`. Optional: `ai` service for assistive scoring; `logging` service for mirroring.
- Commands (`/enforcer` group + one message context menu + `/enforcer appeal`):
  `/enforcer setup` (wizard: ledger channel create/pick + visibility, flag-queue channel create/pick, mute role
  pick/create, capture-context toggle, checks moderation enabled + MessageContent intent + bot permissions; writes
  config; posts a "ledger opened" entry), `/enforcer status`,
  `/enforcer policy create|list|view|edit|delete|toggle|test|import` (import packs: `invites`, `mass-mentions`,
  `scam-links`, `external-links` — no slur lists shipped; "bring your own list"),
  `/enforcer flag user:<user> reason:<text> [policy]` (manual, non-message),
  message context menu **"Flag for review"** (staff ≥ helper) → optional policy select + note → flag,
  `/enforcer search user:<user> [kind] [decision] [policy] [since:<duration>]` (staff ≥ helper; paginated ephemeral),
  `/enforcer record <number>` (detail incl. context snapshot + case link), `/enforcer history user:<user>` (counts),
  `/enforcer export [since]` (admin; CSV attachment, ephemeral),
  `/enforcer appeal record:<number>` (member; modal → `moderation.openAppeal`),
  `/enforcer mute|unmute user:<user> [duration] [reason]` (mute-role shortcuts routed through decisions).
- Config schema: `{ ledgerChannelId: string|null, ledgerVisibility: 'staff'|'everyone' = 'staff', flagChannelId:
string|null, muteRoleId: string|null, captureContext: boolean = true, contextBefore: 1..15 = 5, contextAfter: 0..10 =
3, excerptMaxChars: 50..1000 = 300, autoFlagEnabled: boolean = true, exemptStaff: boolean = true, aiAssist: boolean =
false, dmOnAction: boolean = true, defaultTimeoutMinutes: 60, defaultMuteMinutes: number|null = null (null = until
unmuted), requireReasonOn: ('warn'|'timeout'|'mute'|'kick'|'ban')[] = ['kick','ban'], allowedDecisions:
('warn'|'timeout'|'mute'|'kick'|'ban'|'dismiss')[] = all, banDeleteMessageSeconds: 0..604800 = 0 }`.
- Prisma models:
  ```
  enum PolicySeverity { LOW MEDIUM HIGH CRITICAL }
  enum EnforcerRecordKind { FLAG DECISION APPEAL_OPENED APPEAL_DECIDED NOTE }
  enum EnforcerFlagStatus { PENDING ACTIONED DISMISSED EXPIRED }
  enum EnforcerSource { AUTO MANUAL AI_ASSIST DASHBOARD }
  enum EnforcerDecision { WARN TIMEOUT MUTE UNMUTE KICK BAN DISMISS }
  model EnforcerPolicy { id cuid; guildId; name; description String; enabled Boolean @default(true); severity PolicySeverity @default(MEDIUM);
    matchers Json  // [{type:'keyword'|'phrase'|'regex'|'link_domain'|'invite'|'mention_count'|'attachment_ext'|'ai_category', value: string|string[]|number, caseSensitive?: bool, wholeWord?: bool}]
    channelIds String[]; exemptRoleIds String[]; exemptChannelIds String[]; suggestedAction EnforcerDecision?; createdBy; updatedBy?; deletedAt?; createdAt; updatedAt; records EnforcerRecord[]; @@index([guildId, enabled]) }
  model EnforcerRecord { id cuid; guildId; recordNumber Int; kind EnforcerRecordKind; status EnforcerFlagStatus?; userId; channelId?; messageId?; messageJumpUrl?;
    policyId? → EnforcerPolicy (onDelete: SetNull); policyName?; matcherSummary?; riskScore Float?; aiExplanation?; excerpt?; contextSnapshot Json?; source EnforcerSource;
    flaggedBy?; decision EnforcerDecision?; decidedBy?; decidedAt?; decisionReason?; durationMs Int?; caseId? → ModerationCase (SetNull); parentRecordId?; ledgerMessageId?; flagMessageId?; createdAt;
    @@unique([guildId, recordNumber]) @@index([guildId, userId, createdAt]) @@index([guildId, kind, createdAt]) @@index([guildId, status]) @@index([guildId, policyId]) }
  ```
  Ledger record numbers are per guild (`#E-<n>`), allocated like case numbers (retry on unique violation).
- Policy engine `src/enforcer/engine.ts` (pure, unit-tested): `evaluate(message: NormalizedMessage, policies:
Policy[], opts) → Match[]` where `NormalizedMessage = { content, authorId, authorRoleIds, channelId, mentionsCount,
attachments: {name, contentType?}[], links: string[], invites: string[], isStaff }`; keyword (word-boundary
  case-insensitive by default), phrase, regex (via core `validateUserRegex` at save time and `safeTest` at run time),
  link_domain (hostname suffix match), invite, mention_count (>=), attachment_ext; respects scope + exemptions;
  returns the highest-severity match first. Excerpt = `sanitizeEmbedText(truncate(content, excerptMaxChars))` with
  mentions stripped of pings (`stripMentions` → plain text `@name`).
- Flow (per SPEC §N): auto flag on `messageCreate` (skip bots/webhooks/system, skip exempt, skip staff if exemptStaff,
  cooldown 1 flag / user / policy / 60s via Redis, and dedupe by messageId) → create FLAG record (PENDING; excerpt +
  `contextSnapshot` of the previous `contextBefore` messages `{authorId, at, excerpt}` fetched via
  `channel.messages.fetch({ before, limit })` when captureContext) → post ledger entry (kind FLAG) → post flag-queue
  embed with buttons `enforcer:decide:<recordId>:<decision>` (Warn/Timeout/Mute/Kick/Ban/Dismiss; hidden if not in
  allowedDecisions), `enforcer:context:<recordId>` (View context: live fetch `contextBefore` before + `contextAfter`
  after the flagged message; falls back to snapshot; ephemeral), `enforcer:history:<recordId>` (Suspect history:
  counts + last 5 records ephemeral). All buttons `ownerOnly: false`, requirement staffLevel `moderator` (Dismiss and
  View context: `helper`). Decision click → Redis lock `entrophy:enforcer:lock:<recordId>` (NX PX 30000) + status check
  → for timeout/mute/kick/ban (and warn when required) open a modal (`enforcer:decide-modal:<recordId>:<decision>`
  fields reason (required per config), duration for timeout/mute (parseDuration), banDeleteMessages days for ban) →
  execute via moderation service (`warn` / `timeout` / `kick` / `ban` / for MUTE add `muteRoleId` role through
  `moderation.createCase({type:'ROLE_ADD', metadata:{enforcerMute:true}})` + role add with hierarchy checks; UNMUTE
  reverse) → create DECISION record (parentRecordId = flag, caseId, decidedBy, reason, durationMs) → update FLAG
  (status ACTIONED/DISMISSED, decision fields) → edit flag-queue message (buttons disabled, footer "Decided by <mod>
  at <t>") → ledger entry (kind DECISION) → emit `enforcer.decided`. The suspect is only ever contacted by the bot
  (moderation service DM with case + record numbers + `/enforcer appeal <n>` instructions).
- Ledger channel: created by setup as `#mod-ledger` (or chosen). Overwrites: `@everyone` deny SendMessages,
  SendMessagesInThreads, CreatePublicThreads, CreatePrivateThreads, AddReactions (and deny ViewChannel when visibility
  = staff); each configured staff role: allow ViewChannel + ReadMessageHistory; bot: allow ViewChannel, SendMessages,
  EmbedLinks, ReadMessageHistory. Setup re-applies overwrites (`/enforcer setup` → "repair channel"). Ledger embed
  fields: `Record #E-n`, `User <@id> (id)`, `When <t:..:F>`, `Action`, `Decided by`, `Policy`, `Case #`, `Context`
  (excerpt + `[Jump]` link), footer with source. Ledger posts never ping (allowedMentions: parse []).
- Mute-role overwrite upkeep: the deny SendMessages/SendMessagesInThreads/Speak/AddReactions overwrite for the
  configured mute role is kept in sync by two paths sharing one implementation (`applyMuteRoleToChannel` in
  `channels.ts`) — the bulk `applyMuteRoleToChannels` (used by `/enforcer setup`'s initial role creation and by
  `EnforcerService.repairChannels`, which now also returns `{ muteApplied, muteFailed }` alongside re-applying the
  ledger/flag-queue overwrites) and a `channelCreate` listener (`events/channel-create.ts`) that applies it to a
  single newly-created channel. Both paths cover categories as well as text/voice channels — a category is
  neither text- nor voice-based but still holds its own overwrites, so leaving it out of the bulk path would mean
  a category that existed before setup/repair never got the deny while one created afterward did; applying it
  consistently in both places means a category's current children AND any future ones inherit the deny. Both
  paths no-op silently when no mute role is configured or the configured role no longer resolves
  (`guild.roles.fetch` failure); the listener also never throws (best-effort, logs at `warn`) and relies on the
  host's standard `guildIdOf`-based plugin-enablement gating like every other Enforcer event handler.
- Cross-plugin contract additions:
  - `ServiceMap.moderation` MUST also expose `openAppeal({ guildId, userId, caseNumber?, caseId?, content, source }):
Promise<{ appealId: string }>` and `getCaseByNumber(guildId, caseNumber)`; the moderation plugin emits
    `moderation.appealOpened` and `moderation.appealDecided`.
  - `ServiceMap.enforcer`: `{ decide(input: { guildId, recordId, decision, moderatorId, reason?, durationMs?,
banDeleteMessageSeconds? }): Promise<{ recordNumber }>; flag(input): Promise<{ recordId; recordNumber }>;
search(...) }` — used by the bot-action `enforcer.decide` (dashboard decisions) and by other plugins.
  - `PlatformEventMap` additions: `'moderation.appealOpened': { guildId; appealId; caseId; caseNumber; userId }`,
    `'moderation.appealDecided': { guildId; appealId; caseId; caseNumber; userId; accepted: boolean; reviewerId }`,
    `'enforcer.flagged': { guildId; recordId; recordNumber; userId; policyId?; source }`,
    `'enforcer.decided': { guildId; recordId; recordNumber; userId; decision; moderatorId; caseId? }`.
  - bot-actions: `enforcer.decide`, `enforcer.repairChannels`.
- API `apps/api/src/routes/enforcer.ts` (under `/guilds/:guildId/enforcer`): `GET/PUT settings` (via store),
  `GET/POST policies`, `GET/PUT/DELETE policies/:id`, `POST policies/:id/test` (runs the engine on sample text),
  `GET records?userId&kind&decision&policyId&status&since&cursor`, `GET records/:recordNumber`,
  `POST records/:recordNumber/decide` (enqueue bot-action `enforcer.decide`), `GET records/export.csv`, `GET queue`
  (pending flags).
- Dashboard `/dashboard/[guildId]/enforcer`: tabs Overview/Setup status · Policies (table + matcher builder editor +
  test box) · Queue (pending flags with decision buttons + reason/duration dialog) · Ledger (search/filter table, detail
  drawer with context snapshot, CSV export) · Settings.
- Website `/enforcer` page explains the workflow (from `src/content/enforcer.ts`).

## 20. Monochrome tokens

- `packages/ui/src/styles.css`: surfaces black→grey scale; `--primary` = `#fafafa` on dark / `#0a0a0a` on light;
  `--ring` grey; keep `--success/--warning/--destructive` semantic tokens (dashboard only). `BRAND.color = 0xe5e5e5`
  in core constants (embeds). Dashboard charts use greyscale series with dashed/dotted differentiation.

## 21. Cloud hosting (production target)

Production runs on a cloud host, not a home machine. Deliverables and rules:

- **Recommended path: Railway** (always-on services; managed Postgres + Redis; deploy from GitHub; per-service
  Dockerfile). Ship `infra/railway/README.md` (exact click-path: New Project → Deploy from GitHub → add 4 services from
  the same repo (bot, api, dashboard, web) each with Root Directory `/` and Dockerfile path
  `infra/docker/Dockerfile.<app>` → add Postgres + Redis plugins → set variables (reference `${{Postgres.DATABASE_URL}}`
  and `${{Redis.REDIS_URL}}`) → generate public domains for api/dashboard/web → set OAuth redirect in the Discord
  Developer Portal → run migrations (the `api` image runs `pnpm db:migrate` as a pre-deploy command or a one-off
  `railway run pnpm db:migrate`) → `commands:register`) and `infra/railway/<app>.railway.json` files
  (`{"$schema":"https://railway.app/railway.schema.json","build":{"builder":"DOCKERFILE","dockerfilePath":"infra/docker/Dockerfile.<app>"},"deploy":{"healthcheckPath":"/health","restartPolicyType":"ON_FAILURE"}}` —
  bot uses `BOT_HEALTH_PORT` for its healthcheck; web/dashboard healthcheck `/`).
- **Alternative: Render Blueprint** — root `render.yaml` declaring: `api` (web, docker, healthCheckPath /health,
  preDeployCommand `pnpm db:migrate`), `dashboard` (web, docker), `web` (web, docker), `bot` (worker, docker),
  `entrophy-postgres` (database), `entrophy-redis` (keyvalue/redis). Env vars wired with `fromDatabase`/`fromService`
  and `sync: false` for secrets. Note that free tiers sleep — bots need a paid always-on worker.
- **Alternative: any VPS** with the existing `docker-compose.yml` (document Caddy/Traefik TLS in front).
- Cross-site cookies: PaaS-provided subdomains (`*.up.railway.app`, `*.onrender.com`) are on the Public Suffix List, so
  the API and dashboard are _cross-site_ unless custom domains under one apex are used. Add env
  `SESSION_COOKIE_SAMESITE=lax|none` (default `lax`; when `none`, the cookie is `Secure` and the API refuses to start
  without HTTPS-looking `API_BASE_URL`), and `COOKIE_DOMAIN` for the custom-domain case. CSRF remains protected by the
  `X-CSRF-Token` header + Origin allowlist (`DASHBOARD_URL`, `WEB_URL`). Document both setups with the recommended
  option = custom domain (`api.example.com`, `app.example.com`, `example.com`, `COOKIE_DOMAIN=.example.com`).
- Public URLs needed by features: `API_BASE_URL` (OAuth redirect `${API_BASE_URL}/auth/discord/callback`, Stripe
  webhook `${API_BASE_URL}/webhooks/stripe`, Twitch EventSub/GitHub `${PUBLIC_WEBHOOK_BASE_URL}` = API base),
  `DASHBOARD_URL`, `WEB_URL`.
- Operations docs (`infra/DEPLOYMENT.md`, cloud-first): first deploy checklist, env var table with where each value
  comes from, running migrations, registering commands, rotating secrets, viewing logs, backups (managed Postgres
  snapshots), updating (push to main → auto-deploy), rollback (redeploy previous build), and rough monthly cost
  guidance with a "check current pricing" caveat. GitHub Actions CI stays as the gate before auto-deploy.

## 21a. Production domain: entrophybot.com

Brandon owns `entrophybot.com`. Canonical production layout (use these everywhere docs need a concrete example, and
ship `.env.production.example` pre-filled with them, secrets blank):

| Surface                                     | URL                                                                                                        | Env                                                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Website                                     | `https://entrophybot.com` (+ `www` → redirect to apex)                                                     | `WEB_URL=https://entrophybot.com`                                                            |
| Dashboard                                   | `https://app.entrophybot.com`                                                                              | `DASHBOARD_URL=https://app.entrophybot.com`, `NEXT_PUBLIC_DASHBOARD_URL`                     |
| API                                         | `https://api.entrophybot.com`                                                                              | `API_BASE_URL=https://api.entrophybot.com`, `NEXT_PUBLIC_API_URL`, `PUBLIC_WEBHOOK_BASE_URL` |
| Cookies                                     | shared apex                                                                                                | `COOKIE_DOMAIN=.entrophybot.com`, `SESSION_COOKIE_SAMESITE=lax` (default; `none` not needed) |
| Discord OAuth redirect                      | `https://api.entrophybot.com/auth/discord/callback`                                                        | `DISCORD_OAUTH_REDIRECT_URI`                                                                 |
| Stripe webhook                              | `https://api.entrophybot.com/webhooks/stripe`                                                              | `STRIPE_WEBHOOK_SECRET` from that endpoint                                                   |
| Twitch EventSub / GitHub / generic webhooks | `https://api.entrophybot.com/webhooks/...`                                                                 | —                                                                                            |
| Brand links                                 | `BRAND.siteUrl = 'https://entrophybot.com'`, embed icon `https://entrophybot.com/brand/entrophy-skull.png` | `WEB_URL`                                                                                    |
| Placeholders in policy templates            | `support@entrophybot.com` (Brandon to confirm mailbox), operator name "Entrophy"                           | —                                                                                            |

DNS (documented in `infra/DEPLOYMENT.md`, cloud-first): at the registrar create `CNAME app` / `CNAME api` /
`CNAME www` → the host's per-service targets, and apex `entrophybot.com` via ALIAS/ANAME (or the host's apex
instructions); the host provisions TLS automatically. CORS allowlist = `[DASHBOARD_URL, WEB_URL]`.

## 22. Brand assets (logo = bot avatar)

The Entrophy logo and bot avatar is a pixel-art skull (brighter/cleaner grey pixels on pure black, square,
1254×1254), used everywhere: website, dashboard, bot embed icon, and Discord avatar. Canonical file:
`assets/brand/entrophy-skull.png` (present in the repo, lossless PNG; takes precedence over the `.jpg` when both
exist). `assets/brand/entrophy-skull.jpg` is the same art re-encoded as JPEG, kept only so any URL or cached
reference that still names the `.jpg` file keeps serving the current art instead of 404ing or showing stale art. The
sync script copies every existing shared candidate (both `.png` and `.jpg`, when present) into each app's
`public/brand/`, and writes `public/brand/manifest.json` with `logo` naming the preferred one
(`{ "logo": "/brand/entrophy-skull.png" }`) so pages reference the right extension. If no shared file is present,
everything below must degrade gracefully — never fail a build because it is missing.

- `assets/brand/README.md` documents the expected files and how they are consumed.
- Website: `apps/web/public/brand/entrophy-skull.png` + `.jpg` (copied at build by `scripts/sync-brand.mjs`, root
  script `brand:sync`, run automatically as `prebuild`/`predev` of web and dashboard; the script is a no-op when the
  source is missing) used in the header, hero, Open Graph image (`opengraph-image` route rendering the skull on
  black) and `src/app/apple-icon.png`. The `Logo` component (`apps/web/src/components/Logo.tsx`) reads the
  build-time copy of the manifest at `apps/web/src/data/brand.json` (git-tracked, written by the sync script) rather
  than fetching `public/brand/manifest.json` at runtime, so the logo path is known at build time in every
  environment including the Docker standalone runner.
- Dashboard: same sync into `apps/dashboard/public/brand/entrophy-skull.png` + `.jpg`; the sidebar wordmark
  (`apps/dashboard/src/components/brand-wordmark.tsx`) reads its own build-time manifest copy at
  `apps/dashboard/src/data/brand.json` (git-tracked, same pattern as the web app's) rather than hard-coding the
  path, and falls back to a text wordmark when the image 404s (`<img onError>` → hide) or when the manifest has no
  logo.
- Browser-tab favicons: `apps/web/src/app/icon.png` and `apps/dashboard/src/app/icon.png` (256×256, resized from
  `assets/brand/entrophy-skull.png`, black background kept) are committed static files picked up by Next's
  app-router file convention — `sync-brand.mjs` does not generate or touch them, and no `icons` entry is needed in
  either app's `metadata`. Regenerate both by hand (see `assets/brand/README.md` "Regenerating favicons") whenever
  the canonical skull PNG changes.
- Bot: `pnpm --filter @entrophy/bot set-avatar [--file assets/brand/entrophy-skull.png]` (`apps/bot/src/set-avatar.ts`,
  one-off CLI: logs in, `client.user.setAvatar(buffer)`, exits; warns about Discord's avatar-change rate limit) and
  `BRAND.iconUrl = ${WEB_URL}/brand/entrophy-skull.png` used as embed author/footer icon when `WEB_URL` is set (core
  `constants.ts` exports `brandIconUrl(env)`, default path `/brand/entrophy-skull.png`, overridable via
  `BRAND_LOGO_PATH`).
- Also list `assets/brand/entrophy-skull.png` in the README "Discord Developer Portal setup" step (upload as the App
  Icon and Bot avatar) — the Portal upload is manual.
- Website-only override (optional, currently unused): `assets/brand/entrophy-skull-web.png`/`.jpg`, if ever added,
  would be a variant used by the public website's header/hero/`apple-icon` only, resolved from web-specific
  candidates before falling back to the shared candidates above. No such file exists in the repo today — the shared
  logo already is the clean/bright art the website wants — but the sync script still supports it: on fallback,
  `apps/web/public/brand/manifest.json` and `apps/web/src/data/brand.json` gain a `sharedLogo` key alongside `logo`
  (`{ "logo": "/brand/entrophy-skull.png", "sharedLogo": "/brand/entrophy-skull.png" }` while unused — both point at
  the same shared file); `logo` is "whatever the website displays" and `sharedLogo` always points at the shared file
  for any website code that needs the canonical/bot-avatar image specifically. The dashboard manifest, the bot's
  `set-avatar` script, and `brandIconUrl` (core `constants.ts`) are untouched by this override and always read the
  shared `entrophy-skull.<ext>` — never the web-only variant.
