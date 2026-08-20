import type { z } from 'zod';
import type { messageFrequencyConfigSchema } from '../../schemas';
import { NO_MATCH, type MessageEvaluator } from '../types';

type Config = z.infer<typeof messageFrequencyConfigSchema>;

/** Flags a user sending more than `maxMessages` messages within `windowSeconds`. No content intent required. */
export const evaluateMessageFrequency: MessageEvaluator<Config> = async (
  { message, windowStore },
  config,
) => {
  const windowMs = config.windowSeconds * 1000;
  const count = await windowStore.pushAndCount(
    `freq:${message.authorId}`,
    message.messageId,
    message.createdAt.getTime(),
    windowMs,
  );

  // Exclusive: maxMessages is an allowance a member may use in full (see "Threshold semantics" in ../types).
  if (count <= config.maxMessages) return NO_MATCH;

  return {
    matched: true,
    reason: `Sent ${count} messages in ${config.windowSeconds}s (flags above ${config.maxMessages}).`,
    evidence: { count, maxMessages: config.maxMessages, windowSeconds: config.windowSeconds },
  };
};
