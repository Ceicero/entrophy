// STUB: replaced by the utility build stage
import { z } from 'zod';
import { defineManifest } from '../sdk';

export const configSchema = z.object({}).passthrough();
export type UtilityConfig = z.infer<typeof configSchema>;

export const manifest = defineManifest({
  id: 'utility',
  name: 'Utility',
  description: 'General-purpose utility commands: user/server info, timestamps, reminders, translation, weather, and more.',
  category: 'utility',
  version: '0.1.0',
  defaultEnabled: true,
  permissions: [],
  intents: [],
  requiredEnv: [],
  configSchema,
  dashboard: { path: '/dashboard/[guildId]/utility', label: 'Utility', icon: 'wrench' },
});
