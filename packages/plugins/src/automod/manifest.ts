// STUB: replaced by the automod build stage
import { z } from 'zod';
import { defineManifest } from '../sdk';

export const configSchema = z.object({}).passthrough();
export type AutomodConfig = z.infer<typeof configSchema>;

export const manifest = defineManifest({
  id: 'automod',
  name: 'Automod',
  description: 'Configurable automated moderation rules — spam, mentions, invites, word filters — with dry-run mode and a false-positive review queue.',
  category: 'moderation',
  version: '0.1.0',
  defaultEnabled: true,
  permissions: [],
  intents: [],
  requiredEnv: [],
  configSchema,
  dashboard: { path: '/dashboard/[guildId]/automod', label: 'Automod', icon: 'shield-alert' },
});
