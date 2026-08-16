// STUB: replaced by the community build stage
import { z } from 'zod';
import { defineManifest } from '../sdk';

export const configSchema = z.object({}).passthrough();
export type CommunityConfig = z.infer<typeof configSchema>;

export const manifest = defineManifest({
  id: 'community',
  name: 'Community',
  description: 'Polls, giveaways, suggestions, scheduled announcements, reminders, and event RSVPs.',
  category: 'community',
  version: '0.1.0',
  defaultEnabled: true,
  permissions: [],
  intents: [],
  requiredEnv: [],
  configSchema,
  dashboard: { path: '/dashboard/[guildId]/community', label: 'Community', icon: 'megaphone' },
});
