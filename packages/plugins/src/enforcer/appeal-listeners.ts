import { ChannelType, type Guild, type TextChannel } from 'discord.js';
import type { PluginContext } from '../sdk';
import { buildLedgerEmbed } from './embeds';
import type { EnforcerConfig } from './manifest';
import { withNextRecordNumber } from './service';

async function fetchLedgerChannel(
  ctx: PluginContext,
  guild: Guild,
  config: EnforcerConfig,
): Promise<TextChannel | null> {
  if (!config.ledgerChannelId) return null;
  const channel = await guild.channels.fetch(config.ledgerChannelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return null;
  return channel;
}

/**
 * Subscribes to `moderation.appealOpened`/`moderation.appealDecided` on the in-process platform event bus and
 * writes matching APPEAL_OPENED/APPEAL_DECIDED ledger records whenever the appeal's `caseId` matches an
 * Enforcer DECISION record (ARCHITECTURE.md §19). Call once from `onLoad`.
 */
export function registerAppealListeners(ctx: PluginContext): void {
  ctx.events.on('moderation.appealOpened', async (payload) => {
    const decision = await ctx.prisma.enforcerRecord.findFirst({
      where: { guildId: payload.guildId, kind: 'DECISION', caseId: payload.caseId },
    });
    if (!decision) return;

    const config = await ctx.getConfig<EnforcerConfig>(payload.guildId);
    const row = await withNextRecordNumber(ctx.prisma, payload.guildId, (recordNumber) =>
      ctx.prisma.enforcerRecord.create({
        data: {
          guildId: payload.guildId,
          recordNumber,
          kind: 'APPEAL_OPENED',
          userId: payload.userId,
          policyId: decision.policyId,
          policyName: decision.policyName,
          caseId: payload.caseId,
          parentRecordId: decision.id,
          source: 'MANUAL',
        },
      }),
    );

    const guild = await ctx.client.guilds.fetch(payload.guildId).catch(() => null);
    if (!guild) return;
    const ledgerChannel = await fetchLedgerChannel(ctx, guild, config);
    if (!ledgerChannel) return;

    const embed = buildLedgerEmbed({
      recordNumber: row.recordNumber,
      kind: 'APPEAL_OPENED',
      userId: payload.userId,
      createdAt: row.createdAt,
      action: 'Appeal opened',
      caseNumber: payload.caseNumber,
      policyName: decision.policyName,
      source: 'MANUAL',
    });
    await ledgerChannel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => undefined);
  });

  ctx.events.on('moderation.appealDecided', async (payload) => {
    const decision = await ctx.prisma.enforcerRecord.findFirst({
      where: { guildId: payload.guildId, kind: 'DECISION', caseId: payload.caseId },
    });
    if (!decision) return;

    const config = await ctx.getConfig<EnforcerConfig>(payload.guildId);
    const row = await withNextRecordNumber(ctx.prisma, payload.guildId, (recordNumber) =>
      ctx.prisma.enforcerRecord.create({
        data: {
          guildId: payload.guildId,
          recordNumber,
          kind: 'APPEAL_DECIDED',
          userId: payload.userId,
          policyId: decision.policyId,
          policyName: decision.policyName,
          caseId: payload.caseId,
          decidedBy: payload.reviewerId,
          decidedAt: new Date(),
          parentRecordId: decision.id,
          source: 'MANUAL',
        },
      }),
    );

    const guild = await ctx.client.guilds.fetch(payload.guildId).catch(() => null);
    if (!guild) return;
    const ledgerChannel = await fetchLedgerChannel(ctx, guild, config);
    if (!ledgerChannel) return;

    const embed = buildLedgerEmbed({
      recordNumber: row.recordNumber,
      kind: 'APPEAL_DECIDED',
      userId: payload.userId,
      createdAt: row.createdAt,
      action: payload.accepted ? 'Appeal accepted' : 'Appeal denied',
      decidedBy: payload.reviewerId,
      caseNumber: payload.caseNumber,
      policyName: decision.policyName,
      source: 'MANUAL',
    });
    await ledgerChannel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => undefined);
  });
}
