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
  birthdays: z
    .object({
      enabled: z.boolean().default(false),
      channelId: z.string().nullable().default(null),
      /** Tokens: {mention}, {user}, {server}. */
      message: z.string().max(500).default('🎂 Happy birthday, {mention}!'),
      /** Guild-local hour (0–23) to announce; uses core GuildConfig.timezone. */
      announceHour: z.number().int().min(0).max(23).default(9),
      /** Optional role added for ~24h. */
      roleId: z.string().nullable().default(null),
      /** Let members list upcoming birthdays with /birthday upcoming (and view each other's). */
      publicList: z.boolean().default(true),
    })
    .default({}),
});

export type CommunityConfig = z.infer<typeof configSchema>;

export const manifest = defineManifest({
  id: 'community',
  name: 'Community',
  description:
    'Polls, giveaways, suggestions, scheduled announcements, reminders, event RSVPs, and birthdays.',
  category: 'community',
  version: '0.1.0',
  defaultEnabled: true,
  permissions: [
    {
      permission: PermissionFlagsBits.SendMessages,
      feature: 'posting polls/giveaways/suggestions/announcements/events/birthday announcements',
      optional: false,
      fallback: 'The bot cannot post in the configured channel; the command replies with an error.',
    },
    {
      permission: PermissionFlagsBits.EmbedLinks,
      feature: 'result, status, and birthday list embeds',
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
      permission: PermissionFlagsBits.ManageRoles,
      feature: 'birthday role (optional)',
      optional: true,
      fallback: 'No role is added; the announcement still posts.',
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
    "Birthdays store only the month and day a member chooses to share, per server, until the member removes it or the server's data is deleted. No year, no age, and the bot never DMs about birthdays.",
  ],
});
