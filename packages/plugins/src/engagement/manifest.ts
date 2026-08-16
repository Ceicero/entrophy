// STUB: replaced by the engagement build stage
import { z } from 'zod';
import { defineManifest } from '../sdk';

export const configSchema = z.object({}).passthrough();
export type EngagementConfig = z.infer<typeof configSchema>;

export const manifest = defineManifest({
  id: 'engagement',
  name: 'Engagement',
  description: 'Leveling/XP with anti-farming controls, leaderboards, reputation, and the starboard.',
  category: 'community',
  version: '0.1.0',
  defaultEnabled: true,
  permissions: [],
  intents: [],
  requiredEnv: [],
  configSchema,
  dashboard: { path: '/dashboard/[guildId]/engagement', label: 'Engagement', icon: 'trending-up' },
});
