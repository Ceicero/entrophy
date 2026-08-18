import { ChannelType, MessageFlags, type Message } from 'discord.js';
import type { PluginContext, PluginEventHandler } from '../../sdk';
import type { AutoThreadRule, CommunityConfig } from '../manifest';
import {
  COUNTER_TTL_SECONDS,
  WARN_TTL_SECONDS,
  autoPublishCountKey,
  autoPublishWarnedKey,
  autoThreadWarnedKey,
  findAutoThreadRule,
  isCrosspostLimitError,
  isMissingPermissionsError,
  renderTemplate,
  renderThreadName,
  shouldAutoPublish,
  shouldAutoThread,
  utcDayKey,
  type ThreadTemplateVars,
} from '../channel-automations';

const THREADABLE_CHANNEL_TYPES = new Set<number>([ChannelType.GuildText, ChannelType.GuildAnnouncement]);

/**
 * `SET NX EX` guard so a persistent failure (missing permission, crosspost limit) produces one warning per hour
 * per channel instead of one per message. Returns true the first time within the window.
 */
async function warnOnce(ctx: PluginContext, key: string): Promise<boolean> {
  const res = await ctx.redis.set(key, '1', 'EX', WARN_TTL_SECONDS, 'NX');
  return res === 'OK';
}

async function reportOnce(
  ctx: PluginContext,
  key: string,
  guildId: string,
  channelId: string,
  title: string,
  description: string,
): Promise<void> {
  if (!(await warnOnce(ctx, key))) return;
  ctx.logger.warn({ guildId, channelId, title }, description);
  const logging = ctx.services.get('logging');
  if (logging) {
    try {
      await logging.log(guildId, 'bot.error', { channelId, title, description });
    } catch {
      // Logging is best-effort; never let it break message handling.
    }
  }
}

async function bumpPublishCounter(ctx: PluginContext, guildId: string): Promise<void> {
  const key = autoPublishCountKey(guildId, utcDayKey());
  const count = await ctx.redis.incr(key);
  if (count === 1) await ctx.redis.expire(key, COUNTER_TTL_SECONDS);
}

async function handleAutoPublish(ctx: PluginContext, message: Message<true>): Promise<void> {
  try {
    await message.crosspost();
    await bumpPublishCounter(ctx, message.guildId);
  } catch (err) {
    const channelId = message.channelId;
    if (isMissingPermissionsError(err)) {
      await reportOnce(
        ctx,
        autoPublishWarnedKey(channelId),
        message.guildId,
        channelId,
        'Auto-publish skipped',
        `I can't publish other members' messages in <#${channelId}> — I need the Manage Messages permission there. Only my own announcements are published until then.`,
      );
      return;
    }
    if (isCrosspostLimitError(err)) {
      await reportOnce(
        ctx,
        autoPublishWarnedKey(channelId),
        message.guildId,
        channelId,
        'Auto-publish paused',
        `Discord limits publishing to 10 messages per hour per announcement channel; <#${channelId}> hit that limit, so some messages were not published. They can still be published manually.`,
      );
      return;
    }
    await reportOnce(
      ctx,
      autoPublishWarnedKey(channelId),
      message.guildId,
      channelId,
      'Auto-publish failed',
      `Publishing a message in <#${channelId}> failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function handleAutoThread(
  ctx: PluginContext,
  message: Message<true>,
  rule: AutoThreadRule,
): Promise<void> {
  const vars: ThreadTemplateVars = {
    user: message.member?.displayName ?? message.author.displayName ?? message.author.username,
    'user.tag': message.author.tag,
    server: message.guild.name,
    date: utcDayKey(message.createdAt),
  };
  try {
    const thread = await message.startThread({
      name: renderThreadName(rule.nameTemplate, vars),
      autoArchiveDuration: rule.archiveMinutes,
      reason: 'Auto-thread',
    });
    if (rule.starterMessage) {
      await thread.send({
        content: renderTemplate(rule.starterMessage, vars),
        allowedMentions: { parse: [] },
      });
    }
  } catch (err) {
    const channelId = message.channelId;
    await reportOnce(
      ctx,
      autoThreadWarnedKey(channelId),
      message.guildId,
      channelId,
      'Auto-thread failed',
      isMissingPermissionsError(err)
        ? `I couldn't create a thread in <#${channelId}> — I need Create Public Threads (and Send Messages in Threads) there.`
        : `Creating a thread in <#${channelId}> failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Auto-publish (crosspost every new message in listed announcement channels) and auto-threads (one thread per
 * post in listed text/announcement channels). Neither reads message content — only channel/author/flags/
 * attachment presence — and both act only in channels an admin explicitly listed in the plugin config.
 */
export const channelAutomationsHandler: PluginEventHandler<'messageCreate'> = {
  event: 'messageCreate',
  guildIdOf: (message) => message.guildId,
  async handler(ctx, message: Message) {
    if (!message.inGuild() || message.system) return;

    const cfg = await ctx.getConfig<CommunityConfig>(message.guildId);
    const autoPublish = cfg.autoPublish ?? { channelIds: [], includeBots: false };
    const autoThreads = cfg.autoThreads ?? [];
    if (autoPublish.channelIds.length === 0 && autoThreads.length === 0) return;

    const channelType = message.channel.type;

    if (
      shouldAutoPublish(
        {
          channelId: message.channelId,
          channelType,
          authorIsBot: message.author.bot,
          authorId: message.author.id,
          botUserId: message.client.user.id,
          flagsCrossposted:
            message.flags.has(MessageFlags.Crossposted) || message.flags.has(MessageFlags.IsCrosspost),
        },
        autoPublish,
      )
    ) {
      await handleAutoPublish(ctx, message);
    }

    if (!THREADABLE_CHANNEL_TYPES.has(channelType)) return;
    const rule = findAutoThreadRule(message.channelId, autoThreads);
    if (
      rule &&
      shouldAutoThread(
        {
          hasAttachmentOrEmbed: message.attachments.size > 0 || message.embeds.length > 0,
          authorIsBot: message.author.bot,
          isThreadStarterAlready: message.hasThread,
        },
        rule,
      )
    ) {
      await handleAutoThread(ctx, message, rule);
    }
  },
};
