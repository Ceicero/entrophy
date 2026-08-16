import type { PluginJob } from '../../sdk';
import { deliverReminder } from '../actions';

/**
 * Catch-up sweep for one-off reminders whose delayed job may have been lost (process restart mid-delay, Redis
 * data loss, etc). Recurring reminders are excluded — their own job scheduler re-fires them independently, so
 * sweeping them here would double-deliver. Runs every 5 minutes (ARCHITECTURE.md community spec).
 */
export const reminderSweepJob: PluginJob<Record<string, never>> = {
  name: 'reminder-sweep',
  repeat: { pattern: '*/5 * * * *' },
  async processor(ctx) {
    const overdue = await ctx.prisma.reminder.findMany({
      where: { delivered: false, recurring: null, remindAt: { lte: new Date() } },
      take: 200,
    });
    for (const reminder of overdue) {
      await deliverReminder(ctx, reminder.id).catch((err) => {
        ctx.logger.error(
          { err, reminderId: reminder.id },
          'community: reminder-sweep failed to deliver a reminder',
        );
      });
    }
  },
};
