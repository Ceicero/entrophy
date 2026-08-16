import { definePlugin, registerPluginLocales } from '../sdk';
import { manifest } from './manifest';
import type { MediaConfig } from './manifest';
import { command as musicCommand } from './commands/music';
import { resolveMediaProvider } from './providers/resolve';
import en from './locales/en.json';

registerPluginLocales('media', { en });

export const plugin = definePlugin({
  manifest,
  commands: [musicCommand],
  async health(ctx) {
    const provider = resolveMediaProvider(ctx.env);
    if (!provider.isConfigured(ctx.env)) {
      return {
        status: 'unavailable',
        details:
          provider.id === 'none'
            ? 'No compliant media provider is configured (MEDIA_PROVIDER is unset or "none"). See the plugin README for how to plug in a real, licensed adapter.'
            : `Provider "${provider.id}" is selected but not fully configured (missing required credentials).`,
      };
    }
    return { status: 'ok' };
  },
});

export default plugin;
export type { MediaConfig };
