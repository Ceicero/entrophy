import { definePlugin, registerPluginLocales } from '../sdk';
import { manifest } from './manifest';
import { command as helpCommand } from './commands/help';
import { command as utilityCommand } from './commands/utility';
import { command as embedCommand } from './commands/embed';
import { command as userInfoContextCommand } from './commands/user-info-context';
import { helpComponents } from './components/help';
import { embedBuilderComponents } from './components/embed-builder';
import { afkMessageHandler } from './events/afk';
import en from './locales/en.json';

// Registers the `utility` locale bundle into the shared i18n table (core `t('utility.<key>', ...)`); the SDK's
// per-command `CommandContext.t` falls back to core keys when a `utility.<key>` isn't found (see
// `packages/plugins/src/sdk/locales.ts`).
registerPluginLocales('utility', { en });

export const plugin = definePlugin({
  manifest,
  commands: [helpCommand, utilityCommand, embedCommand, userInfoContextCommand],
  components: [...helpComponents, ...embedBuilderComponents],
  events: [afkMessageHandler],
  async health() {
    // Utility has no required external dependency of its own — the optional translate/weather adapters
    // degrade individually (each returns a clear "not configured" message rather than failing the plugin),
    // and `/utility status` surfaces every *other* plugin's health via the `host` service. There is nothing
    // meaningful to report as "degraded" here at the plugin level.
    return { status: 'ok' };
  },
});

export default plugin;
