import type { PluginJob } from '../../sdk';
import { ModerationServiceImpl } from '../service';

/**
 * Runs every minute: applies Discord-side effects (DM, auto-remove timeout, offer an unban button) for appeals
 * decided from the dashboard, which only writes the database row directly (ARCHITECTURE.md §10 — the API has no
 * Discord client). Idempotency is tracked with the durable `ModerationAppeal.effectsAppliedAt` column (set once
 * and never expires), not a TTL cache — a short-lived Redis key is used only to stop two overlapping ticks from
 * racing on the same appeal. See `ModerationServiceImpl.syncDashboardDecidedAppeals`.
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
