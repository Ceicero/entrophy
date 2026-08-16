// STUB: replaced by the economy build stage
import { z } from 'zod';
import { defineManifest } from '../sdk';

export const configSchema = z.object({}).passthrough();
export type EconomyConfig = z.infer<typeof configSchema>;

export const manifest = defineManifest({
  id: 'economy',
  name: 'Economy',
  description: 'Virtual currency economy (balance, daily, give, leaderboard) — no real-money functionality. Disabled by default.',
  category: 'community',
  version: '0.1.0',
  defaultEnabled: false,
  permissions: [],
  intents: [],
  requiredEnv: [],
  configSchema,
  dashboard: { path: '/dashboard/[guildId]/economy', label: 'Economy', icon: 'coins' },
});
