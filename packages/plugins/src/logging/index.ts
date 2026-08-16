import { definePlugin, registerPluginLocales } from '../sdk';
import { manifest } from './manifest';
import { command as logsCommand } from './commands/logs';
import { memberEvents } from './events/member';
import { guildMemberUpdate } from './events/member-update';
import { messageEvents } from './events/message';
import { roleEvents } from './events/role';
import { channelEvents } from './events/channel';
import { threadEvents } from './events/thread';
import { guildUpdate } from './events/guild';
import { voiceStateUpdate } from './events/voice';
import { inviteEvents } from './events/invite';
import { retentionJob } from './jobs/retention';
import { registerPlatformEventBridge } from './platform-events';
import { LOGGING_PLUGIN_ID, LoggingServiceImpl, setLoggingServiceInstance } from './service';
import en from './locales/en.json';

registerPluginLocales('logging', { en });

export const plugin = definePlugin({
  manifest,
  commands: [logsCommand],
  events: [
    ...memberEvents,
    guildMemberUpdate,
    ...messageEvents,
    ...roleEvents,
    ...channelEvents,
    ...threadEvents,
    guildUpdate,
    voiceStateUpdate,
    ...inviteEvents,
  ],
  jobs: [retentionJob],
  async onLoad(ctx) {
    const service = new LoggingServiceImpl(ctx);
    setLoggingServiceInstance(service);
    ctx.services.register(LOGGING_PLUGIN_ID, service);
    registerPlatformEventBridge(ctx);
  },
  async health(ctx) {
    // No external dependency beyond Discord + the database, both of which the host's own `/health` already
    // probes; this just confirms the plugin's own service registered successfully.
    return ctx.services.get('logging')
      ? { status: 'ok' }
      : { status: 'degraded', details: 'logging service failed to register' };
  },
});

export default plugin;
