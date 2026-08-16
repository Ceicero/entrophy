import { definePlugin, registerPluginLocales } from '../sdk';
import { manifest } from './manifest';
import { command as integrationCommand, integrationConfirmComponents } from './commands/integration';
import { inboundJob } from './jobs/inbound';
import { outboundJob } from './jobs/outbound';
import { pollGoogleCalendarJob, pollMicrosoftCalendarJob, pollNotionJob, pollRedditJob, pollSteamJob, pollTwitchJob, pollYoutubeJob } from './jobs/poll';
import { tokenRefreshJob } from './jobs/token-refresh';
import { createIntegrationsService, registerOutboundEventBridge } from './service';
import en from './locales/en.json';

registerPluginLocales('integrations', { en });

export const plugin = definePlugin({
  manifest,
  commands: [integrationCommand],
  components: [...integrationConfirmComponents],
  jobs: [
    inboundJob,
    outboundJob,
    pollTwitchJob,
    pollYoutubeJob,
    pollRedditJob,
    pollSteamJob,
    pollGoogleCalendarJob,
    pollMicrosoftCalendarJob,
    pollNotionJob,
    tokenRefreshJob,
  ],
  async onLoad(ctx) {
    ctx.services.register('integrations', createIntegrationsService(ctx));
    registerOutboundEventBridge(ctx);
  },
  async health(ctx) {
    const active = await ctx.prisma.integrationConnection.count({ where: { status: 'CONNECTED', deletedAt: null } }).catch(() => 0);
    const errored = await ctx.prisma.integrationConnection.count({ where: { status: 'ERROR', deletedAt: null } }).catch(() => 0);
    if (errored > 0 && active === 0) {
      return { status: 'degraded', details: `${errored} connection(s) in an error state.` };
    }
    return { status: 'ok', details: `${active} connection(s) active${errored > 0 ? `, ${errored} in error` : ''}.` };
  },
});

export default plugin;
