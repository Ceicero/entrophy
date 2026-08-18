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
  autoPublish: z
    .object({
      /** Announcement (type 5) channel ids whose new messages the bot crossposts. */
      channelIds: z.array(z.string()).max(25).default([]),
      /** Also publish messages sent by other bots/webhooks (default: humans + this bot only). */
      includeBots: z.boolean().default(false),
    })
    .default({}),
  autoThreads: z
    .array(
      z.object({
        channelId: z.string(),
        /** Thread name template; tokens {user}, {user.tag}, {server}, {date} (YYYY-MM-DD). Truncated to 100 chars after render (Discord limit). */
        nameTemplate: z.string().min(1).max(100).default('{user} — {date}'),
        /** Auto-archive duration in minutes: 60 | 1440 | 4320 | 10080. */
        archiveMinutes: z
          .union([z.literal(60), z.literal(1440), z.literal(4320), z.literal(10080)])
          .default(1440),
        /** Skip messages that are only text (no attachment/embed) — for media/showcase channels. */
        requireAttachment: z.boolean().default(false),
        /** Post a short bot message in the new thread; null = no message. Max 300 chars. */
        starterMessage: z.string().max(300).nullable().default(null),
      }),
    )
    .max(25)
    .default([]),
});

export type CommunityConfig = z.infer<typeof configSchema>;
export type AutoPublishConfig = CommunityConfig['autoPublish'];
export type AutoThreadRule = CommunityConfig['autoThreads'][number];

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
      feature: 'auto-threading suggestions, auto-threads',
      optional: true,
      fallback: 'The suggestion/message is still posted; no thread is created.',
    },
    {
      permission: PermissionFlagsBits.CreatePublicThreads,
      feature: 'auto-threading suggestions, auto-threads',
      optional: true,
      fallback: 'The suggestion/message is still posted; no thread is created.',
    },
    {
      permission: PermissionFlagsBits.ManageMessages,
      feature: 'auto-publish (crosspost announcement messages by other members)',
      optional: true,
      fallback:
        "Only the bot's own announcement messages get published; others are skipped and logged once per hour.",
    },
    {
      permission: PermissionFlagsBits.ManageEvents,
      feature: 'creating a native Discord scheduled event for /event create',
      optional: true,
      fallback: 'The event is still tracked and announced in-channel; no Discord Events entry is created.',
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
    'Auto-publish and auto-threads act only on message ids/authors in the channels you list; content is never read or stored.',
  ],
});
