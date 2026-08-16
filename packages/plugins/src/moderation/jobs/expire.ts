import type { PluginJob } from '../../sdk';
import { ModerationServiceImpl } from '../service';

export interface ExpireJobData {
  caseId: string;
}

/** Fires once when a specific TIMEOUT or (temp) BAN case's duration elapses (scheduled with `jobId: case:<id>`). */
export const expireJob: PluginJob<ExpireJobData> = {
  name: 'expire',
  async processor(ctx, job) {
    const row = await ctx.prisma.moderationCase.findUnique({ where: { id: job.data.caseId } });
    if (!row || row.expiredAt || row.deletedAt) return;

    const service = new ModerationServiceImpl(ctx);
    try {
      if (row.type === 'TIMEOUT') {
        const guild = await ctx.client.guilds.fetch(row.guildId).catch(() => null);
        const member = guild ? await guild.members.fetch(row.targetId).catch(() => null) : null;
        // Member may already be gone (left the server) or the timeout may have already lapsed naturally on
        // Discord's side — either way, the case's expiredAt still needs to be marked below.
        if (member?.communicationDisabledUntilTimestamp) {
          await member.timeout(null, `Timeout expired (case #${row.caseNumber})`).catch(() => undefined);
        }
      } else if (row.type === 'BAN') {
        await service.unban({ guildId: row.guildId, targetId: row.targetId, moderatorId: ctx.client.user.id, reason: `Temporary ban expired (case #${row.caseNumber})`, source: 'SYSTEM' });
        return; // unban() already marks BAN cases expired via markExpiredForActiveBan
      }
    } finally {
      await ctx.prisma.moderationCase.update({ where: { id: row.id }, data: { expiredAt: new Date() } }).catch(() => undefined);
    }
  },
};
