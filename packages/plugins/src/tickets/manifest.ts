// STUB: replaced by the tickets build stage
import { z } from 'zod';
import { defineManifest } from '../sdk';

export const configSchema = z.object({}).passthrough();
export type TicketsConfig = z.infer<typeof configSchema>;

export const manifest = defineManifest({
  id: 'tickets',
  name: 'Tickets',
  description: 'Button-driven support tickets with categories, staff assignment, tags, and HTML/JSON transcripts.',
  category: 'community',
  version: '0.1.0',
  defaultEnabled: false,
  permissions: [],
  intents: [],
  requiredEnv: [],
  configSchema,
  dashboard: { path: '/dashboard/[guildId]/tickets', label: 'Tickets', icon: 'ticket' },
});
