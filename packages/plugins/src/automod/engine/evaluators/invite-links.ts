import type { z } from 'zod';
import type { inviteLinksConfigSchema } from '../../schemas';
import { extractInviteCodes } from '../text-utils';
import { NO_MATCH, type MessageEvaluator } from '../types';

type Config = z.infer<typeof inviteLinksConfigSchema>;

/**
 * Flags Discord invite links not in `allowedInviteCodes`. Requires the Message Content intent.
 *
 * `allowOwnServerInvites` needs to know the guild's own active invite codes, which isn't something a pure,
 * discord.js-free evaluator can fetch — the caller (`events/message-create.ts`) is responsible for merging the
 * guild's current invite codes into `allowedInviteCodes` before invoking this evaluator when that option is on
 * (best-effort; if the fetch fails or the bot lacks Manage Server, invites simply aren't auto-allowed that pass).
 */
export const evaluateInviteLinks: MessageEvaluator<Config> = async ({ message }, config) => {
  const codes = extractInviteCodes(message.content);
  if (codes.length === 0) return NO_MATCH;

  const allowed = new Set(config.allowedInviteCodes);
  const blocked = codes.filter((code) => !allowed.has(code));
  if (blocked.length === 0) return NO_MATCH;

  return {
    matched: true,
    reason: `Message contains ${blocked.length} invite link(s) not on the allow list.`,
    evidence: { blockedCodes: blocked.join(','), totalInvitesFound: codes.length },
  };
};
