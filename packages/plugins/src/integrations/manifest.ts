import { GatewayIntentBits, PermissionFlagsBits } from 'discord.js';
import { z } from 'zod';
import { defineManifest } from '../sdk';

// Almost all of this plugin's state lives in `IntegrationConnection`/`WebhookEndpoint`/`OAuthToken` rows
// (per-connection, not per-guild-plugin-config) — there is no meaningful per-guild config to store here.
export const configSchema = z.object({});
export type IntegrationsConfig = z.infer<typeof configSchema>;

export const manifest = defineManifest({
  id: 'integrations',
  name: 'Integrations',
  description:
    'Secure connector framework for optional external services: Twitch, YouTube, GitHub, Reddit, Steam, Google/Microsoft Calendar, Notion, Stripe, and generic webhooks.',
  category: 'integrations',
  version: '0.1.0',
  defaultEnabled: false,
  permissions: [
    {
      permission: PermissionFlagsBits.ViewChannel,
      feature: 'posting alerts / inbound webhook events',
      optional: false,
      fallback: 'Alerts silently fail to post in that channel; connection health shows an error.',
    },
    {
      permission: PermissionFlagsBits.SendMessages,
      feature: 'posting alerts / inbound webhook events',
      optional: false,
      fallback: 'Alerts silently fail to post in that channel; connection health shows an error.',
    },
    {
      permission: PermissionFlagsBits.EmbedLinks,
      feature: 'alert embeds (Twitch/YouTube/GitHub/Reddit/Steam/Calendar/Notion)',
      optional: true,
      fallback: 'Alerts post as plain text instead of a rich embed.',
    },
    {
      permission: PermissionFlagsBits.ManageRoles,
      feature: 'role mention on alert / Stripe role rewards',
      optional: true,
      fallback: 'The configured role is skipped (not mentioned, or not granted/revoked).',
    },
  ],
  intents: [GatewayIntentBits.Guilds],
  requiredEnv: [],
  // Every provider is optional; the plugin degrades per-connection when a given provider's vars are unset.
  optionalEnv: [
    'TWITCH_CLIENT_ID',
    'TWITCH_CLIENT_SECRET',
    'TWITCH_EVENTSUB_SECRET',
    'YOUTUBE_API_KEY',
    'GITHUB_WEBHOOK_SECRET',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'REDDIT_CLIENT_ID',
    'REDDIT_CLIENT_SECRET',
    'REDDIT_USER_AGENT',
    'STEAM_API_KEY',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'MICROSOFT_CLIENT_ID',
    'MICROSOFT_CLIENT_SECRET',
    'NOTION_CLIENT_ID',
    'NOTION_CLIENT_SECRET',
    'PUBLIC_WEBHOOK_BASE_URL',
  ],
  configSchema,
  dashboard: { path: '/dashboard/[guildId]/integrations', label: 'Integrations', icon: 'plug' },
  privacyNotes: [
    'OAuth access/refresh tokens are encrypted at rest (AES-256-GCM) and only decrypted in-process to make an API call.',
    'Inbound/outbound webhook secrets are encrypted at rest and shown in plaintext exactly once, at creation time.',
    'Alert connectors (Twitch/YouTube/Reddit/Steam) only read publicly available data about the watched target — no message content or member data is sent to any provider.',
    'Stripe events never carry card data (SPEC.md §J) — only price ids and the Discord user id supplied in checkout metadata are read.',
    'Outbound webhook payloads are whatever the triggering platform event carries (case numbers, user ids, reasons) — never raw message content.',
  ],
});
