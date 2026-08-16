# `tickets` plugin

Button-driven support tickets: staff-configurable panels post an embed with an "Open a ticket" button; opening
creates a private channel or thread, optionally collecting answers to an intake form first. Staff assign, tag,
and close tickets with a confirmation step, transcripts (JSON + HTML) are generated on close, and an SLA job
alerts support roles when a ticket has gone unanswered too long.

## What it does

- **Panels** — `/ticket panel create` (moderator+) takes the channel, mode (private channel or private thread),
  category, up to 3 support roles, an SLA override, and an "ask the intake form" toggle as slash-command
  options, then opens a modal for the panel's title/description/button text (these need longer free text than a
  slash option comfortably allows). The panel is posted immediately after the modal is submitted.
- **Opening a ticket** — clicking a panel's button (`tickets:open:<panelId>`), or `/ticket open [subject]` for a
  ticket that isn't tied to a panel (uses the server's default support roles/category/mode/SLA instead of a
  panel's). If the panel has an intake form (up to 5 short/paragraph questions, config-defined), a modal collects
  the answers first. A per-user open-ticket limit (`maxOpenPerUser`, default 1) is enforced both when opening and
  again at creation time to close a race window.
  - **Channel mode**: a private text channel `ticket-<number>-<username>` under the configured category, with
    `@everyone` denied View, and the opener + configured support roles + the bot allowed View/Send/Read
    History/Attach Files/Embed Links.
  - **Thread mode**: a private thread in the panel's channel (or, for `/ticket open`, the channel the command was
    run in). Threads can't add a role as a member, so the opening message **mentions** the support roles instead
    (documented here per the TASK spec).
