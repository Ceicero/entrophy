import { definePlugin, registerPluginLocales } from '../sdk';
import { manifest } from './manifest';
import type { AiConfig } from './manifest';
import { command as askCommand } from './commands/ask';
import { command as summarizeCommand } from './commands/summarize';
import { command as draftCommand } from './commands/draft';
import { command as modAssistCommand } from './commands/mod-assist';
import { command as configCommand } from './commands/config';
import { setKeyModalHandler } from './components/set-key-modal';
import { personaModalHandler } from './components/persona-modal';
import { mentionChatHandler } from './events/mention-chat';
import { createAiService, describeAvailability } from './service';
import en from './locales/en.json';

registerPluginLocales('ai', { en });

export const plugin = definePlugin({
  manifest,
  commands: [askCommand, summarizeCommand, draftCommand, modAssistCommand, configCommand],
  components: [setKeyModalHandler, personaModalHandler],
  events: [mentionChatHandler],
  async onLoad(ctx) {
    ctx.services.register('ai', createAiService(ctx));
  },
  async health(ctx) {
    // Readiness is otherwise per-guild (each guild brings its own key/provider) — see `describeAvailability` and
    // `/ai config view` for that. The one platform-wide dependency is the Message Content privileged intent:
    // `/summarize` needs it to read channel history, and mention chat's handler no-ops entirely without it (see
    // `events/mention-chat.ts`). `/ask`, `/draft`, and `/mod-assist` are unaffected either way.
    if (!ctx.intentsEnabled.messageContent) {
      return {
        status: 'degraded',
        details:
          'The Message Content privileged intent is off: /summarize cannot read channel history, and mention chat will not respond even where configured. /ask, /draft, and /mod-assist still work.',
      };
    }
    return { status: 'ok' };
  },
});

export default plugin;
export { describeAvailability };
export type { AiConfig };
