import type { z } from 'zod';
import type { scamLinksConfigSchema } from '../../schemas';
import { DEFAULT_SCAM_DOMAINS, DEFAULT_SCAM_KEYWORD_PATTERNS, hostnameMatchesDomain } from '../scam-list';
import { extractLinkHostnames } from '../text-utils';
import { NO_MATCH, type MessageEvaluator } from '../types';

type Config = z.infer<typeof scamLinksConfigSchema>;

/** Flags known scam/phishing domains and common bait phrases ("free nitro", "steam gift", homoglyph discord domains). Requires the Message Content intent. */
export const evaluateScamLinks: MessageEvaluator<Config> = async ({ message }, config) => {
  const domainList = config.useBuiltInList ? [...DEFAULT_SCAM_DOMAINS, ...config.blockedDomains] : config.blockedDomains;

  if (domainList.length > 0) {
    const hostnames = extractLinkHostnames(message.content);
    for (const hostname of hostnames) {
      const hit = domainList.find((domain) => hostnameMatchesDomain(hostname, domain));
      if (hit) {
        return {
          matched: true,
          reason: `Message links to a known scam/phishing domain (${hostname}).`,
          evidence: { matchedDomain: hostname, listedAs: hit },
        };
      }
    }
  }

  if (config.useBuiltInList) {
    for (const pattern of DEFAULT_SCAM_KEYWORD_PATTERNS) {
      if (pattern.test(message.content)) {
        return {
          matched: true,
          reason: 'Message matches a known scam bait phrase (e.g. "free nitro", "steam gift").',
          evidence: { matchedKeywordPattern: pattern.source },
        };
      }
    }
  }

  return NO_MATCH;
};
