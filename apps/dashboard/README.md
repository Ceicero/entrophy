# @entrophy/dashboard

The Entrophy admin dashboard — a Next.js 15 (App Router) app for configuring the bot per Discord server.

## What it talks to

The dashboard **never** imports `@entrophy/core`, `@entrophy/database`, or `@entrophy/plugins`. It only imports
`@entrophy/ui` (component library) and `@entrophy/types` (shared DTOs), and talks to `apps/api` over HTTP
(`NEXT_PUBLIC_API_URL`, default `http://localhost:3001`). See `docs/ARCHITECTURE.md` §10–§11 for the full route/DTO
contract.

## Running locally

```bash
pnpm --filter @entrophy/dashboard dev     # http://localhost:3000
```

Requires `apps/api` running (see its README) for anything beyond the landing page — the guild selector, plugin
config, audit log, and every other authenticated page all fetch from the API.

Environment variables (see root `.env.example`):

- `NEXT_PUBLIC_API_URL` — base URL of the API (`GET /guilds`, `/auth/*`, etc.)
- `COOKIE_DOMAIN` — only set in production when the API and dashboard share a parent domain; enables the
  fast `sid`-cookie redirect in `src/middleware.ts`. Leave unset locally.

## Structure

- `src/app/` — App Router pages. `/` is the public landing page; everything under `/dashboard` requires a session
  (gated client-side in `src/app/dashboard/layout.tsx` via `useSession()`, backed by `GET /auth/me`).
- `src/app/dashboard/[guildId]/` — the per-guild shell (sidebar + top bar) and every guild-scoped page from
  `docs/ARCHITECTURE.md` §11. Pages for moderation, automod, logging, tickets, roles, engagement, community,
  integrations, and AI are intentionally simple placeholders (`ComingSoonPage`) — later build stages replace them
  with the real UI. Overview, Plugins, Settings, Audit log, Analytics, and Privacy are fully built.
- `src/lib/api.ts` — `apiFetch()`, the one place that talks to the network: attaches cookies, JSON-encodes bodies,
  adds `X-CSRF-Token` on mutations, and throws `ApiClientError` on failure.
- `src/lib/session.tsx` — `SessionProvider` / `useSession()`, backed by `GET /auth/me`.
- `src/lib/queries.ts` — every React Query hook the pages use, with a shared `queryKeys` object for cache
  invalidation.
- `src/lib/format.ts` — date, Discord snowflake, and number formatting helpers.
- `src/lib/json-schema.ts` — the minimal JSON Schema type `JsonSchemaForm` renders from.
- `src/components/` — dashboard-specific components (sidebar, top bar, guild switcher, plugin card, the
  JSON-Schema-driven plugin config form, confirm dialog, data table, error/empty states). Design-system primitives
  (buttons, dialogs, tables, the Discord embed preview, etc.) live in `@entrophy/ui` instead.

## Known gaps (flagged honestly, not hidden)

- A few API response shapes (`GET /guilds/:id` overview, `GET /guilds/:id/privacy/retention`, `GET /guilds/:id/data/*`) are not yet covered by shared DTOs in `@entrophy/types` as of this build.
  The dashboard code calls the paths described in `docs/ARCHITECTURE.md` §10 and is written defensively (optional
  fields, graceful fallbacks) so it degrades rather than crashes if the live API differs slightly. Confirm exact
  shapes against `apps/api`'s OpenAPI docs (`/docs`) once both sides are integrated, and adjust `src/lib/queries.ts`
  if needed.
- `GET /guilds/:id/discord/channels` and `/roles` are served by `apps/api/src/routes/discord.ts` (bot-token
  backed, cached 60s; shapes `DiscordChannelOption[]`/`DiscordRoleOption[]` from `@entrophy/types`). They return
  503 `bot_token_missing` when the API process has no `DISCORD_TOKEN`; in that case every channel/role picker in
  the dashboard (settings, plugin config forms) automatically falls back to a plain text input for the raw Discord id.

## Testing

- `pnpm --filter @entrophy/dashboard typecheck`
- `pnpm --filter @entrophy/dashboard lint`
- `pnpm --filter @entrophy/dashboard build` (needs `NEXT_PUBLIC_API_URL` set; falls back to the local default)
- `pnpm --filter @entrophy/dashboard test:e2e` — Playwright specs in `e2e/`. They self-skip unless `E2E_API_URL` is
  set to a running API instance with `E2E_TEST_MODE=true` (never enable that in production).
