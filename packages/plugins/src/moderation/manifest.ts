// STUB: replaced by the moderation build stage
import { z } from 'zod';
import { defineManifest } from '../sdk';

export const configSchema = z.object({}).passthrough();
export type ModerationConfig = z.infer<typeof configSchema>;

export const manifest = defineManifest({
  id: 'moderation',
  name: 'Moderation',
  description: 'Warnings, timeouts, kicks, bans, cases, and the moderator hierarchy — the platform\'s core moderation toolkit.',
  category: 'moderation',
  version: '0.1.0',
  defaultEnabled: true,
  permissions: [],
  intents: [],
  requiredEnv: [],
  configSchema,
  dashboard: { path: '/dashboard/[guildId]/moderation', label: 'Moderation', icon: 'shield' },
});
