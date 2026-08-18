import { GatewayIntentBits, PermissionFlagsBits } from 'discord.js';
import { z } from 'zod';
import { defineManifest } from '../sdk';

export const configSchema = z.object({
  tags: z
    .object({
      enabled: z.boolean().default(true),
      /** Hard cap per guild (abuse guard, not a paywall). */
      maxTags: z.number().int().min(1).max(500).default(200),
      /** Auto-responder cooldown per (guild, tag) in seconds. */
      triggerCooldownSeconds: z.number().int().min(1).max(3600).default(15),
      /** Master switch for keyword triggers (needs the Message Content intent). */
      triggersEnabled: z.boolean().default(false),
    })
    .default({}),
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
  sticky: z
    .object({
      enabled: z.boolean().default(true),
      maxPerGuild: z.number().int().min(1).max(100).default(25),
      defaultCooldownSeconds: z.number().int().min(3).max(600).default(10),
    })
    .default({}),
});

export type CommunityConfig = z.infer<typeof configSchema>;

export const manifest = defineManifest({
  id: 'community',
  name: 'Community',
  description:
    'Polls, giveaways, suggestions, scheduled announcements, reminders, event RSVPs, tags (custom commands / auto-responders), and sticky messages.',
  category: 'community',
  version: '0.1.0',
  defaultEnabled: true,
  permissions: [
    {
      permission: PermissionFlagsBits.SendMessages,
      feature: 'posting polls/giveaways/suggestions/announcements/events, tag replies / auto-responders',
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
      permission: PermissionFlagsBits.ManageMessages,
      feature: "sticky messages (delete the bot's own previous sticky)",
      optional: true,
      fallback: 'The old sticky stays in place; the bot still posts a new one.',
    },
  ],
  // Guilds + GuildMessages are needed for the tag auto-responder's and sticky messages' `messageCreate`
  // handlers (sticky reads no content — only that a message was posted); the privileged Message Content
  // intent only *degrades* the plugin (tag triggers inactive, `/tag` still works) — see the registry's
  // availability() and docs/PLUGINS.md "Availability vs. enabled".
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  privilegedIntents: ['MessageContent'],
  requiredEnv: [],
  configSchema,
  dashboard: { path: '/dashboard/[guildId]/community', label: 'Community', icon: 'megaphone' },
  privacyNotes: [
    'Poll votes, giveaway entries, suggestion votes, reminder text, and event RSVPs are stored for as long as the record exists so results can be shown and re-rendered.',
    'Anonymous polls never store or display who voted for which option — only per-option counts.',
    'Reminder message text you set with /remind is stored until it is delivered (or cancelled) so it can be sent later.',
    'Tags store the text/embed staff wrote and a use counter. Auto-responder triggers compare incoming messages against your trigger phrases in memory only when the Message Content intent is enabled; the messages themselves are never stored.',
    "Sticky messages store only the text/embed staff wrote and the id of the bot's own last post.",
  ],
});
