// `messageCreate` handler for sticky messages. Deliberately cheap for the common case (most guilds/channels have
// no sticky): a Redis-cached "channels with a sticky" set is consulted before any database read, and message
// content is never inspected — the bot only reacts to the fact that a message was posted.
import type { Message } from 'discord.js';
import type { PluginEventHandler } from '../../sdk';
import type { CommunityConfig } from '../manifest';
import {
  getStickyChannelIds,
  pruneStickyForChannel,
  repostSticky,
  scheduleStickyCatchUp,
  tryAcquireStickyCooldown,
} from '../sticky';

export const stickyMessageCreateHandler: PluginEventHandler<'messageCreate'> = {
  event: 'messageCreate',
  guildIdOf: (message) => message.guildId,
  async handler(ctx, message: Message) {
    if (!message.inGuild()) return;
    // Our own re-post, any other bot's message, a webhook post, or a system message (pins/boosts) must never
    // trigger another re-post — otherwise two bots posting in the same sticky channel can ping-pong forever
    // (matches every other messageCreate listener in the repo, e.g. tag-triggers.ts / enforcer/message-create.ts).
    if (message.author.bot || message.webhookId || message.system) return;

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

/**
 * When a channel is deleted, Discord took the sticky's message with it — clean up the now-dangling
 * `StickyMessage` row (and the cached sticky-channel set) so it doesn't linger against `sticky.maxPerGuild` or
 * leak in `/sticky list`. Mirrors `logging/events/channel.ts`'s `channelDelete` handler's `'guild' in channel`
 * narrowing (this event also fires for DM channels, which never have a `guild`).
 */
export const stickyChannelDeleteHandler: PluginEventHandler<'channelDelete'> = {
  event: 'channelDelete',
  guildIdOf: (channel) => ('guild' in channel ? channel.guild.id : null),
  async handler(ctx, channel) {
    if (!('guild' in channel)) return;
    await pruneStickyForChannel(ctx, channel.guild.id, channel.id);
  },
};
