import type { PluginJob } from '../../sdk';
import { ModerationServiceImpl } from '../service';

/**
 * Runs every minute: applies Discord-side effects (DM, auto-remove timeout, offer an unban button) for appeals
 * decided from the dashboard, which only writes the database row directly (ARCHITECTURE.md §10 — the API has no
 * Discord client). Idempotency is tracked with a Redis key (`entrophy:moderation:appeal-applied:<id>`, 30-day
 * TTL) rather than a DB column, since `ModerationAppeal` has no spare Json field to encode it in and the
 * decision-note text is human-facing — see `ModerationServiceImpl.syncDashboardDecidedAppeals`.
 */
export const appealSyncJob: PluginJob<Record<string, never>> = {
  name: 'appeal-sync',
  repeat: { pattern: '* * * * *' },
  async processor(ctx) {
    const service = new ModerationServiceImpl(ctx);
    const applied = await service.syncDashboardDecidedAppeals();
    if (applied > 0) {
      ctx.logger.info({ applied }, 'moderation: appeal-sync applied dashboard-decided appeals');
    }
  },
};
