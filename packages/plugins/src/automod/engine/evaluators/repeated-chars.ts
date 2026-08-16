import type { z } from 'zod';
import type { repeatedCharsConfigSchema } from '../../schemas';
import { NO_MATCH, type MessageEvaluator } from '../types';

type Config = z.infer<typeof repeatedCharsConfigSchema>;

/** Flags messages containing a character repeated `maxRepeats+` times in a row (e.g. "AAAAAAAAAA"). Requires the Message Content intent. */
export const evaluateRepeatedChars: MessageEvaluator<Config> = async ({ message }, config) => {
  // Built from a numeric config value (never user-supplied pattern text), so no `validateUserRegex` call is
  // needed here — the shape is fixed (`(.)\1{n,}`) and `n` is bounded by the config schema (2..50).
  const regex = new RegExp(`(.)\\1{${config.maxRepeats - 1},}`, 'u');
  const match = regex.exec(message.content);
  if (!match) return NO_MATCH;

  return {
    matched: true,
    reason: `Message contains "${match[1]}" repeated ${match[0].length} times (limit ${config.maxRepeats}).`,
    evidence: { character: match[1], repeatCount: match[0].length, maxRepeats: config.maxRepeats },
  };
};
