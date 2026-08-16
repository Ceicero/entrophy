import type { z } from 'zod';
import type { raidDetectionConfigSchema } from '../../schemas';
import { NO_MATCH, type JoinEvaluator } from '../types';

type Config = z.infer<typeof raidDetectionConfigSchema>;

/** Flags a burst of `joinBurstCount+` joins within `joinBurstWindowSeconds`, guild-wide (not per-user). Requires the Guild Members intent. */
export const evaluateRaidDetection: JoinEvaluator<Config> = async ({ join, windowStore }, config) => {
  const windowMs = config.joinBurstWindowSeconds * 1000;
  // Deliberately guild-wide, not per-user: a raid is many *different* accounts joining in a burst.
  const count = await windowStore.pushAndCount('raid', join.userId, join.joinedAt.getTime(), windowMs);

  if (count < config.joinBurstCount) return NO_MATCH;

  return {
    matched: true,
    reason: `${count} members joined within ${config.joinBurstWindowSeconds}s (threshold ${config.joinBurstCount}).`,
    evidence: { joinCount: count, joinBurstCount: config.joinBurstCount, windowSeconds: config.joinBurstWindowSeconds },
  };
};
