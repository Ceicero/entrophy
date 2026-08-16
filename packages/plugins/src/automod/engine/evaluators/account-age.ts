import type { z } from 'zod';
import type { accountAgeConfigSchema } from '../../schemas';
import { NO_MATCH, type JoinEvaluator } from '../types';

type Config = z.infer<typeof accountAgeConfigSchema>;

/** Flags a joining member whose Discord account is younger than `minAccountAgeHours`. Requires the Guild Members intent. */
export const evaluateAccountAge: JoinEvaluator<Config> = async ({ join }, config) => {
  if (config.minAccountAgeHours <= 0) return NO_MATCH;

  const ageMs = join.joinedAt.getTime() - join.accountCreatedAt.getTime();
  const ageHours = ageMs / (60 * 60 * 1000);
  if (ageHours >= config.minAccountAgeHours) return NO_MATCH;

  return {
    matched: true,
    reason: `Account is ${Math.max(0, Math.round(ageHours * 10) / 10)}h old (minimum ${config.minAccountAgeHours}h).`,
    evidence: { accountAgeHours: Math.round(ageHours * 100) / 100, minAccountAgeHours: config.minAccountAgeHours },
  };
};
