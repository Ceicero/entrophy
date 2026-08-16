import { ChannelType, type Guild, type TextChannel } from 'discord.js';
import { AppError, NotFoundError, PermissionError, ValidationError, redisKey } from '@entrophy/core';
import { nextEnforcerRecordNumber } from '@entrophy/database/guild';
import { Prisma, type EnforcerRecord, type PrismaClient } from '@entrophy/database';
import {
  fetchMemberSafe,
  hierarchyGuard,
  resolveTextChannel,
  safeDm,
  type PluginContext,
} from '../sdk';
import type { EnforcerDecideInput, EnforcerDecideResult, EnforcerFlagInput, EnforcerFlagResult, EnforcerService } from '../sdk/services';
import { buildExcerpt, type Policy } from './engine';
import { buildDecidedFlagQueueComponents, buildFlagQueueComponents, buildFlagQueueEmbed, buildLedgerEmbed } from './embeds';
import type { EnforcerConfig } from './manifest';
import type { EnforcerDecisionLower, MatcherInput, PolicySeverityValue } from './schemas';

const RECORD_NUMBER_MAX_ATTEMPTS = 3;

/** Retries `create` up to 3 times on a Prisma unique-constraint violation on `[guildId, recordNumber]`, mirroring `@entrophy/database`'s `withNextCaseNumber`. */
export async function withNextRecordNumber<T>(prisma: PrismaClient, guildId: string, create: (recordNumber: number) => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < RECORD_NUMBER_MAX_ATTEMPTS; attempt++) {
    const recordNumber = await nextEnforcerRecordNumber(prisma, guildId);
    try {
      return await create(recordNumber);
    } catch (err) {
      lastError = err;
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue;
      throw err;
    }
  }
  throw lastError;
}

function rowToPolicy(row: { id: string; name: string; enabled: boolean; severity: string; matchers: unknown; channelIds: string[]; exemptRoleIds: string[]; exemptChannelIds: string[] }): Policy {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    severity: row.severity as PolicySeverityValue,
    matchers: (row.matchers as MatcherInput[]) ?? [],
    channelIds: row.channelIds,
    exemptRoleIds: row.exemptRoleIds,
    exemptChannelIds: row.exemptChannelIds,
  };
}

/** Loads every enabled, non-deleted policy for `guildId`, mapped to the pure engine's `Policy` shape. */
export async function loadEnabledPolicies(prisma: PrismaClient, guildId: string): Promise<Policy[]> {
  const rows = await prisma.enforcerPolicy.findMany({ where: { guildId, enabled: true, deletedAt: null } });
  return rows.map(rowToPolicy);
}

async function fetchManagedTextChannel(guild: Guild, channelId: string | null): Promise<TextChannel | null> {
  if (!channelId) return null;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return null;
  return channel;
}

export interface ContextSnapshotEntry {
  authorId: string;
  at: string;
  excerpt: string;
}

/** Fetches the `count` messages immediately before `beforeMessageId` in `channel`, oldest first (ARCHITECTURE.md §19). */
export async function buildContextSnapshot(guild: Guild, channelId: string, beforeMessageId: string, count: number, excerptMaxChars: number): Promise<ContextSnapshotEntry[]> {
  if (count <= 0) return [];
  const channel = await resolveTextChannel(guild, channelId);
  if (!channel || !('messages' in channel)) return [];
  const fetched = await channel.messages.fetch({ before: beforeMessageId, limit: count }).catch(() => null);
  if (!fetched) return [];
  return [...fetched.values()]
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map((m) => ({ authorId: m.author.id, at: m.createdAt.toISOString(), excerpt: buildExcerpt(m.content ?? '', excerptMaxChars) }));
}

export interface FlagRecordInput {
  guildId: string;
  userId: string;
  channelId?: string;
  messageId?: string;
  /** Raw text to build the sanitized excerpt from — the message content for message-based flags, or the free-text reason for a non-message manual flag. */
  content?: string;
  policyId?: string;
  policyName?: string;
  severity?: PolicySeverityValue;
  matcherSummary?: string;
  suggestedAction?: string | null;
  riskScore?: number;
  aiExplanation?: string;
  source: 'AUTO' | 'MANUAL' | 'AI_ASSIST' | 'DASHBOARD';
  flaggedBy?: string;
}

