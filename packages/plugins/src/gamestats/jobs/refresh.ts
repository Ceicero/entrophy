import type { PluginJob } from '../../sdk';
import { allGames } from '../games';
import { refreshMemberStats } from '../service';

/** Pacing between individual Steam Web API calls — polite to Steam's rate limits, mirrors the "~200ms spacing"
 *  called out in the plugin's build spec. Plain awaited `setTimeout`; nothing fancier is needed for a job that
 *  already runs at `concurrency: 1`. */
const STEAM_CALL_SPACING_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Every 30 minutes: refreshes every linked member's stats for every supported game, one guild-enabled link at a
 * time. Cleanly no-ops without `STEAM_API_KEY` (the plugin is `unavailable` in that state — see manifest.ts —
 * so there is nothing useful to fetch). One row's failure never stops the rest (per-row try/catch, same
 * isolation pattern as `integrations/jobs/poll.ts`'s `makePollJob`); `refreshMemberStats` itself is what
 * records the per-row failure (`GameStatSnapshot.lastError`), so a caught error here is only ever something
 * refreshMemberStats couldn't itself account for (e.g. a Prisma error).
 */
export const gamestatsRefreshJob: PluginJob = {
  name: 'gamestats-refresh',
  repeat: { pattern: '*/30 * * * *' },
  concurrency: 1,
  async processor(ctx) {
    if (!ctx.env.STEAM_API_KEY) return;

    const links = await ctx.prisma.gameAccountLink.findMany({ where: { provider: 'STEAM' } });
    if (links.length === 0) return;

    const games = allGames();

    for (const link of links) {
      // `ctx.isEnabled` with no explicit plugin id checks THIS plugin (gamestats) for the link's guild — same
      // convention as `community/jobs/birthday-announce.ts`'s per-guild gate.
      const enabled = await ctx.isEnabled(link.guildId).catch(() => false);
      if (!enabled) continue;

      for (const game of games) {
        try {
          await refreshMemberStats(ctx, link, game);
        } catch (err) {
          ctx.logger.warn(
            { err, guildId: link.guildId, userId: link.userId, game: game.key },
            'gamestats: refresh failed for one member/game; continuing with the rest',
          );
        }
        await sleep(STEAM_CALL_SPACING_MS);
      }
    }
  },
};
