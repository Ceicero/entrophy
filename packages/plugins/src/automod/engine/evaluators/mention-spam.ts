import type { z } from 'zod';
import type { mentionSpamConfigSchema } from '../../schemas';
import { NO_MATCH, type MessageEvaluator } from '../types';

type Config = z.infer<typeof mentionSpamConfigSchema>;

/** Flags a single message with an excessive number of mentions. No content intent required (uses the message's resolved mention counts). */
export const evaluateMentionSpam: MessageEvaluator<Config> = async ({ message }, config) => {
  const total = message.userMentionCount + (config.includeRoleMentions ? message.roleMentionCount : 0) + (message.everyoneMentioned ? 1 : 0);

  if (total < config.maxMentions) return NO_MATCH;

  return {
    matched: true,
    reason: `Message mentions ${total} users/roles (limit ${config.maxMentions}).`,
    evidence: {
      total,
      userMentionCount: message.userMentionCount,
      roleMentionCount: message.roleMentionCount,
      everyoneMentioned: message.everyoneMentioned,
      maxMentions: config.maxMentions,
    },
  };
};
