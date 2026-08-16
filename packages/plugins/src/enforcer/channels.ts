import {
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type GuildBasedChannel,
  type OverwriteResolvable,
  type Role,
  type TextChannel,
  type ThreadChannel,
} from 'discord.js';
import { chunk } from '../sdk';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Builds the `@everyone`/staff-role/bot permission overwrite set for the ledger channel (ARCHITECTURE.md §19). */
function ledgerOverwrites(
  guild: Guild,
  visibility: 'staff' | 'everyone',
  staffRoleIds: string[],
): OverwriteResolvable[] {
  const botId = guild.members.me?.id;
  const overwrites: OverwriteResolvable[] = [
    {
      id: guild.roles.everyone.id,
      deny: [
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.SendMessagesInThreads,
        PermissionFlagsBits.CreatePublicThreads,
        PermissionFlagsBits.CreatePrivateThreads,
        PermissionFlagsBits.AddReactions,
        ...(visibility === 'staff' ? [PermissionFlagsBits.ViewChannel] : []),
      ],
    },
  ];
  for (const roleId of new Set(staffRoleIds)) {
    overwrites.push({
      id: roleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
    });
  }
  if (botId) {
    overwrites.push({
      id: botId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }
  return overwrites;
}

/** The flag-queue channel is always staff-only (it's where mods act on live flags) regardless of ledger visibility. */
function flagQueueOverwrites(guild: Guild, staffRoleIds: string[]): OverwriteResolvable[] {
  const botId = guild.members.me?.id;
  const overwrites: OverwriteResolvable[] = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
  ];
  for (const roleId of new Set(staffRoleIds)) {
    overwrites.push({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }
  if (botId) {
    overwrites.push({
      id: botId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }
  return overwrites;
}

export interface EnsureChannelOptions {
  guild: Guild;
  existingChannelId: string | null;
  fallbackName: string;
  reason: string;
}

/** Fetches `existingChannelId` if it still resolves to a usable text channel, else creates a new one named `fallbackName`. */
export async function ensureTextChannel(options: EnsureChannelOptions): Promise<TextChannel> {
  const { guild, existingChannelId, fallbackName, reason } = options;

  if (existingChannelId) {
    const existing = await guild.channels.fetch(existingChannelId).catch(() => null);
    if (existing && existing.type === ChannelType.GuildText) {
      return existing;
    }
  }

  return guild.channels.create({ name: fallbackName, type: ChannelType.GuildText, reason });
}

/** Applies (or re-applies, for `/enforcer setup` → "repair channel") the ledger channel's permission overwrites. */
export async function applyLedgerOverwrites(
  channel: TextChannel,
  visibility: 'staff' | 'everyone',
  staffRoleIds: string[],
): Promise<void> {
  await channel.permissionOverwrites.set(
    ledgerOverwrites(channel.guild, visibility, staffRoleIds),
    'Enforcer: ledger channel overwrites',
  );
}

/** Applies (or re-applies) the flag-queue channel's permission overwrites. */
export async function applyFlagQueueOverwrites(channel: TextChannel, staffRoleIds: string[]): Promise<void> {
  await channel.permissionOverwrites.set(
    flagQueueOverwrites(channel.guild, staffRoleIds),
    'Enforcer: flag-queue channel overwrites',
  );
}

export interface EnsureMuteRoleOptions {
  guild: Guild;
  existingRoleId: string | null;
  reason: string;
}

/** Fetches `existingRoleId` if it still resolves, else creates a new "Muted" role. Does not apply channel overwrites (see `applyMuteRoleToChannels`). */
export async function ensureMuteRole(options: EnsureMuteRoleOptions): Promise<Role> {
  const { guild, existingRoleId, reason } = options;

  if (existingRoleId) {
    const existing = await guild.roles.fetch(existingRoleId).catch(() => null);
    if (existing) return existing;
  }

  return guild.roles.create({ name: 'Muted', color: 0x2b2d31, permissions: [], mentionable: false, reason });
}

const CHANNEL_BATCH_SIZE = 5;
const CHANNEL_BATCH_DELAY_MS = 1000;

/**
 * Applies deny SendMessages/SendMessagesInThreads/Speak/AddReactions overwrites for `role` across every channel
 * the bot can manage, in small batches with a short delay between them to stay rate-limit friendly
 * (ARCHITECTURE.md §19's "/enforcer setup" mute-role step).
 */
export async function applyMuteRoleToChannels(
  guild: Guild,
  role: Role,
): Promise<{ applied: number; failed: number }> {
  // Threads are text-based but don't carry their own `permissionOverwrites` (they inherit the parent
  // channel's), so they must be excluded explicitly even though `isTextBased()` alone would include them.
  const manageable = [...guild.channels.cache.values()].filter(
    (channel): channel is Exclude<GuildBasedChannel, ThreadChannel> =>
      !channel.isThread() && channel.manageable && (channel.isTextBased() || channel.isVoiceBased()),
  );
  const batches = chunk(manageable, CHANNEL_BATCH_SIZE);

  let applied = 0;
  let failed = 0;

  for (const batch of batches) {
    const results = await Promise.allSettled(
      batch.map((channel) =>
        channel.permissionOverwrites.edit(
          role,
          {
            SendMessages: false,
            SendMessagesInThreads: false,
            Speak: false,
            AddReactions: false,
          },
          { reason: 'Enforcer: apply mute role overwrite' },
        ),
      ),
    );
    for (const result of results) {
      if (result.status === 'fulfilled') applied += 1;
      else failed += 1;
    }
    if (batches.length > 1) await delay(CHANNEL_BATCH_DELAY_MS);
  }

  return { applied, failed };
}
