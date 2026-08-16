# Moderation plugin

Warnings, timeouts, kicks, bans, cases, and the moderator hierarchy — the platform's core moderation toolkit
(SPEC.md §B). Enabled by default.

## Commands

All moderation actions live under one `/mod` command group (plus two standalone entries):

- `/mod warn <user> [reason] [evidence]` — warns a member; repeated warnings can auto-escalate (see Config below).
- `/mod warnings [user]` — lists a member's warnings, or every currently-active warning guild-wide if no member is given.
- `/mod clearwarns <user> [id]` — clears one warning by id, or every active warning for the member.
- `/mod timeout <user> <duration> [reason]` — times a member out (max 28 days, Discord's own limit).
- `/mod untimeout <user> [reason]` — removes an active timeout.
- `/mod kick <user> [reason] [evidence]` — kicks a member (confirmation required unless `fastActions` is on).
- `/mod ban <user> [reason] [delete-days] [duration] [evidence]` — bans a user; `duration` makes it temporary
  (requires `tempBanEnabled`). Confirmation required unless `fastActions` is on.
- `/mod unban <user-id> [reason]` — unbans by raw user id.
- `/mod softban <user> [reason] [delete-days] [evidence]` — ban + immediate unban, to wipe recent messages
  without a lasting ban. Confirmation required unless `fastActions` is on.
- `/mod purge <count 1-100> [user] [contains] [reason]` — bulk-deletes recent messages. `contains` is only
  honored when the guild's `MessageContent` intent is enabled (`ENABLE_MESSAGE_CONTENT_INTENT=true`); otherwise
  the bot explains and asks you to drop the filter. Confirmation required unless `fastActions` is on.
- `/mod lock [channel] [reason]` / `/mod unlock [channel] [reason]` — toggles `@everyone`'s send-message
  permission on a channel (defaults to the current one).
- `/mod slowmode <seconds|off> [channel]` — sets (or clears) a channel's slowmode.
- `/mod nick <user> <nickname|reset>` — changes a member's nickname (`reset` clears it).
- `/mod note <user> <text>` — adds a staff-only note about a member. Notes are intentionally stored as free text
  (unlike evidence, which is link-only).
- `/mod case <number>` — shows one case's full detail.
- `/mod cases [user] [type]` — paginated case list, optionally filtered.
- `/mod appeal-setup <channel>` — sets the staff channel appeals are posted to (admin only).
- `/mod role add|remove <user> <role> [reason]` — adds/removes one role; a confirmation is required when the
  role carries elevated permissions (Administrator, Ban/Kick Members, Manage Guild/Roles/Channels/Messages,
  Moderate Members, and similar), unless `fastActions` is on.
- `/appeal <case-number>` — member-facing; opens a modal to submit an appeal for one of your own cases.
- Context menu **Warn user** (right-click a member) — opens a reason modal, then warns.
- Context menu **View cases** (right-click a member) — paginated case list for that member.

Every destructive action runs the SDK's hierarchy guard first (can't target yourself, the bot, the server
owner, a bot owner, or someone whose highest role outranks yours or the bot's), and the bot verifies it has the
Discord permission the action needs before attempting it.

## Config keys (per guild)

| Key | Default | Notes |
|---|---|---|
| `modLogChannelId` | `null` | Overrides the core `GuildConfig.modLogChannelId` for this plugin; falls back to it when unset. |
| `appealsChannelId` | `null` | Overrides core `GuildConfig.appealsChannelId`, then `staffChannelId`, when unset. |
| `dmOnAction` | `true` | Combined with core `GuildConfig.dmOnModeration` — **both** must be on for DMs to send. |
| `escalations` | `[{warnings: 3, action: 'timeout', durationMs: 3600000}]` | Ladder of `{warnings, action, durationMs?}` rules; fires once per exact warning-count threshold. |
| `tempBanEnabled` | `true` | Gate for the `/mod ban duration` option. |
| `purgeMax` | `100` | Server-configurable ceiling on `/mod purge count` (Discord's own bulk-delete cap is 100). |
| `requireReasonFor` | `[]` | Any of `kick`, `ban`, `softban` — makes `reason` effectively required for that action. |

## Permissions (why)

ModerateMembers (timeout), KickMembers (kick/softban), BanMembers (ban/unban/softban), ManageMessages + ReadMessageHistory (purge),
ManageChannels (lock/unlock/slowmode), ManageNicknames (nick), ManageRoles (role add/remove), EmbedLinks (mod-log/appeal embeds).
Never requests Administrator. Missing permissions surface a friendly error naming the exact permission.

## Privileged intents

`GuildMembers` is **not** required — every member lookup here goes through a REST fetch by id, not the member
cache. No privileged intents are declared. `/mod purge`'s `contains` filter additionally *degrades gracefully*
when `MessageContent` isn't enabled (it's simply not honored, with an explanation) rather than failing outright.

## Privacy notes

- Evidence is link-only. No message content or attachments are captured automatically anywhere in this plugin.
- `/mod note` intentionally stores free text for staff visibility — keep it professional.
- DM notifications never include buttons (DM interactions can't be routed back through this bot's guild-scoped
  component router) — they're text/embed only, with `/appeal <case>` instructions.
- `/mod purge` never stores deleted message content — only a channel id and count on the case's `metadata`.

## Escalation

After each `/mod warn`, the plugin counts the target's currently-*active* warnings and checks the configured
`escalations` ladder for an exact match on that count. The first (highest-severity, if there's a tie) matching
rule fires automatically — `timeout`, `kick`, or `ban` — attributed to the same moderator who issued the
triggering warning, with reason `"Automatic escalation: reached N active warning(s)."`.

## Temporary punishments & expiry

`/mod timeout` and `/mod ban <duration>` schedule a one-shot BullMQ job (`moderation:expire`, `jobId: case:<id>`,
delayed by the duration) that reverses the action. A repeatable sweep (`moderation:sweep`, every 5 minutes)
catches anything the delayed job missed (a Redis flush, worker downtime) by scanning for `TIMEOUT`/`BAN` cases
whose `expiresAt` has passed but `expiredAt` is still null.

## Appeals

`/appeal <case>` (member) and the **Warn user**/context-menu flows post to the resolved appeals channel with
Accept/Deny buttons. Accepting a `TIMEOUT` case automatically removes the timeout; accepting a `BAN` case posts
an explicit "Unban now" button instead of auto-unbanning (a deliberate extra step for the most consequential
reversal). The dashboard's appeal-decide endpoint only writes the database row (the API process has no Discord
client) — a repeatable job (`moderation:appeal-sync`, every minute) picks up appeals decided from the dashboard
and applies the same Discord-side effects. Idempotency for that job is tracked with a Redis key
(`entrophy:moderation:appeal-applied:<id>`, 30-day TTL) rather than a database column, since `ModerationAppeal`
has no spare JSON field and `decisionNote` is human-facing text, not machine state.

## Dashboard

`/dashboard/[guildId]/moderation` — Cases (table + filters + detail drawer + CSV export), Warnings (by-user
search), Appeals (pending queue with accept/deny + note), Settings (channels, DM toggle, escalation ladder
editor, require-reason toggles).
