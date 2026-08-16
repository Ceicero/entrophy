import type { Message } from 'discord.js';
import { redisKey } from '@entrophy/core';
import type { PluginEventHandler } from '../../sdk';
import { evaluate } from '../engine';
import type { EnforcerConfig } from '../manifest';
import { normalizeMessage } from '../normalize';
import { flagRecord, loadEnabledPolicies } from '../service';

const DEDUPE_TTL_SECONDS = 120;
const COOLDOWN_SECONDS = 60;

/**
 * Auto-flags messages that match an enabled policy (ARCHITECTURE.md §19). Only runs when the Message Content
 * privileged intent is enabled — without it `message.content` is blank for everyone but the bot itself, so
 * content-dependent matchers could never fire and the plugin runs in fully manual mode instead.
 */
export const messageCreateHandler: PluginEventHandler<'messageCreate'> = {
  event: 'messageCreate',
  guildIdOf: (message: Message) => message.guildId,
  async handler(ctx, message) {
    if (!ctx.intentsEnabled.messageContent) return;
    if (!message.inGuild()) return;
    if (message.author.bot || message.webhookId || message.system) return;

    const config = await ctx.getConfig<EnforcerConfig>(message.guildId);
    if (!config.autoFlagEnabled) return;

    const memberRoleIds = message.member ? [...message.member.roles.cache.keys()] : [];
    let isStaff = false;
    if (config.exemptStaff) {
      const host = ctx.services.get('host');
      const guildConfig = host ? await host.getGuildConfig(message.guildId) : null;
      if (guildConfig) {
        const staffRoleIds = new Set([
          ...guildConfig.adminRoleIds,
          ...guildConfig.modRoleIds,
          ...guildConfig.helperRoleIds,
        ]);
        isStaff = memberRoleIds.some((id) => staffRoleIds.has(id));
      }
      if (isStaff) return;
    }

    // Dedupe by messageId (a message could theoretically be re-emitted by a reconnect/resync).
    const dedupeKey = redisKey('enforcer', 'seen', message.id);
    const firstSeen = await ctx.redis.set(dedupeKey, '1', 'EX', DEDUPE_TTL_SECONDS, 'NX');
    if (firstSeen !== 'OK') return;

    const policies = await loadEnabledPolicies(ctx.prisma, message.guildId);
    if (policies.length === 0) return;

    const normalized = normalizeMessage(message, { isStaff });
    const matches = evaluate(normalized, policies);
    if (matches.length === 0) return;

    const top = matches[0];

    // 1 flag / user / policy / 60s.
    const cooldownKey = redisKey('enforcer', 'cooldown', message.guildId, message.author.id, top.policyId);
    const acquired = await ctx.redis.set(cooldownKey, '1', 'EX', COOLDOWN_SECONDS, 'NX');
    if (acquired !== 'OK') return;

    await flagRecord(ctx, {
      guildId: message.guildId,
      userId: message.author.id,
      channelId: message.channelId,
      messageId: message.id,
      content: message.content,
      policyId: top.policyId,
      policyName: top.policyName,
      severity: top.severity,
      matcherSummary: top.matcherSummary,
      source: 'AUTO',
    });
  },
};
