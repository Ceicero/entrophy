// Delayed (non-repeating) job scheduled by `closeTicketCore` for CHANNEL-mode tickets: deletes the channel
// `config.deleteAfterCloseSeconds` after close, unless `keepClosedChannels` is on or the ticket was reopened
// (in which case `reopenTicketCore` removes this job by its deterministic jobId `delete-<ticketId>`).
import { ChannelType } from 'discord.js';
import type { PluginJob } from '../../sdk';
import type { TicketsConfig } from '../manifest';

export interface DeleteChannelJobData {
  guildId: string;
  ticketId: string;
  channelId: string;
}

export const deleteChannelJob: PluginJob<DeleteChannelJobData> = {
  name: 'delete-channel',
  async processor(ctx, job) {
    const { guildId, ticketId, channelId } = job.data;

    // Re-check current state: the ticket may have been reopened, kept, or already deleted since this job was
    // scheduled (best-effort `job.remove()` on reopen can race with a job already picked up by a worker).
    const ticket = await ctx.prisma.ticket.findFirst({ where: { id: ticketId, guildId } });
    if (!ticket || ticket.status !== 'CLOSED' || ticket.channelId !== channelId) return;

    const config = await ctx.getConfig<TicketsConfig>(guildId);
    if (config.keepClosedChannels) return;

    const guild = await ctx.client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;

    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) return;

    await channel.delete(`Ticket #${ticket.number} closed`).catch((err) => ctx.logger.warn({ err, ticketId }, 'tickets: failed to delete closed ticket channel'));
  },
};
