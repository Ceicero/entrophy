import type { z } from 'zod';
import type { duplicateMessagesConfigSchema } from '../../schemas';
import { hashNormalizedText } from '../text-utils';
import { NO_MATCH, type MessageEvaluator } from '../types';

type Config = z.infer<typeof duplicateMessagesConfigSchema>;

/** Flags a user repeating the same message content `maxDuplicates+` times within `windowSeconds`. Requires the Message Content intent. */
export const evaluateDuplicateMessages: MessageEvaluator<Config> = async ({ message, windowStore }, config) => {
  const normalized = message.content.trim();
  if (normalized.length === 0) return NO_MATCH;

  const windowMs = config.windowSeconds * 1000;
  const key = `dup:${message.authorId}:${hashNormalizedText(normalized)}`;
  const count = await windowStore.pushAndCount(key, message.messageId, message.createdAt.getTime(), windowMs);

  if (count < config.maxDuplicates) return NO_MATCH;

  return {
    matched: true,
    reason: `Repeated the same message ${count} times in ${config.windowSeconds}s (limit ${config.maxDuplicates}).`,
    evidence: { count, maxDuplicates: config.maxDuplicates, windowSeconds: config.windowSeconds },
  };
};
