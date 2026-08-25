import { definePlugin, registerPluginLocales } from '../sdk';
import { manifest } from './manifest';
import en from './locales/en.json';
import { command as dbdCommand, dbdComponents } from './commands/dbd';
import { gamestatsRefreshJob } from './jobs/refresh';

// Registers the `gamestats` locale bundle (see admin/index.ts for the same pattern).
registerPluginLocales('gamestats', { en });

export const plugin = definePlugin({
  manifest,
  commands: [dbdCommand],
  components: dbdComponents,
  jobs: [gamestatsRefreshJob],
});

export default plugin;
