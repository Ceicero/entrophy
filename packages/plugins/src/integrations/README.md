# integrations

Secure connector framework for optional external services (SPEC.md §J). Disabled by default. Every connector
degrades independently when its env vars are unset — the plugin itself never becomes unavailable.

## What it does

- **Alert watchers** (poll on a cron, one Discord channel + optional role per watched target):
  - **Twitch** — `stream.online` alerts. Uses EventSub (webhook push, near-instant) when `PUBLIC_WEBHOOK_BASE_URL`
    and `TWITCH_EVENTSUB_SECRET` are set, else falls back to polling Helix `GET /streams` every 2 minutes.
  - **YouTube** — new upload alerts, polling the channel's uploads playlist every 10 minutes.
  - **Reddit** — new post alerts for a subreddit's `/new` feed every 5 minutes, with an NSFW filter.
  - **Steam** — app news alerts every 30 minutes.
- **Calendar reminders** — Google Calendar / Microsoft 365 Calendar, OAuth-authorized from the dashboard, polling
  upcoming events every 15 minutes.
- **Notion** — new database page alerts, OAuth-authorized, polling every 10 minutes.
- **GitHub** — inbound webhook (`WebhookEndpoint`, no OAuth) formatting `push`/`pull_request`/`issues`/`release`/
  `star`/`workflow_run` into embeds, with optional `repo:`/`branch:` filters.
- **Stripe** — inbound webhook events (`checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`)
  mapped to Discord role grants/revokes by price id. Never sees or stores card data.
- **Generic webhook** — inbound (templated Discord message from any JSON payload) and **outbound** (POST a signed
  JSON payload to any HTTPS URL on selected platform events: `moderation.caseCreated`, `ticket.opened`,
  `ticket.closed`, `member.verified`, `level.up`, `automod.triggered`, `enforcer.decided`).

## Commands

`/integration connect <provider> [target] [channel] [role] [template]` — OAuth providers reply with a dashboard
link (OAuth must start from a signed-in dashboard session); apikey/public providers (YouTube, Steam) create the
connection immediately if `target`+`channel` are given.
`/integration disconnect <connection>` · `/integration status [connection]` · `/integration list`
`/integration alerts add|remove|list` — Twitch/YouTube/Reddit/Steam watch targets (one `IntegrationConnection` row
per target).
`/integration webhook create|list|delete` — inbound endpoints; the secret is shown exactly once, at creation.
`/integration outbound create|list|delete|test` — outbound endpoints.

## Config keys

No per-guild plugin config — every setting lives on the `IntegrationConnection` (per-watch-target) or
`WebhookEndpoint` (per inbound/outbound endpoint) rows, both created/edited through the commands and API above.

## Permissions

`ViewChannel`/`SendMessages` (post alerts and inbound webhook events — required), `EmbedLinks` (rich embeds instead
of plain text — optional), `ManageRoles` (role mention on alert, Stripe role rewards — optional).

## Privileged intents

None.

## Privacy notes

- OAuth tokens and webhook secrets are encrypted at rest (AES-256-GCM) and only decrypted in-process to make a
  request.
- Webhook secrets are shown in plaintext exactly once, at creation.
- Alert connectors only read publicly available data about the watched target; no member data or message content
  is ever sent to a provider.
- Stripe events never carry card data — only price ids and the Discord user id from checkout metadata.

## Dashboard page

`/dashboard/[guildId]/integrations` — provider cards with connect/disconnect + setup hints (missing env vars),
alert watch management, and inbound/outbound webhook tabs with deliveries.

## Known limitations / design notes

- `apps/bot/src/host/bot-actions.ts`'s dispatcher currently invokes every `ServiceMap` method with a single
  `{ guildId, payload, requestedBy }` job object, regardless of the method's declared positional signature. This
  plugin's `IntegrationsService.sendOutbound`/`testWebhook` are written to tolerate both that call shape and the
  documented positional one (`sdk/services.ts`), but the mismatch itself is a bot-host-owned file this plugin
  cannot fix — flagged for a wiring-stage reconciliation pass.
- Twitch and Reddit are polled with **app-level** credentials (client-credentials grant), not a per-connection
  user OAuth token — matching SPEC.md §J's "client-credentials app token" / "app-only OAuth" wording. `twitch` and
  `reddit` are still listed as OAuth providers in `apps/api/src/lib/integrations/providers.ts` (pre-existing, not
  changed here); that dashboard OAuth flow links the connecting staff member's own account but isn't required for
  alerts to work — `/integration alerts add` (app-token based) is what actually watches a target.
- GitHub's optional `repo:`/`branch:` filters are encoded as extra entries in `WebhookEndpoint.events` (there's no
  dedicated filter column on that model) rather than a real event-type allowlist plus separate filter fields.
