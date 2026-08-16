import type { z } from 'zod';
import type { wordFilterConfigSchema } from '../../schemas';
import { escapeRegExp } from '../text-utils';
import { NO_MATCH, type MessageEvaluator } from '../types';

type Config = z.infer<typeof wordFilterConfigSchema>;

/** Flags messages containing any of a configured word/phrase list. Requires the Message Content intent. */
export const evaluateWordFilter: MessageEvaluator<Config> = async ({ message }, config) => {
  const content = config.caseSensitive ? message.content : message.content.toLowerCase();

  for (const word of config.words) {
    const needle = config.caseSensitive ? word : word.toLowerCase();
    const found = config.wholeWord ? new RegExp(`\\b${escapeRegExp(needle)}\\b`, config.caseSensitive ? '' : 'i').test(content) : content.includes(needle);

    if (found) {
      return {
        matched: true,
        reason: `Message contains a filtered word/phrase.`,
        evidence: { matchedWord: word },
      };
    }
  }

  return NO_MATCH;
};
