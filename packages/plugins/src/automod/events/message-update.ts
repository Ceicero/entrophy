import type { PluginContext, PluginEventHandler } from '../../sdk';
import { handleMessage } from '../service';

/** The slice of a discord.js message this guard reads; both `Message` and `PartialMessage` satisfy it. */
interface MessageContentLike {
  partial: boolean;
  content: string | null;
}

/**
 * True when the message's *text* may have changed. Discord emits `messageUpdate` for far more than a user
 * edit — a link finishing its embed unfurl, a pin, a flag change — and each of those used to trigger a second
 * full evaluation of the same message: a duplicate staff alert, a duplicate row in `/automod review`, and an
 * extra entry in the frequency/duplicate windows.
 *
 * Without the Message Content intent every message looks empty, so there is nothing to compare and no
 * content-dependent rule could match anyway.
 */
export function isContentEdit(
  intentsEnabled: PluginContext['intentsEnabled'],
  oldMessage: MessageContentLike,
  newMessage: MessageContentLike,
): boolean {
  if (!intentsEnabled.messageContent) return false;
  // A partial *new* message is Discord reporting something other than the text — an embed unfurl, a pin, a flag
  // change all arrive as payloads with no `content` at all, which discord.js leaves partial. Nothing to re-check.
  if (newMessage.partial) return false;
  // A partial *old* message just means discord.js had not cached it: everything posted before the last restart,
  // and anything evicted from the per-channel message cache. The text cannot be compared, but a second pass is
  // already idempotent — `handleMessage` claims each (rule, message) pair once and `reevaluation` keeps the edit
  // out of the frequency/duplicate windows — so re-check it. Skipping here would leave "post something benign,
  // wait for the cache to drop it, edit in a scam link" as a path automod never looks at.
  if (oldMessage.partial) return true;
  return (oldMessage.content ?? '') !== (newMessage.content ?? '');
}

/**
 * `messageUpdate` — re-checks an edited message against content-dependent rules (TASK: "messageUpdate re-check
 * when content intent"). Passes `reevaluation` so `handleMessage` skips the window-backed rule types: an edit is
 * not a new message, and counting it as one is what inflated the spam counters.
 */
export const messageUpdateHandler: PluginEventHandler<'messageUpdate'> = {
  event: 'messageUpdate',
  guildIdOf: (_old, newMessage) => newMessage.guildId,
  async handler(ctx, oldMessage, newMessage) {
    if (!isContentEdit(ctx.intentsEnabled, oldMessage, newMessage)) return;
    await handleMessage(ctx, newMessage, { reevaluation: true });
  },
};
