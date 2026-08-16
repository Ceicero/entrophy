// STUB: replaced by the logging build stage
import { z } from 'zod';
import { defineManifest } from '../sdk';

export const configSchema = z.object({}).passthrough();
export type LoggingConfig = z.infer<typeof configSchema>;

export const manifest = defineManifest({
  id: 'logging',
  name: 'Logging',
  description: 'Routes member, message, role, and moderation events to configured log channels, with retention and CSV export.',
  category: 'moderation',
  version: '0.1.0',
  defaultEnabled: true,
  permissions: [],
  intents: [],
  requiredEnv: [],
  configSchema,
  dashboard: { path: '/dashboard/[guildId]/logging', label: 'Logging', icon: 'scroll-text' },
});
