import type { PluginEventHandler } from '../../sdk';
import { handleMessage } from '../service';

/** `messageCreate` — the primary automod evaluation point (TASK: "Events: messageCreate (+ messageUpdate re-check when content intent)"). */
export const messageCreateHandler: PluginEventHandler<'messageCreate'> = {
  event: 'messageCreate',
  guildIdOf: (message) => message.guildId,
  async handler(ctx, message) {
    await handleMessage(ctx, message);
  },
};
