import type { z } from 'zod';
import type { nsfwEnforcementConfigSchema } from '../../schemas';
import { NO_MATCH, type MessageEvaluator } from '../types';

type Config = z.infer<typeof nsfwEnforcementConfigSchema>;

/**
 * Flags a message that mentions configured NSFW-adjacent keywords in a channel not marked NSFW.
 * Does not require the Message Content intent: `message.channelNsfw` is always available, so this rule stays
 * "active" without it — but the keyword check itself is a no-op when content is unavailable (`content` is `''`),
 * since Discord only delivers message text to a bot with the Message Content intent enabled. Enable that intent
 * for this rule's keyword matching to actually do anything; without it, only `channelNsfw` context is visible.
 */
export const evaluateNsfwEnforcement: MessageEvaluator<Config> = async ({ message }, config) => {
  if (message.channelNsfw) return NO_MATCH;
  if (config.requireNsfwChannelForKeywords.length === 0) return NO_MATCH;
  if (message.content.length === 0) return NO_MATCH;

  const lower = message.content.toLowerCase();
  const hit = config.requireNsfwChannelForKeywords.find((keyword) => lower.includes(keyword.toLowerCase()));
  if (!hit) return NO_MATCH;

  return {
    matched: true,
    reason: `Message mentions "${hit}" outside an NSFW-marked channel.`,
    evidence: { matchedKeyword: hit },
  };
};
