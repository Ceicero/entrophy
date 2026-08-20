import type { z } from 'zod';
import type { capsConfigSchema } from '../../schemas';
import { NO_MATCH, type MessageEvaluator } from '../types';

type Config = z.infer<typeof capsConfigSchema>;

const LETTER_PATTERN = /\p{L}/gu;
const UPPER_PATTERN = /\p{Lu}/u;

/** Flags messages that are mostly uppercase letters ("shouting"). Requires the Message Content intent. */
export const evaluateCaps: MessageEvaluator<Config> = async ({ message }, config) => {
  if (message.content.length < config.minLength) return NO_MATCH;

  const letters = message.content.match(LETTER_PATTERN) ?? [];
  if (letters.length === 0) return NO_MATCH;

  const upperCount = letters.filter((ch) => UPPER_PATTERN.test(ch)).length;
  const percent = (upperCount / letters.length) * 100;

  // Inclusive threshold (see "Threshold semantics" in ../types).
  if (percent < config.maxCapsPercent) return NO_MATCH;

  return {
    matched: true,
    reason: `Message is ${Math.round(percent)}% uppercase (flags at ${config.maxCapsPercent}% or more).`,
    evidence: { capsPercent: Math.round(percent * 100) / 100, letterCount: letters.length },
  };
};
