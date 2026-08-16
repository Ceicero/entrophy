import { z } from 'zod';
import { PermissionFlagsBits } from 'discord.js';
import { defineManifest } from '../sdk';

const escalationActionSchema = z.enum(['timeout', 'kick', 'ban']);

/** One rung of the warning escalation ladder: "N active warnings -> take this action". */
export const escalationRuleSchema = z
  .object({
    warnings: z.number().int().min(1).max(100),
    action: escalationActionSchema,
    /** Required for `timeout` (Discord requires a duration); optional for `ban` (temp vs permanent); unused for `kick`. */
    durationMs: z
      .number()
      .int()
      .positive()
      .max(28 * 24 * 60 * 60 * 1000)
      .optional(),
  })
  .refine((rule) => rule.action !== 'timeout' || typeof rule.durationMs === 'number', {
    message: 'A timeout escalation rule needs a durationMs (Discord requires a timeout duration).',
    path: ['durationMs'],
  });

export type EscalationRule = z.infer<typeof escalationRuleSchema>;
export type EscalationAction = z.infer<typeof escalationActionSchema>;

export const configSchema = z.object({
  /** Overrides `GuildConfig.modLogChannelId` for this plugin specifically; falls back to the core setting when null. */
  modLogChannelId: z.string().nullable().default(null),
  /** Overrides `GuildConfig.appealsChannelId`; falls back to it, then `GuildConfig.staffChannelId`, when null. */
  appealsChannelId: z.string().nullable().default(null),
  dmOnAction: z.boolean().default(true),
  escalations: z
    .array(escalationRuleSchema)
    .default([{ warnings: 3, action: 'timeout', durationMs: 3_600_000 }]),
  tempBanEnabled: z.boolean().default(true),
  purgeMax: z.number().int().min(1).max(100).default(100),
  requireReasonFor: z.array(z.enum(['kick', 'ban', 'softban'])).default([]),
});

export type ModerationConfig = z.infer<typeof configSchema>;

export const manifest = defineManifest({
  id: 'moderation',
  name: 'Moderation',
  description:
    "Warnings, timeouts, kicks, bans, cases, and the moderator hierarchy — the platform's core moderation toolkit.",
  category: 'moderation',
  version: '0.1.0',
  defaultEnabled: true,
  permissions: [
    {
      permission: PermissionFlagsBits.ModerateMembers,
      feature: 'timeout / untimeout',
      optional: false,
      fallback: 'Timeout commands fail with a friendly error until granted.',
    },
    {
      permission: PermissionFlagsBits.KickMembers,
      feature: 'kick / softban',
      optional: false,
      fallback: 'Kick and softban commands fail with a friendly error until granted.',
    },
    {
      permission: PermissionFlagsBits.BanMembers,
      feature: 'ban / unban / softban',
      optional: false,
      fallback: 'Ban, unban, and softban commands fail with a friendly error until granted.',
    },
    {
      permission: PermissionFlagsBits.ManageMessages,
      feature: 'purge',
      optional: false,
      fallback: '/mod purge fails with a friendly error until granted.',
    },
    {
      permission: PermissionFlagsBits.ManageChannels,
      feature: 'lock / unlock / slowmode',
      optional: false,
      fallback: 'Channel-lock commands fail with a friendly error until granted.',
    },
    {
      permission: PermissionFlagsBits.ManageNicknames,
      feature: 'nick',
      optional: false,
      fallback: '/mod nick fails with a friendly error until granted.',
    },
    {
      permission: PermissionFlagsBits.ManageRoles,
      feature: 'role add / remove',
      optional: false,
      fallback: '/mod role fails with a friendly error until granted.',
    },
    {
      permission: PermissionFlagsBits.EmbedLinks,
      feature: 'mod-log and appeal embeds',
      optional: false,
      fallback: 'Mod-log posts fall back to plain text.',
    },
    {
      permission: PermissionFlagsBits.ReadMessageHistory,
      feature: 'purge (fetching messages to delete)',
      optional: false,
      fallback: '/mod purge fails with a friendly error until granted.',
    },
  ],
  // No gateway events are needed — every action (ban/kick/timeout/purge/member fetch) is a REST call the bot
  // makes on demand from a command, not something it listens for on the gateway.
  intents: [],
  requiredEnv: [],
  configSchema,
  dashboard: { path: '/dashboard/[guildId]/moderation', label: 'Moderation', icon: 'gavel' },
  privacyNotes: [
    'Evidence is link-only — moderators may attach URLs, but message content or attachments are never captured automatically.',
    'Staff notes (`/mod note`) are free-text and intentionally stored for staff visibility; keep them professional and avoid unnecessary personal data.',
    'DM notifications to the affected user never include interactive buttons — Discord DMs are outside the guild interaction context this bot can route back, so DMs are text-only with `/appeal <case>` instructions.',
    'Purge never stores deleted message content — only a channel id and count are recorded on the case.',
  ],
});
