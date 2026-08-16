import { GatewayIntentBits, PermissionFlagsBits } from 'discord-api-types/v10';
import { z } from 'zod';
import { defineManifest } from '../sdk';

export const configSchema = z.object({
  /** Guild-wide dry-run switch (TASK config schema). ANDed with each rule's own `dryRun` — either being true means "log only, no action". On by default (SPEC.md §C, ARCHITECTURE.md §7.1: automod ships "dry-run on by default"). */
  dryRun: z.boolean().default(true),
  /** Channel the "alert staff" action and false-positive review queue post to. Null = alerts are skipped with a logged warning. */
  alertChannelId: z.string().nullable().default(null),
  /** Role assigned by the "quarantine" action and by `ACCOUNT_AGE`/`RAID_DETECTION` lockdowns. Null = quarantine actions are skipped with a logged warning. */
  quarantineRoleId: z.string().nullable().default(null),
  /** Members at or above `helper` staff level are exempt from every rule (unless a rule already exempts them by role/user). */
  exemptStaff: z.boolean().default(true),
  /** Default duration for a "timeout" action when the action itself doesn't specify one. */
  defaultTimeoutMs: z
    .number()
    .int()
    .positive()
    .max(28 * 24 * 60 * 60 * 1000)
    .default(600_000),
  /** Guild-wide response to a `RAID_DETECTION` match beyond that rule's own per-rule actions (SPEC.md §C: "never mass-ban"). */
  raidLockdown: z.enum(['none', 'raise-verification', 'quarantine-new-joins']).default('none'),
  /** How long a `quarantine-new-joins` lockdown lasts before auto-lifting. */
  raidLockdownMinutes: z.number().int().min(1).max(1440).default(15),
});

export type AutomodConfig = z.infer<typeof configSchema>;

export const manifest = defineManifest({
  id: 'automod',
  name: 'Automod',
  description:
    'Configurable automated moderation rules — spam, mentions, invites, scam links, word/regex filters, caps, raid detection — with per-rule dry-run, exemptions, and a false-positive review queue.',
  category: 'moderation',
  version: '0.1.0',
  defaultEnabled: true,
  permissions: [
    {
      permission: PermissionFlagsBits.ViewChannel,
      feature: 'reading messages to evaluate rules, and posting alerts',
      optional: false,
      fallback: 'Automod cannot see messages in that channel; rules never fire there.',
    },
    {
      permission: PermissionFlagsBits.SendMessages,
      feature: 'posting alert-staff embeds and the review queue',
      optional: false,
      fallback:
        'Alert embeds fail to send; matches are still recorded and visible via /automod review and the dashboard.',
    },
    {
      permission: PermissionFlagsBits.EmbedLinks,
      feature: 'alert and review-queue embeds',
      optional: false,
      fallback: 'Alerts post as plain text instead of embeds.',
    },
    {
      permission: PermissionFlagsBits.ManageMessages,
      feature: 'the "delete" action',
      optional: true,
      fallback: 'Matching messages are flagged/logged but not deleted.',
    },
    {
      permission: PermissionFlagsBits.ModerateMembers,
      feature: 'the "timeout" action',
      optional: true,
      fallback: 'Matching users are flagged/logged but not timed out.',
    },
    {
      permission: PermissionFlagsBits.ManageRoles,
      feature: 'the "quarantine" action and raid-lockdown quarantine',
      optional: true,
      fallback: 'Quarantine actions are flagged/logged but the role is not assigned.',
    },
    {
      permission: PermissionFlagsBits.ManageGuild,
      feature: 'raising the verification level during a raid lockdown',
      optional: true,
      fallback: '"raise-verification" raid lockdown is skipped; the rule still alerts staff.',
    },
  ],
  // Baseline (non-privileged) gateway intents automod needs: guild events + guild message events (for
  // messageCreate/messageUpdate; message *content* additionally needs the privileged MessageContent intent below).
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  // Content-dependent rule types (DUPLICATE_MESSAGES, INVITE_LINKS, SCAM_LINKS, REGEX_FILTER, WORD_FILTER, CAPS,
  // REPEATED_CHARS, ATTACHMENTS) need MessageContent; ACCOUNT_AGE/RAID_DETECTION need GuildMembers. Both degrade
  // gracefully (rule shows "inactive: requires <intent>") rather than failing the whole plugin — see engine/index.ts.
  privilegedIntents: ['MessageContent', 'GuildMembers'],
  requiredEnv: [],
  configSchema,
  dashboard: { path: '/dashboard/[guildId]/automod', label: 'Automod', icon: 'shield-alert' },
  privacyNotes: [
    "A matched rule's excerpt is stored on its AutomodEvent only when the guild has enabled GuildConfig.logMessageContent; otherwise only metadata (rule, user, channel, action) is recorded.",
    'Content-dependent rules (duplicate messages, invites, scam links, regex/word filters, caps, repeated characters, attachments) only evaluate message text when the server has enabled the Message Content privileged intent; without it they show as inactive rather than silently failing.',
    'Regex filters are validated for catastrophic-backtracking risk before they can be saved, and matching always runs against truncated input.',
    "Raid detection never bans automatically — it can only alert staff, raise the server's verification level, or quarantine new joins for a bounded time.",
  ],
});
