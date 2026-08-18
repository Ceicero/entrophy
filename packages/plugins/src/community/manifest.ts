import { PermissionFlagsBits } from 'discord.js';
import { z } from 'zod';
import { defineManifest } from '../sdk';

export const configSchema = z.object({
  suggestions: z
    .object({
      channelId: z.string().nullable().default(null),
      threads: z.boolean().default(true),
      dmAuthorOnStatus: z.boolean().default(true),
    })
    .default({}),
  giveaways: z
    .object({
      defaultWinners: z.number().int().min(1).max(50).default(1),
    })
    .default({}),
  eventReminderMinutes: z.array(z.number().int().min(1).max(10_080)).max(5).default([60, 10]),
  polls: z
    .object({
      maxOptions: z.number().int().min(2).max(10).default(10),
    })
    .default({}),
  /** Server-stats counter channels: locked voice channels / categories renamed on a schedule (see stats-channels.ts). */
  statsChannels: z
    .array(
      z.object({
        channelId: z.string(),
        /** Tokens: {members} (all), {humans}, {bots}, {boosts}, {roles}, {channels}, {date} (YYYY-MM-DD, guild tz). */
        template: z.string().min(1).max(90).default('Members: {members}'),
      }),
    )
    .max(10)
    .default([]),
  /** Minimum minutes between automatic stats refreshes per guild (Discord allows 2 channel renames / 10 min). */
  statsRefreshMinutes: z.number().int().min(10).max(1440).default(15),
});

export type CommunityConfig = z.infer<typeof configSchema>;

export const manifest = defineManifest({
  id: 'community',
  name: 'Community',
  description: 'Polls, giveaways, suggestions, scheduled announcements, reminders, and event RSVPs.',
  category: 'community',
  version: '0.1.0',
  defaultEnabled: true,
  permissions: [
    {
      permission: PermissionFlagsBits.SendMessages,
      feature: 'posting polls/giveaways/suggestions/announcements/events',
      optional: false,
      fallback: 'The bot cannot post in the configured channel; the command replies with an error.',
    },
    {
      permission: PermissionFlagsBits.EmbedLinks,
      feature: 'result and status embeds',
      optional: false,
      fallback: 'Falls back to plain text where possible.',
    },
    {
      permission: PermissionFlagsBits.ManageThreads,
      feature: 'auto-threading suggestions',
      optional: true,
      fallback: 'The suggestion is still posted; no thread is created.',
    },
    {
      permission: PermissionFlagsBits.CreatePublicThreads,
      feature: 'auto-threading suggestions',
      optional: true,
      fallback: 'The suggestion is still posted; no thread is created.',
    },
    {
      permission: PermissionFlagsBits.ManageEvents,
      feature: 'creating a native Discord scheduled event for /event create',
      optional: true,
      fallback: 'The event is still tracked and announced in-channel; no Discord Events entry is created.',
    },
    {
      permission: PermissionFlagsBits.ManageChannels,
      feature: 'server-stats counter channels (rename)',
      optional: true,
      fallback: 'Counters stop updating; /statschannel refresh reports the missing permission.',
    },
  ],
  intents: [],
  requiredEnv: [],
  configSchema,
  dashboard: { path: '/dashboard/[guildId]/community', label: 'Community', icon: 'megaphone' },
  privacyNotes: [
    'Poll votes, giveaway entries, suggestion votes, reminder text, and event RSVPs are stored for as long as the record exists so results can be shown and re-rendered.',
    'Anonymous polls never store or display who voted for which option — only per-option counts.',
    'Reminder message text you set with /remind is stored until it is delivered (or cancelled) so it can be sent later.',
    'Stats channels display only aggregate server counts (members, humans, bots, boosts, roles, channels); nothing per member is read or stored.',
  ],
});
