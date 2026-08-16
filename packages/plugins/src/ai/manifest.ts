// STUB: replaced by the ai build stage
import { z } from 'zod';
import { defineManifest } from '../sdk';

export const configSchema = z.object({}).passthrough();
export type AiConfig = z.infer<typeof configSchema>;

export const manifest = defineManifest({
  id: 'ai',
  name: 'AI Assistant',
  description: 'Optional, disabled-by-default AI helper (/ask, /summarize, /draft, /mod-assist) with per-server opt-in and per-channel allowlisting.',
  category: 'ai',
  version: '0.1.0',
  defaultEnabled: false,
  permissions: [],
  intents: [],
  // No global env var is required — the provider and API key are configured per-guild (see `privacyNotes`),
  // via `/ai config`, not through process env. `/plugin status` should read the config, not requiredEnv, to
  // decide whether AI is actually usable for a given guild.
  requiredEnv: [],
  configSchema,
  dashboard: { path: '/dashboard/[guildId]/ai', label: 'AI Assistant', icon: 'sparkles' },
  privacyNotes: [
    'Disabled by default. An admin must opt in and configure a provider and API key in this plugin\'s config before it will respond.',
    'AI responses can be inaccurate; this is disclosed to users on every response.',
    'Content is redacted where possible before being sent to the provider, and the platform does not permit the provider to train on server data by default.',
  ],
});
