// STUB: replaced by the enforcer build stage
import { z } from 'zod';
import { defineManifest } from '../sdk';

export const configSchema = z.object({}).passthrough();
export type EnforcerConfig = z.infer<typeof configSchema>;

export const manifest = defineManifest({
  id: 'enforcer',
  name: 'Enforcer',
  description:
    'Policy-driven, hands-off moderation: the bot flags possible violations from a server policy and a moderator decides — everything is bookkept in a read-only ledger and the database.',
  category: 'moderation',
  version: '0.1.0',
  defaultEnabled: false,
  permissions: [],
  intents: [],
  privilegedIntents: ['MessageContent'],
  requiredEnv: [],
  configSchema,
  dashboard: { path: '/dashboard/[guildId]/enforcer', label: 'Enforcer', icon: 'scale' },
});
