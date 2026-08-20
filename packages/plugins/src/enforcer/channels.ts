import {
  ChannelType,
  OverwriteType,
  type Guild,
  type GuildBasedChannel,
  type PermissionOverwriteOptions,
  type Role,
  type TextChannel,
  type ThreadChannel,
} from 'discord.js';
import { chunk } from '../sdk';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** One `permissionOverwrites.edit` call: the role/member Enforcer owns an overwrite for, and what it sets there. */
interface OverwriteEdit {
  targetId: string;
  type: OverwriteType;
  options: PermissionOverwriteOptions;
}

const BOT_CHANNEL_ACCESS: PermissionOverwriteOptions = {
  ViewChannel: true,
  SendMessages: true,
  EmbedLinks: true,
  ReadMessageHistory: true,
};

/**
 * Builds the `@everyone`/staff-role/bot permission overwrites for the ledger channel (ARCHITECTURE.md §19).
 *
 * Order matters: the grants (staff roles, then the bot) come first and the `@everyone` restriction last. These
 * are separate API calls now (see `applyOverwrites`), so a failure part-way through leaves a half-applied
 * channel — and the half that must never be reached alone is "@everyone denied ViewChannel, nobody granted it",
 * which hides a freshly-created ledger from staff and from the bot that has to post in it. Granting first means
 * a partial apply fails open on a channel that was public anyway until this ran.
 */
function ledgerOverwrites(
  guild: Guild,
  visibility: 'staff' | 'everyone',
  staffRoleIds: string[],
): OverwriteEdit[] {
  const botId = guild.members.me?.id;
  const edits: OverwriteEdit[] = [];
  for (const roleId of new Set(staffRoleIds)) {
    edits.push({
      targetId: roleId,
      type: OverwriteType.Role,
      options: { ViewChannel: true, ReadMessageHistory: true },
    });
  }
  if (botId) {
    edits.push({ targetId: botId, type: OverwriteType.Member, options: BOT_CHANNEL_ACCESS });
  }
  edits.push({
    targetId: guild.roles.everyone.id,
    type: OverwriteType.Role,
    options: {
      SendMessages: false,
      SendMessagesInThreads: false,
      CreatePublicThreads: false,
      CreatePrivateThreads: false,
      AddReactions: false,
      // `null`, not omitted: an edit only touches the keys it names, so flipping visibility back to
      // "everyone" has to actively clear the deny a previous staff-only run wrote or the ledger stays
      // hidden forever.
      ViewChannel: visibility === 'staff' ? false : null,
    },
  });
  return edits;
}

/**
 * The flag-queue channel is always staff-only (it's where mods act on live flags) regardless of ledger
 * visibility. Same grants-before-restriction ordering as `ledgerOverwrites`, for the same reason.
 */
function flagQueueOverwrites(guild: Guild, staffRoleIds: string[]): OverwriteEdit[] {
  const botId = guild.members.me?.id;
  const edits: OverwriteEdit[] = [];
  for (const roleId of new Set(staffRoleIds)) {
    edits.push({
      targetId: roleId,
      type: OverwriteType.Role,
      options: { ViewChannel: true, SendMessages: true, ReadMessageHistory: true },
    });
  }
  if (botId) {
    edits.push({ targetId: botId, type: OverwriteType.Member, options: BOT_CHANNEL_ACCESS });
  }
  edits.push({
    targetId: guild.roles.everyone.id,
    type: OverwriteType.Role,
    options: { ViewChannel: false },
  });
  return edits;
}

/**
 * Applies `edits` one target at a time. `permissionOverwrites.set` would be a single request instead of N, but
 * it REPLACES the channel's entire overwrite list — running `/enforcer setup` on a channel that already existed
 * would wipe every unrelated access an admin (or the hub-setup script) had configured there. Enforcer owns only
 * the entries it names here, so each one is merged in with `edit` and everything else is left alone.
 *
 * The flip side is that an overwrite Enforcer wrote on an *earlier* run and no longer names (a role dropped from
 * the staff-role config) survives until someone removes it by hand — the right trade, since silently revoking
 * access we can no longer attribute to ourselves is how the destructive version caused this in the first place.
 *
 * `type` is passed explicitly so a role id that isn't in the cache still resolves (see
 * `PermissionOverwriteManager#upsert`) rather than throwing before the request is made.
 */
