// `messageCreate` handler for sticky messages. Deliberately cheap for the common case (most guilds/channels have
// no sticky): a Redis-cached "channels with a sticky" set is consulted before any database read, and message
// content is never inspected — the bot only reacts to the fact that a message was posted.
import type { Message } from 'discord.js';
import type { PluginEventHandler } from '../../sdk';
import type { CommunityConfig } from '../manifest';
import {
  getStickyChannelIds,
  repostSticky,
  scheduleStickyCatchUp,
  tryAcquireStickyCooldown,
} from '../sticky';

export const stickyMessageCreateHandler: PluginEventHandler<'messageCreate'> = {
  event: 'messageCreate',
  guildIdOf: (message) => message.guildId,
  async handler(ctx, message: Message) {
    if (!message.inGuild()) return;
    // Our own re-post (or any system message like pins/boosts) must never trigger another re-post.
    if (message.author.id === ctx.client.user.id || message.system) return;

    const channelIds = await getStickyChannelIds(ctx, message.guildId);
    if (!channelIds.includes(message.channelId)) return;

    const config = await ctx.getConfig<CommunityConfig>(message.guildId);
    if (!config.sticky.enabled) return;

    const sticky = await ctx.prisma.stickyMessage.findUnique({
      where: { guildId_channelId: { guildId: message.guildId, channelId: message.channelId } },
    });
    if (!sticky) return;

    const acquired = await tryAcquireStickyCooldown(
      ctx,
      message.guildId,
      message.channelId,
      sticky.cooldownSeconds,
    );
    if (acquired) {
      await repostSticky(ctx, message.guild, sticky);
    } else {
      await scheduleStickyCatchUp(ctx, message.guildId, message.channelId, sticky.cooldownSeconds);
    }
  },
};
