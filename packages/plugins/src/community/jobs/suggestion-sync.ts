import type { PluginJob } from '../../sdk';
import { syncSuggestionMessage } from '../actions';

const LOOKBACK_MS = 90_000; // slightly over the 1-minute repeat interval so no update window is missed

/**
 * Reflects dashboard status/note changes (which only touch the database, not Discord) into each suggestion's
 * posted embed. Runs every minute (ARCHITECTURE.md community spec: "a bot job 'community:suggestion-sync' every
 * minute reflects dashboard status changes into Discord embeds").
 */
export const suggestionSyncJob: PluginJob<Record<string, never>> = {
  name: 'suggestion-sync',
  repeat: { pattern: '* * * * *' },
  async processor(ctx) {
    const recentlyUpdated = await ctx.prisma.suggestion.findMany({
      where: { messageId: { not: null }, updatedAt: { gte: new Date(Date.now() - LOOKBACK_MS) } },
      take: 200,
    });
    for (const suggestion of recentlyUpdated) {
      await syncSuggestionMessage(ctx, suggestion).catch((err) => {
        ctx.logger.error(
          { err, suggestionId: suggestion.id },
          'community: suggestion-sync failed to update a message',
        );
      });
    }
  },
};
