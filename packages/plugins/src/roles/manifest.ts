// STUB: replaced by the roles build stage
import { z } from 'zod';
import { defineManifest } from '../sdk';

export const configSchema = z.object({}).passthrough();
export type RolesConfig = z.infer<typeof configSchema>;

export const manifest = defineManifest({
  id: 'roles',
  name: 'Roles & Onboarding',
  description: 'Role panels, welcome/goodbye messages, onboarding checklists, and member verification.',
  category: 'community',
  version: '0.1.0',
  defaultEnabled: false,
  permissions: [],
  intents: [],
  requiredEnv: [],
  configSchema,
  dashboard: { path: '/dashboard/[guildId]/roles', label: 'Roles & Onboarding', icon: 'users' },
});
