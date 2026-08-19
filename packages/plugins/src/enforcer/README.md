# Enforcer

Policy-driven, hands-off moderation. Moderators' hands stay off the suspect's screen: the bot flags a possible
policy violation, a moderator reviews the exact chat context and picks a decision, and the bot performs the
action and talks to the user. Every flag and every decision is written to a read-only ledger channel and to the
database — searchable, exportable, and appealable.

Disabled by default (`defaultEnabled: false`). Depends on the **moderation** plugin being enabled — `/enforcer
setup` refuses otherwise.

## Why hands-off matters

- **Privacy** — moderators never DM or confront the suspect directly. Only the bot contacts them, and only with
  a consistent, professional message that includes the record number, case number, and how to appeal.
- **Transparency** — every flag and decision is bookkept in a channel nobody but the bot can post in, plus the
  database (the source of truth). Ledger visibility can be staff-only or server-wide.
- **Consistency** — decisions run through the same moderation-plugin pipeline (hierarchy checks, cases, DMs)
  regardless of which moderator clicked the button.

## Commands

All under `/enforcer` (staff-level requirements are enforced per-subcommand, not on the whole command, because
`/enforcer appeal` is member-facing):

| Command                                                             | Staff level     | What it does                                                                                                                                                                |
| ------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/enforcer setup`                                                   | admin           | Create/pick the ledger channel, flag-queue channel, and mute role; toggle context capture; re-apply channel permission overwrites (`repair:true`).                          |
| `/enforcer status`                                                  | helper          | Setup status, moderation dependency, intent status, active policy/pending-flag counts.                                                                                      |
| `/enforcer policy create\|list\|view\|edit\|delete\|toggle\|import` | admin           | Manage policies. `create`/`edit` take one matcher via command options — add more matchers from the dashboard's policy editor. `import` installs a starter pack (see below). |
| `/enforcer policy test`                                             | helper          | Dry-run sample text against policies without flagging anyone.                                                                                                               |
| `/enforcer flag`                                                    | helper          | Manually flag a user for non-message behaviour.                                                                                                                             |
| **"Flag for review"** (message context menu)                        | helper          | Flag a specific message: pick a policy (or none), add an optional note.                                                                                                     |
| `/enforcer search`                                                  | helper          | Search the ledger by user/kind/decision/policy/time window.                                                                                                                 |
| `/enforcer record`                                                  | helper          | Full detail on one record, including its context snapshot.                                                                                                                  |
| `/enforcer history`                                                 | helper          | A user's flag/decision counts + last 5 records.                                                                                                                             |
| `/enforcer export`                                                  | admin           | CSV export of ledger records.                                                                                                                                               |
| `/enforcer appeal`                                                  | member (anyone) | Appeal your own record, if it has a linked moderation case — opens through the moderation plugin's appeal workflow.                                                         |
| `/enforcer mute` / `/enforcer unmute`                               | moderator       | Mute-role shortcuts, routed through the same flag→decision pipeline as everything else (so they're bookkept identically).                                                   |

## Policy packs

`invites`, `mass-mentions`, `scam-links`, `external-links`. No slur lists are shipped — bring your own keyword
list via `/enforcer policy create`. `scam-links` ships a small starter set of domain patterns seen in Discord
Nitro/gift-card phishing scams; it is a starting point, not a comprehensive blocklist.

## Config keys (per guild)

`ledgerChannelId`, `ledgerVisibility` (`staff`/`everyone`), `flagChannelId`, `muteRoleId`, `captureContext`,
`contextBefore`/`contextAfter` (messages), `excerptMaxChars`, `autoFlagEnabled`, `exemptStaff`, `aiAssist`,
`dmOnAction`, `defaultTimeoutMinutes`, `defaultMuteMinutes`, `requireReasonOn`, `allowedDecisions`,
`banDeleteMessageSeconds`. All have defaults — see `manifest.ts`.

## Permissions & intents

See `manifest.ts`'s `permissions` array for the full per-feature breakdown and fallback behaviour. Requires the
**Message Content** privileged intent for _automatic_ flagging only — manual flagging (context menu, `/enforcer
flag`) always has message content available regardless of intent, because Discord resolves it directly on
message-context-menu interactions.

## Privacy notes

- A sanitized excerpt of the flagged message is stored with every flag record.
- When **Capture context** is on (default), a short snapshot of the messages immediately before the flagged one
  is also stored, so a moderator can read the chat without confronting the suspect. Turning it off stops all
  excerpt/context storage going forward — flags then carry only a jump link, which may 404 by review time.
- Ledger and record data follow the moderation-case retention policy and are visible to staff (optionally
  server-wide).
- Optional AI assistance (`aiAssist`) only ever annotates a flag with a risk score/explanation labelled
  _assistive — not a decision_. It never decides or acts on its own.

## Dashboard

`/dashboard/[guildId]/enforcer` — Overview/Setup status, Policies (table + matcher-builder editor + test box),
Queue (pending flags with decision dialogs), Ledger (search/filter/export + detail drawer), Settings.

## Design notes / known simplifications

- `/enforcer setup` is a single command with options rather than a multi-step interactive wizard (unlike
  `admin`'s `/setup wizard`) — a reasonable trade given the scope of this plugin; re-running it with different
  options updates the existing setup, and `repair:true` just re-applies channel overwrites.
- `/enforcer policy create`/`edit` accept exactly one matcher per invocation (Discord slash command options can't
  express a repeated group) — policies needing several matchers should be built or extended from the dashboard's
  matcher-builder editor.
- Mute-role overwrites stay in sync without a manual repair: a `channelCreate` listener re-applies the deny
  SendMessages/SendMessagesInThreads/Speak/AddReactions overwrite to every new channel (and category, so its
  future children inherit it) as soon as it's created, using the same overwrite set `/enforcer setup` and
  `repair:true` apply in bulk — both live in one place (`applyMuteRoleToChannel` in `src/enforcer/channels.ts`).
  All of this is a no-op, silently, when no mute role is configured or the configured role no longer exists.
