import type { PluginEventHandler } from '../../sdk';
import { handleMessage } from '../service';

/**
 * `messageUpdate` — re-checks an edited message against content-dependent rules (TASK: "messageUpdate re-check
 * when content intent"). Without the Message Content intent this event still fires (edits are not gated the
 * same way content itself is) but `newMessage.content` is empty, so content-dependent evaluators simply won't
 * match anything — the same graceful-degradation path `handleMessage` already takes for `messageCreate`.
 */
export const messageUpdateHandler: PluginEventHandler<'messageUpdate'> = {
  event: 'messageUpdate',
  guildIdOf: (_old, newMessage) => newMessage.guildId,
  async handler(ctx, _oldMessage, newMessage) {
    await handleMessage(ctx, newMessage);
  },
};
