import type { PluginJob } from '../../sdk';
import { runStickyCatchUp, type StickyRepostJobData } from '../sticky';

/**
 * Debounced catch-up re-post for a channel whose cooldown blocked an immediate one (`jobId
 * sticky:<guildId>:<channelId>`, delayed by the sticky's cooldown; enqueuing while one is pending is a no-op).
 * Guarantees the sticky ends up at the bottom after a burst of member messages without one re-post per message.
 */
export const stickyRepostJob: PluginJob<StickyRepostJobData> = {
  name: 'sticky-repost',
  async processor(ctx, job) {
    await runStickyCatchUp(ctx, job.data.guildId, job.data.channelId);
  },
};