export interface FlagRecordResult {
  recordId: string;
  recordNumber: number;
}

/**
 * Core flag-creation flow shared by auto-flagging (`events/message-create.ts`), manual flagging
 * (`commands/flag.ts`, the "Flag for review" context menu), and the public `EnforcerService.flag` (dashboard,
 * `/enforcer flag`): allocates a record number, captures an excerpt/context snapshot, posts a ledger entry,
 * and posts the flag-queue embed with decision buttons (ARCHITECTURE.md §19).
 */
export async function flagRecord(ctx: PluginContext, input: FlagRecordInput): Promise<FlagRecordResult> {
  const config = await ctx.getConfig<EnforcerConfig>(input.guildId);
  const guild = await ctx.client.guilds.fetch(input.guildId).catch(() => null);
  if (!guild) {
    throw new AppError('guild_unreachable', 'Entrophy could not reach that server right now.', { status: 502, expose: true });
  }

  const messageJumpUrl = input.channelId && input.messageId ? `https://discord.com/channels/${input.guildId}/${input.channelId}/${input.messageId}` : null;
  const excerpt = input.content ? buildExcerpt(input.content, config.excerptMaxChars) : null;

  let contextSnapshot: ContextSnapshotEntry[] | null = null;
  if (config.captureContext && input.channelId && input.messageId) {
    contextSnapshot = await buildContextSnapshot(guild, input.channelId, input.messageId, config.contextBefore, config.excerptMaxChars);
  }

  const { recordId, recordNumber } = await withNextRecordNumber(ctx.prisma, input.guildId, async (recordNumber) => {
    const row = await ctx.prisma.enforcerRecord.create({
      data: {
        guildId: input.guildId,
        recordNumber,
        kind: 'FLAG',
        status: 'PENDING',
        userId: input.userId,
        channelId: input.channelId ?? null,
        messageId: input.messageId ?? null,
        messageJumpUrl,
        policyId: input.policyId ?? null,
        policyName: input.policyName ?? null,
        matcherSummary: input.matcherSummary ?? null,
        riskScore: input.riskScore ?? null,
        aiExplanation: input.aiExplanation ?? null,
        excerpt,
        contextSnapshot: contextSnapshot ? (contextSnapshot as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        source: input.source,
        flaggedBy: input.flaggedBy ?? null,
      },
    });
    return { recordId: row.id, recordNumber: row.recordNumber };
  });

  const createdAt = new Date();

  const ledgerChannel = await fetchManagedTextChannel(guild, config.ledgerChannelId);
  if (ledgerChannel) {
    const embed = buildLedgerEmbed({
      recordNumber,
      kind: 'FLAG',
      userId: input.userId,
      createdAt,
      action: 'Flagged',
      policyName: input.policyName,
      excerpt,
      messageJumpUrl,
      source: input.source,
    });
    await ledgerChannel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch((err) => {
      ctx.logger.warn({ err, guildId: input.guildId, recordId }, 'enforcer: failed to post ledger entry');
    });
  }

  const flagChannel = await fetchManagedTextChannel(guild, config.flagChannelId);
  let flagMessageId: string | null = null;
  if (flagChannel) {
    const embed = buildFlagQueueEmbed({
      recordId,
      recordNumber,
      userId: input.userId,
      createdAt,
      severity: input.severity ?? 'MEDIUM',
      policyName: input.policyName,
      matcherSummary: input.matcherSummary,
      suggestedAction: input.suggestedAction,
      excerpt,
      messageJumpUrl,
      source: input.source,
      riskScore: input.riskScore,
      aiExplanation: input.aiExplanation,
    });
    const components = buildFlagQueueComponents(recordId, config.allowedDecisions);
    const message = await flagChannel.send({ embeds: [embed], components, allowedMentions: { parse: [] } }).catch((err) => {
      ctx.logger.warn({ err, guildId: input.guildId, recordId }, 'enforcer: failed to post flag-queue entry');
      return null;
    });
    flagMessageId = message?.id ?? null;
    if (flagMessageId) {
      await ctx.prisma.enforcerRecord.update({ where: { id: recordId }, data: { flagMessageId } });
    }
  }

  ctx.events.emit('enforcer.flagged', { guildId: input.guildId, recordId, recordNumber, userId: input.userId, policyId: input.policyId, source: input.source });

  return { recordId, recordNumber };
}

const DECIDE_LOCK_TTL_MS = 30_000;

function decisionActionLabel(decision: string, durationMs?: number | null): string {
  if (decision === 'TIMEOUT' && durationMs) return `Timeout (${Math.round(durationMs / 60000)}m)`;
  if (decision === 'MUTE' && durationMs) return `Mute (${Math.round(durationMs / 60000)}m)`;
  if (decision === 'MUTE') return 'Mute (indefinite)';
  const labels: Record<string, string> = { WARN: 'Warn', TIMEOUT: 'Timeout', UNMUTE: 'Unmute', KICK: 'Kick', BAN: 'Ban', DISMISS: 'Dismissed' };
  return labels[decision] ?? decision;
}

function buildDmContent(recordNumber: number, caseNumber: number | undefined, decision: string, reason: string | undefined): string {
  const lines = [
    `A moderator on this server has taken an action on your account: **${decisionActionLabel(decision)}**.`,
    reason ? `Reason: ${reason}` : undefined,
    caseNumber !== undefined ? `Case #${caseNumber} · Record #E-${recordNumber}` : `Record #E-${recordNumber}`,
    `If you believe this was a mistake, you can appeal with \`/enforcer appeal record:${recordNumber}\` (or \`/appeal\` with the case number) on the server.`,
  ].filter((line): line is string => Boolean(line));
  return lines.join('\n');
}

/**
 * Normalizes `decide`'s single argument: a direct `EnforcerDecideInput` call (from this plugin's own decide
 * button/modal handlers) is passed through unchanged; a `bot-actions` worker call (dashboard decisions,
 * ARCHITECTURE.md §9's `apps/bot/src/host/bot-actions.ts` dispatch convention of
 * `{ guildId, payload, requestedBy }`) is unwrapped into the same flat shape.
 */
function normalizeDecideInput(raw: EnforcerDecideInput | { guildId: string; payload: unknown; requestedBy?: string }): EnforcerDecideInput {
  if (raw && typeof raw === 'object' && 'payload' in raw && raw.payload && typeof raw.payload === 'object') {
    const payload = raw.payload as Partial<EnforcerDecideInput>;
    return {
      guildId: raw.guildId,
      recordId: String(payload.recordId ?? ''),
      decision: payload.decision as EnforcerDecideInput['decision'],
      moderatorId: raw.requestedBy ?? String(payload.moderatorId ?? ''),
      reason: payload.reason,
      durationMs: payload.durationMs,
      banDeleteMessageSeconds: payload.banDeleteMessageSeconds,
      source: 'dashboard',
    };
  }
  return raw as EnforcerDecideInput;
}

async function editFlagQueueMessage(ctx: PluginContext, guild: Guild, config: EnforcerConfig, record: EnforcerRecord, decidedBy: string): Promise<void> {
  if (!record.flagMessageId) return;
  const flagChannel = await fetchManagedTextChannel(guild, config.flagChannelId);
  if (!flagChannel) return;
  const message = await flagChannel.messages.fetch(record.flagMessageId).catch(() => null);
  if (!message) return;

  const embed = buildFlagQueueEmbed({
    recordId: record.id,
    recordNumber: record.recordNumber,
    userId: record.userId,
    createdAt: record.createdAt,
    severity: 'MEDIUM',
    policyName: record.policyName,
    matcherSummary: record.matcherSummary,
    excerpt: record.excerpt,
    messageJumpUrl: record.messageJumpUrl,
    source: record.source,
    riskScore: record.riskScore,
    aiExplanation: record.aiExplanation,
    decidedBy,
    decidedAt: new Date(),
  });
  const components = buildDecidedFlagQueueComponents(record.id, config.allowedDecisions);
  await message.edit({ embeds: [embed], components }).catch((err) => {
    ctx.logger.warn({ err, recordId: record.id }, 'enforcer: failed to edit flag-queue message after decision');
  });
}

/** Builds the `EnforcerService` implementation registered in `onLoad` (ARCHITECTURE.md §19). */
export function createEnforcerService(ctx: PluginContext): EnforcerService {
  return {
    async flag(input: EnforcerFlagInput): Promise<EnforcerFlagResult> {
      let policyName: string | undefined;
      let severity: PolicySeverityValue | undefined;
      let suggestedAction: string | null | undefined;

      if (input.policyId) {
        const policy = await ctx.prisma.enforcerPolicy.findFirst({ where: { id: input.policyId, guildId: input.guildId, deletedAt: null } });
        if (policy) {
          policyName = policy.name;
          severity = policy.severity as PolicySeverityValue;
          suggestedAction = policy.suggestedAction ?? undefined;
        }
      }

      const result = await flagRecord(ctx, {
        guildId: input.guildId,
        userId: input.userId,
        channelId: input.channelId,
        messageId: input.messageId,
        content: input.reason,
        policyId: input.policyId,
        policyName,
        severity,
        suggestedAction,
        source: input.source,
        flaggedBy: input.moderatorId,
      });

      return result;
    },

    async decide(rawInput: EnforcerDecideInput | { guildId: string; payload: unknown; requestedBy?: string }): Promise<EnforcerDecideResult> {
      const input = normalizeDecideInput(rawInput);
      if (!input.recordId || !input.decision) {
        throw new ValidationError('A record id and decision are required.');
      }

      const config = await ctx.getConfig<EnforcerConfig>(input.guildId);
      const lockKey = redisKey('enforcer', 'lock', input.recordId);
      const acquired = await ctx.redis.set(lockKey, input.moderatorId, 'PX', DECIDE_LOCK_TTL_MS, 'NX');
      if (acquired !== 'OK') {
        throw new AppError('enforcer_locked', 'This flag is already being decided by another moderator.', { status: 409, expose: true });
      }

      try {
        const record = await ctx.prisma.enforcerRecord.findFirst({ where: { id: input.recordId, guildId: input.guildId, kind: 'FLAG' } });
        if (!record) throw new NotFoundError('That flag record could not be found.');
        if (record.status !== 'PENDING') throw new AppError('enforcer_already_decided', 'This flag has already been decided.', { status: 409, expose: true });

        // UNMUTE isn't one of the flag-queue decision buttons (ARCHITECTURE.md §19 lists Warn/Timeout/Mute/Kick/Ban/Dismiss
        // only) — it only ever arrives via `/enforcer unmute`, so it isn't governed by `allowedDecisions`/`requireReasonOn`
        // (both of which are typed over exactly those six decisions).
        if (input.decision !== 'UNMUTE') {
          const decisionLower = input.decision.toLowerCase() as EnforcerDecisionLower;
          if (!config.allowedDecisions.includes(decisionLower)) {
            throw new PermissionError(`The "${input.decision}" decision is disabled on this server.`);
          }
          if (config.requireReasonOn.includes(decisionLower as 'warn' | 'timeout' | 'mute' | 'kick' | 'ban') && !input.reason?.trim()) {
            throw new ValidationError(`A reason is required to ${decisionLower} this user.`);
          }
        }

        const moderation = ctx.services.get('moderation');
        if (!moderation) {
          throw new AppError('service_unavailable', 'The moderation plugin is not enabled — decisions cannot be recorded without it.', { status: 503, expose: true });
        }

        const guild = await ctx.client.guilds.fetch(input.guildId);
        const actionSource: 'BOT' | 'DASHBOARD' = input.source === 'dashboard' ? 'DASHBOARD' : 'BOT';

        let caseId: string | undefined;
        let caseNumber: number | undefined;
        let durationMs = input.durationMs;

        const targetMember = await fetchMemberSafe(guild, record.userId);
        const actorMember = await fetchMemberSafe(guild, input.moderatorId);
        const guardTarget = () => {
          if (targetMember && actorMember) {
            hierarchyGuard({ guild, member: actorMember }, targetMember, ctx.botOwnerIds, ctx.t);
          }
        };

        switch (input.decision) {
          case 'WARN': {
            const created = await moderation.warn({ guildId: input.guildId, targetId: record.userId, moderatorId: input.moderatorId, reason: input.reason, source: actionSource, dmUser: false });
            caseId = created.id;
            caseNumber = created.caseNumber;
            break;
          }
          case 'TIMEOUT': {
            durationMs = durationMs ?? config.defaultTimeoutMinutes * 60_000;
            const created = await moderation.timeout({ guildId: input.guildId, targetId: record.userId, moderatorId: input.moderatorId, durationMs, reason: input.reason, source: actionSource, dmUser: false });
            caseId = created.id;
            caseNumber = created.caseNumber;
            break;
          }
          case 'KICK': {
            guardTarget();
            if (targetMember) await targetMember.kick(input.reason).catch(() => undefined);
            const created = await moderation.createCase({ guildId: input.guildId, type: 'KICK', targetId: record.userId, moderatorId: input.moderatorId, reason: input.reason, source: actionSource, dmUser: false });
            caseId = created.id;
            caseNumber = created.caseNumber;
            break;
          }
          case 'BAN': {
            guardTarget();
            await guild.members.ban(record.userId, { deleteMessageSeconds: input.banDeleteMessageSeconds ?? config.banDeleteMessageSeconds, reason: input.reason }).catch(() => undefined);
            const created = await moderation.createCase({ guildId: input.guildId, type: 'BAN', targetId: record.userId, moderatorId: input.moderatorId, reason: input.reason, source: actionSource, dmUser: false });
            caseId = created.id;
            caseNumber = created.caseNumber;
            break;
          }
          case 'MUTE': {
            if (!config.muteRoleId) throw new ValidationError('No mute role is configured. Run `/enforcer setup` first.');
            guardTarget();
            if (targetMember) await targetMember.roles.add(config.muteRoleId, input.reason).catch(() => undefined);
            durationMs = durationMs ?? (config.defaultMuteMinutes ? config.defaultMuteMinutes * 60_000 : undefined);
            const created = await moderation.createCase({
              guildId: input.guildId,
              type: 'ROLE_ADD',
              targetId: record.userId,
              moderatorId: input.moderatorId,
              reason: input.reason,
              durationMs,
              source: actionSource,
              dmUser: false,
              metadata: { enforcerMute: true, roleId: config.muteRoleId },
            });
            caseId = created.id;
            caseNumber = created.caseNumber;
            break;
          }
          case 'UNMUTE': {
            if (!config.muteRoleId) throw new ValidationError('No mute role is configured. Run `/enforcer setup` first.');
            if (targetMember) await targetMember.roles.remove(config.muteRoleId, input.reason).catch(() => undefined);
            const created = await moderation.createCase({
              guildId: input.guildId,
              type: 'ROLE_REMOVE',
              targetId: record.userId,
              moderatorId: input.moderatorId,
              reason: input.reason,
              source: actionSource,
              dmUser: false,
              metadata: { enforcerMute: true, roleId: config.muteRoleId },
            });
            caseId = created.id;
            caseNumber = created.caseNumber;
            break;
          }
          case 'DISMISS':
            break;
          default:
            throw new ValidationError(`Unknown decision "${String(input.decision)}".`);
        }

        if (config.dmOnAction && input.decision !== 'DISMISS' && targetMember) {
          await safeDm(targetMember.user, buildDmContent(record.recordNumber, caseNumber, input.decision, input.reason));
        }

        const decisionRow = await withNextRecordNumber(ctx.prisma, input.guildId, (recordNumber) =>
          ctx.prisma.enforcerRecord.create({
            data: {
              guildId: input.guildId,
              recordNumber,
              kind: 'DECISION',
              status: input.decision === 'DISMISS' ? 'DISMISSED' : 'ACTIONED',
              userId: record.userId,
              channelId: record.channelId,
              messageId: record.messageId,
              messageJumpUrl: record.messageJumpUrl,
              policyId: record.policyId,
              policyName: record.policyName,
              decision: input.decision,
              decidedBy: input.moderatorId,
              decidedAt: new Date(),
              decisionReason: input.reason ?? null,
              durationMs: durationMs ?? null,
              caseId: caseId ?? null,
              parentRecordId: record.id,
              // The DECISION row's source describes how the *decision* was made (a human clicking buttons in
              // Discord vs. the dashboard) — distinct from the FLAG row's source (how the flag was raised).
              source: input.source === 'dashboard' ? 'DASHBOARD' : 'MANUAL',
            },
          }),
        );

        await ctx.prisma.enforcerRecord.update({
          where: { id: record.id },
          data: {
            status: input.decision === 'DISMISS' ? 'DISMISSED' : 'ACTIONED',
            decision: input.decision,
            decidedBy: input.moderatorId,
            decidedAt: new Date(),
            decisionReason: input.reason ?? null,
            durationMs: durationMs ?? null,
            caseId: caseId ?? null,
          },
        });

        await editFlagQueueMessage(ctx, guild, config, record, input.moderatorId);

        const ledgerChannel = await fetchManagedTextChannel(guild, config.ledgerChannelId);
        if (ledgerChannel) {
          const embed = buildLedgerEmbed({
            recordNumber: decisionRow.recordNumber,
            kind: 'DECISION',
            userId: record.userId,
            createdAt: decisionRow.createdAt,
            action: decisionActionLabel(input.decision, durationMs),
            decidedBy: input.moderatorId,
            policyName: record.policyName,
            caseNumber,
            excerpt: record.excerpt,
            messageJumpUrl: record.messageJumpUrl,
            source: actionSource,
          });
          await ledgerChannel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch((err) => {
            ctx.logger.warn({ err, guildId: input.guildId }, 'enforcer: failed to post decision ledger entry');
          });
        }

        await ctx.audit({
          guildId: input.guildId,
          actorId: input.moderatorId,
          actorType: 'user',
          action: 'enforcer.decision.create',
          targetType: 'enforcer_record',
          targetId: record.id,
          after: { decision: input.decision, caseId, caseNumber, reason: input.reason },
          source: input.source === 'dashboard' ? 'dashboard' : 'bot',
        });

        ctx.events.emit('enforcer.decided', {
          guildId: input.guildId,
          recordId: record.id,
          recordNumber: record.recordNumber,
          userId: record.userId,
          decision: input.decision,
          moderatorId: input.moderatorId,
          caseId,
        });

        return { recordNumber: record.recordNumber };
      } finally {
        await ctx.redis.del(lockKey);
      }
    },

    async repairChannels(guildIdInput: string | { guildId: string }): Promise<void> {
      const guildId = typeof guildIdInput === 'string' ? guildIdInput : guildIdInput.guildId;
      const { applyFlagQueueOverwrites, applyLedgerOverwrites } = await import('./channels');

      const config = await ctx.getConfig<EnforcerConfig>(guildId);
      const guild = await ctx.client.guilds.fetch(guildId);
      const host = ctx.services.require('host');
      const guildConfig = await host.getGuildConfig(guildId);
      const staffRoleIds = [...guildConfig.adminRoleIds, ...guildConfig.modRoleIds, ...guildConfig.helperRoleIds];

      const ledgerChannel = await fetchManagedTextChannel(guild, config.ledgerChannelId);
      if (ledgerChannel) await applyLedgerOverwrites(ledgerChannel, config.ledgerVisibility, staffRoleIds);

      const flagChannel = await fetchManagedTextChannel(guild, config.flagChannelId);
      if (flagChannel) await applyFlagQueueOverwrites(flagChannel, staffRoleIds);
    },
  };
}