- **Managing a ticket** — `/ticket add|remove <user>`, `/ticket assign [user]`, `/ticket tag add|remove <tag>`
  (all helper+), plus the opening embed's **Claim** and **Add user** buttons (helper+). The **Close** button and
  `/ticket close [reason]` are available to the ticket opener or helper+ staff, and go through a confirm/cancel
  step (skipped when the guild's `fastActions` setting is on) — see `packages/plugins/src/sdk/confirm.ts`.
- **Closing** — generates a JSON transcript (full message list) and an escaped, strict-CSP HTML transcript
  (`packages/plugins/src/tickets/transcript.ts`), stores both on `TicketTranscript`, posts the closing summary +
  HTML transcript to `transcriptChannelId` (if set) and optionally DMs the opener (`dmTranscript`), then locks the
  channel/thread: threads are archived + locked; channels have the opener's permission overwrite removed and are
  deleted after `deleteAfterCloseSeconds` (default 30s) unless `keepClosedChannels` is on.
- **Reopening** — `/ticket reopen <number>` or the closing message's **Reopen** button, available to the opener
  or helper+ staff within `reopenWindowHours` (default 24h) of close; restores the opener's channel permissions
  or unarchives/unlocks the thread, and cancels the pending auto-delete job if it hasn't run yet.
- **Transcripts** — `/ticket transcript [number] [format]` (ephemeral file) works for the ticket the command is
  run in, or (staff-only) any ticket by number; for a still-open ticket with no stored transcript yet it builds
  one on the fly from the live channel/thread history.
- **SLA** — a job (`tickets:sla`, every minute) finds OPEN tickets past `slaDueAt` with no `firstResponseAt`, and
  alerts the ticket's support roles (in the ticket itself, and `alertChannelId` if set) exactly once per ticket
  (a Redis flag dedupes re-alerts across job runs). `firstResponseAt` is set by a `messageCreate` listener the
  first time a member with a configured support role posts in an open ticket — this needs no message content,
  just the author's roles, so it works without the Message Content intent.
- **`/ticket config`** (moderator+) — read-only view of the current settings; edit them from the dashboard
  Settings tab or via the API.

## Commands

| Command                                | Staff level                         | Notes                                                                |
| -------------------------------------- | ----------------------------------- | -------------------------------------------------------------------- |
| `/ticket open [subject]`               | member                              | Any member; blocked by the per-user open-ticket limit.               |
| `/ticket close [reason]`               | opener or helper                    | Confirmation step (or immediate, if `fastActions` is on).            |
| `/ticket add \| remove <user>`         | helper                              | Channel-perm overwrite or thread member add/remove.                  |
| `/ticket assign [user]`                | helper                              | Omit `user` to unassign.                                             |
| `/ticket tag add \| remove <tag>`      | helper                              | Up to 10 tags per ticket.                                            |
| `/ticket transcript [number] [format]` | opener (own ticket) or helper (any) | `format` is `html` (default) or `json`.                              |
| `/ticket reopen <number>`              | opener or helper                    | Only within `reopenWindowHours` of close.                            |
| `/ticket config`                       | moderator                           | View only — edit via the dashboard/API.                              |
| `/ticket panel create ...`             | moderator                           | Slash options + a follow-up modal for title/description/button text. |

## Config keys (`tickets.*`)

`supportRoleIds`, `categoryId`, `mode` (`channel`\|`thread`), `transcriptChannelId`, `transcriptRetentionDays`
(90), `dmTranscript` (false), `slaMinutes` (null), `maxOpenPerUser` (1), `reopenWindowHours` (24),
`deleteAfterCloseSeconds` (30), `keepClosedChannels` (false), `intakeForm` (`{label, style, required}[]`, up to
5, empty by default), `alertChannelId`. A panel's own `categoryId`/`supportRoleIds`/`mode`/`slaMinutes` override
these defaults for tickets opened from that panel; its `intakeForm` is a snapshot of the guild's `intakeForm` at
the time the panel was created (via the "intake" toggle on `/ticket panel create`), not a live reference — edit a
panel's questions from the dashboard's panel editor if they need to change later.

## Permissions

See `manifest.ts`'s `permissions` list for the full per-feature breakdown and fallback behavior. In short: Manage
Channels + Manage Roles for channel-mode tickets, Create Private Threads + Manage Threads for thread-mode
tickets, Send Messages/Embed Links/Attach Files/Read Message History for posting panels, opening embeds, and
transcripts. None are `Administrator`; each degrades to a clear ephemeral error (channel or thread mode only)
rather than failing silently.

## Privileged intents

`MessageContent` (optional/degrading) — Discord withholds `content`/`attachments` on `Message` objects (gateway
**and** REST, including the `channel.messages.fetch()` calls transcripts are built from) from bots without this
intent, for messages that don't mention the bot. Without it, transcripts still record who said something and
when (and attachment links), just not the message text. Check `/plugin status tickets` for the current state.

## Privacy notes

Ticket transcripts (JSON and HTML) store the guild's ticket conversation, including message text when the
Message Content intent is enabled, retained for `transcriptRetentionDays` (default 90) and then purged by the
platform retention job (`packages/database/src/retention.ts`'s `ticketTranscript` target). Intake-form answers
are stored on the `Ticket` row and included in transcripts. See `manifest.ts`'s `privacyNotes` (shown in the
dashboard and `/plugin status`).

## Dashboard

`/dashboard/[guildId]/tickets` — Settings (support roles, category, mode, transcript settings, SLA, intake-form
builder), Panels (list, create, post), Queue (open/closed filter, SLA-breach badge, detail drawer with
participants, transcript downloads, close/assign).

## Files

```
manifest.ts              PluginManifest + TicketsConfig zod schema
channel-name.ts           pure: Discord-safe channel/thread name builder
permissions.ts             pure: channel permission-overwrite builder
sla.ts                      pure: SLA due-date + breach computation
intake.ts                    pure: intake-form answer validation
reopen.ts                     pure: reopen-window check
number.ts                      Ticket.number allocation (retry-on-P2002, mirrors nextCaseNumber)
transcript.ts                   pure: JSON/HTML transcript builders (escaped, strict CSP)
embeds.ts                        panel/opening/closing/reopen embeds + buttons
service.ts                        core flows (open/close/reopen/assign/tags/participants/panels) + TicketsService
index.ts                           wires manifest + commands/components/events/jobs, registers locales
commands/ticket.ts                  the whole `/ticket` command group
components/panel.ts                  panel Open button + intake modal
components/panel-create.ts            `/ticket panel create`'s title/description/button-text modal
components/ticket-actions.ts           Close/Claim/Add user/Reopen buttons + confirm-close handlers
events/message-create.ts                sets firstResponseAt on first staff message
jobs/sla.ts                              every-minute SLA breach alert job
jobs/delete-channel.ts                    delayed channel deletion after close
locales/en.json                            i18n namespace (error/confirmation keys; most in-flow text is
                                            still literal English pending a fuller pass — see Notes below)
__tests__/*.test.ts                          unit tests for every pure module above
```

## Notes for reviewers

- Most user-facing embed/reply text in `commands/`, `components/`, and `service.ts` is literal English rather
  than routed through `c.t()`/`ctx.t()`. The `locales/en.json` namespace and `registerPluginLocales('tickets', …)`
  call are in place; only the shared error/confirmation keys are wired up so far. Flagged in `openIssues` for a
  follow-up i18n pass rather than left silently incomplete.
- `TicketsService.postPanel`/`closeTicketFromDashboard` are dispatched by `apps/bot/src/host/bot-actions.ts`'s
  `bot-actions` worker with a **single merged object** argument (`{ guildId, payload, requestedBy }`), while
  `ServiceMap['tickets']` declares **positional** arguments (`postPanel(guildId, panelId)`). `service.ts` wraps
  both methods in a small dual-calling-convention handler (matching the pattern in `roles`/`ai`/`integrations`/
  `enforcer`'s services) so both the dashboard's object-shape dispatch and any in-process positional call (per
  the declared `TicketsService` type) work correctly. `apps/api/src/routes/tickets.ts` enqueues the object shape
  (`{ type, guildId, payload: { panelId }, requestedBy }` / `{ type, guildId, payload: { ticketId, closedBy,
reason }, requestedBy }`).
