// Sets `Ticket.firstResponseAt` on the first message from a support-role member in an open ticket's
// channel/thread — needs no message content, just author/channel identity, so it works without the Message
// Content privileged intent.
import { fetchMemberSafe, type PluginEventHandler } from '../../sdk';
import type { TicketsConfig } from '../manifest';

export const messageCreateHandler: PluginEventHandler<'messageCreate'> = {
  event: 'messageCreate',
  guildIdOf: (message) => message.guildId,
  async handler(ctx, message) {
    if (!message.guildId || message.author.bot) return;

    const ticket = await ctx.prisma.ticket.findFirst({
      where: {
        guildId: message.guildId,
        status: 'OPEN',
        firstResponseAt: null,
        OR: [{ channelId: message.channelId }, { threadId: message.channelId }],
      },
    });
    if (!ticket || ticket.openerId === message.author.id) return;

    const config = await ctx.getConfig<TicketsConfig>(message.guildId);
    if (config.supportRoleIds.length === 0) return;

    let member = message.member;
    if (!member && message.guild) {
      member = await fetchMemberSafe(message.guild, message.author.id);
    }
    const isSupport = member
      ? member.roles.cache.some((role) => config.supportRoleIds.includes(role.id))
      : false;
    if (!isSupport) return;

    await ctx.prisma.ticket.update({ where: { id: ticket.id }, data: { firstResponseAt: new Date() } });
  },
};
