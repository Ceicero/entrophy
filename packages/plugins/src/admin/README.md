# `admin` plugin

The platform's always-on control plane. Unlike every other plugin, `admin` is `alwaysEnabled: true` — it cannot be
disabled per guild, since it's what lets staff configure and manage every other plugin.

## What it does

- **`/setup wizard`** — a guided, multi-step ephemeral wizard (role selects for admin/mod/helper staff roles,
  channel selects for the mod-log and staff channels, locale/timezone selects, and a multi-select for which
  plugins to enable) that writes `GuildConfig` and plugin enablement in one pass, with a summary embed at the end.
- **`/setup status`** — shows what has been configured so far, plus a lightweight permissions warning summary.
- **`/config view`** — paginated, ephemeral view of core `GuildConfig` plus every enabled plugin's config keys.
- **`/config set <key> <value>`** — sets a single config key (`guild.<field>` for core config, `<pluginId>.<field>`
  for a plugin's own config), with autocomplete over every known key and type-aware value parsing (booleans,
  numbers, channel/role mentions or ids, comma-separated role/channel lists, "none" to clear a nullable field).
- **`/config reset <key>`** — resets a single key back to its platform/manifest default.
- **`/plugin enable|disable <plugin>`** — toggles a plugin for this guild (refuses `alwaysEnabled` plugins),
  running its `onGuildEnable`/`onGuildDisable` hook via the host.
- **`/plugin status [plugin]`** — enabled/available/degraded state, health, missing bot permissions, and
  privileged intents for one plugin or every plugin.
- **`/plugin list`** — every plugin, grouped by category, with an enabled/disabled marker.
- **`/permissions audit`** — for every *enabled* plugin, diffs its declared bot permissions against what the bot
  actually has in this guild; also warns if the bot's highest role is at or below a configured staff role
  (hierarchy risk), and if a plugin needing a privileged intent (e.g. Message Content) is enabled without it.
- **`/health`** — gateway ping, uptime, guild count, memory, Redis ping, a `SELECT 1` database check, and each
  loaded plugin's `health()` result. Available to moderators, not just admins.

## Config keys

Admin's own `PluginConfig` (`admin.*`) is intentionally small:

| Key | Type | Default | Notes |
|---|---|---|---|
| `fastActions` | boolean | `false` | Mirrors `GuildConfig.fastActions` (the authoritative copy other plugins read). |
| `setupCompleted` | boolean | `false` | Set by `/setup wizard` on completion. |
| `staffChannelId` | string \| null | `null` | Mirrors `GuildConfig.staffChannelId`. |

Everything else staff actually configure day-to-day — staff role ids, locale, timezone, mod-log channel — lives
in the core `GuildConfig` table (`guild.*` keys via `/config set`), not in this plugin's own config. `admin`
reaches it (and every other plugin's enablement/config) through the `host` cross-plugin service
(`ctx.services.require('host')`) rather than the narrower per-plugin `ctx.getConfig`/`ctx.setConfig`, since those
are scoped to "this plugin's own config" by design (see `packages/plugins/src/sdk/services.ts`).

## Permissions

Every admin command replies through the interaction (ephemeral for everything except nothing — all admin
responses are ephemeral), which needs no channel-level bot permission — Discord delivers interaction responses
over the interaction token, not a regular channel send. `manifest.permissions` is intentionally empty.

## Privacy

Every configuration change — the setup wizard, `/config set`/`reset`, plugin enable/disable — is written to the
audit log with the actor, timestamp, and a redacted before/after diff (secrets/tokens/keys are never written in
plain text; see `redactForAudit` in `@entrophy/database`).

## Staff level requirements

| Command | Minimum staff level |
|---|---|
| `/setup wizard`, `/setup status` | admin |
| `/config view\|set\|reset` | admin |
| `/plugin enable\|disable\|status\|list` | admin |
| `/permissions audit` | admin |
| `/health` | moderator |

## Files

```
manifest.ts             PluginManifest (alwaysEnabled, defaultConfig, dashboard path)
config-keys.ts           /config set|reset key introspection + value parsing (pure, unit-tested)
format.ts                 shared embed-formatting helpers (bot permission diffing, uptime/memory formatting)
wizard.ts                 /setup wizard session store + per-step render logic + Finish persistence
index.ts                   wires manifest + commands + components, registers locales
commands/
  setup.ts                 /setup wizard|status
  config.ts                 /config view|set|reset
  plugin.ts                 /plugin enable|disable|status|list
  permissions.ts             /permissions audit
  health.ts                   /health
components/
  wizard.ts                 all /setup wizard button + select-menu handlers
locales/en.json            admin namespace strings
__tests__/config-keys.test.ts   unit tests for config-keys.ts
```

## Notes for the bot-host implementation

`admin` depends on a `host` cross-plugin service (`ServiceMap['host']`, declared in
`packages/plugins/src/sdk/services.ts`) that the bot host process must register before `admin`'s commands are
ever routed to. It needs to expose, at minimum: `enable`/`disable`/`isPluginEnabled`, `listManifests`/`getManifest`,
`getPluginAvailability` (from `PluginRegistry.availability`), `getPluginHealth` (calls a plugin's `health(ctx)` if
defined), `getPluginConfig`/`setPluginConfig` (arbitrary plugin, via `GuildConfigStore`), `getGuildConfig`/
`updateGuildConfig` (via `GuildConfigStore`), and `getBotStats` (ws ping, uptime, guild count, memory). See the
`HostService` interface for exact shapes.

The host's per-plugin `CommandContext.t` should resolve `admin`'s keys using the same "try `admin.<key>`, then
core `<key>`" fallback that `registerPluginLocales('admin', { en })` (called once at module load in `index.ts`)
implements — see `packages/plugins/src/sdk/locales.ts`.
