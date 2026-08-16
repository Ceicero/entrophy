// STUB: replaced by the media build stage
import { z } from 'zod';
import { defineManifest } from '../sdk';

export const configSchema = z.object({}).passthrough();
export type MediaConfig = z.infer<typeof configSchema>;

export const manifest = defineManifest({
  id: 'media',
  name: 'Music & Media',
  description:
    'Playlist and queue management for a legal, user-authorized audio source. Unavailable unless MEDIA_PROVIDER names a compliant provider — no YouTube scraping, stream ripping, or copyright bypassing.',
  category: 'media',
  version: '0.1.0',
  defaultEnabled: false,
  permissions: [],
  intents: [],
  // Unavailable (see /plugin status) until a compliant provider is configured, per SPEC.md §I.
  requiredEnv: ['MEDIA_PROVIDER'],
  configSchema,
  dashboard: { path: '/dashboard/[guildId]/media', label: 'Music & Media', icon: 'music' },
});