async function applyOverwrites(channel: TextChannel, edits: OverwriteEdit[], reason: string): Promise<void> {
  for (const edit of edits) {
    await channel.permissionOverwrites.edit(edit.targetId, edit.options, { reason, type: edit.type });
  }
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
  await applyOverwrites(
    channel,
    ledgerOverwrites(channel.guild, visibility, staffRoleIds),
    'Enforcer: ledger channel overwrites',
  );
}

/** Applies (or re-applies) the flag-queue channel's permission overwrites. */
export async function applyFlagQueueOverwrites(channel: TextChannel, staffRoleIds: string[]): Promise<void> {
  await applyOverwrites(
    channel,
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

/** The deny overwrite set every mute-role apply path uses — the single source of truth so `/enforcer setup`'s
 * bulk apply, `EnforcerService.repairChannels`, and the `channelCreate` upkeep listener can never drift apart. */
const MUTE_ROLE_DENY_OVERWRITES = {
  SendMessages: false,
  SendMessagesInThreads: false,
  Speak: false,
  AddReactions: false,
} as const;

/**
 * Applies the mute-role deny-overwrite set to a single channel (or category — categories can hold overwrites,
 * and applying to one means new child channels inherit the deny automatically). Shared by
 * `applyMuteRoleToChannels` (bulk apply during `/enforcer setup` / repair) and the `channelCreate` listener
 * (keeping a newly-created channel in sync without a full repair).
 */
export async function applyMuteRoleToChannel(
  channel: Exclude<GuildBasedChannel, ThreadChannel>,
  role: Role,
  reason = 'Enforcer: apply mute role overwrite',
): Promise<void> {
  await channel.permissionOverwrites.edit(role, MUTE_ROLE_DENY_OVERWRITES, { reason });
}

/**
 * Applies deny SendMessages/SendMessagesInThreads/Speak/AddReactions overwrites for `role` across every channel
 * the bot can manage — including categories, so a category's current children AND any future ones inherit the
 * deny (matching the `channelCreate` listener's own scope in `events/channel-create.ts`; a repair must not leave
 * pre-existing categories out of sync with newly-created ones) — in small batches with a short delay between
 * them to stay rate-limit friendly (ARCHITECTURE.md §19's "/enforcer setup" mute-role step).
 *
 * `skipped` counts channels the bot cannot manage at all, which are never attempted. They are reported rather
 * than dropped because a muted member can still talk in every one of them — an admin who is told "applied to 12
 * channels" and not that 5 were unreachable has been told the mute works when it partly does not.
 */
export async function applyMuteRoleToChannels(
  guild: Guild,
  role: Role,
): Promise<{ applied: number; failed: number; skipped: number }> {
  // Threads are text-based but don't carry their own `permissionOverwrites` (they inherit the parent
  // channel's), so they must be excluded explicitly even though `isTextBased()` alone would include them.
  // Categories are neither text- nor voice-based (`isTextBased()`/`isVoiceBased()` both false for them), so
  // they need their own explicit type check to be included.
  const relevant = [...guild.channels.cache.values()].filter(
    (channel): channel is Exclude<GuildBasedChannel, ThreadChannel> =>
      !channel.isThread() &&
      (channel.isTextBased() || channel.isVoiceBased() || channel.type === ChannelType.GuildCategory),
  );
  const manageable = relevant.filter((channel) => channel.manageable);
  const skipped = relevant.length - manageable.length;
  const batches = chunk(manageable, CHANNEL_BATCH_SIZE);

  let applied = 0;
  let failed = 0;

  for (const batch of batches) {
    const results = await Promise.allSettled(batch.map((channel) => applyMuteRoleToChannel(channel, role)));
    for (const result of results) {
      if (result.status === 'fulfilled') applied += 1;
      else failed += 1;
    }
    if (batches.length > 1) await delay(CHANNEL_BATCH_DELAY_MS);
  }

  return { applied, failed, skipped };
}
