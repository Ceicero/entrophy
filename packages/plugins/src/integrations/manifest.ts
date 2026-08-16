// STUB: replaced by the integrations build stage
import { z } from 'zod';
import { defineManifest } from '../sdk';

export const configSchema = z.object({}).passthrough();
export type IntegrationsConfig = z.infer<typeof configSchema>;

export const manifest = defineManifest({
  id: 'integrations',
  name: 'Integrations',
  description: 'Secure connector framework for optional external services: Twitch, YouTube, GitHub, Reddit, Steam, Google/Microsoft Calendar, Notion, Stripe, and generic webhooks.',
  category: 'integrations',
  version: '0.1.0',
  defaultEnabled: false,
  permissions: [],
  intents: [],
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
  ],
  configSchema,
  dashboard: { path: '/dashboard/[guildId]/integrations', label: 'Integrations', icon: 'plug' },
});
