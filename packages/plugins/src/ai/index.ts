import { definePlugin, registerPluginLocales } from '../sdk';
import { manifest } from './manifest';
import type { AiConfig } from './manifest';
import { command as askCommand } from './commands/ask';
import { command as summarizeCommand } from './commands/summarize';
import { command as draftCommand } from './commands/draft';
import { command as modAssistCommand } from './commands/mod-assist';
import { command as configCommand } from './commands/config';
import { setKeyModalHandler } from './components/set-key-modal';
import { createAiService, describeAvailability } from './service';
import en from './locales/en.json';

registerPluginLocales('ai', { en });

export const plugin = definePlugin({
  manifest,
  commands: [askCommand, summarizeCommand, draftCommand, modAssistCommand, configCommand],
  components: [setKeyModalHandler],
  async onLoad(ctx) {
    ctx.services.register('ai', createAiService(ctx));
  },
  async health() {
    // Readiness is inherently per-guild (each guild brings its own key/provider) — see `describeAvailability` and
    // `/ai config view` for that. The plugin itself has no platform-wide external dependency of its own, so this
    // only reports "loaded fine", same as `admin`'s health hook.
    return { status: 'ok' };
  },
});

export default plugin;
export { describeAvailability };
export type { AiConfig };
