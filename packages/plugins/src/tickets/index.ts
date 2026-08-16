import { definePlugin, registerPluginLocales } from '../sdk';
import { panelCreateComponents } from './components/panel-create';
import { panelComponents } from './components/panel';
import { ticketActionComponents } from './components/ticket-actions';
import { command as ticketCommand } from './commands/ticket';
import { messageCreateHandler } from './events/message-create';
import { deleteChannelJob } from './jobs/delete-channel';
import { slaJob } from './jobs/sla';
import { manifest } from './manifest';
import { createTicketsService } from './service';
import en from './locales/en.json';

// Registers the `tickets` locale bundle (core `t('tickets.<key>', ...)`); most in-flow messages below are still
// literal English pending a fuller i18n pass — see README.md "Notes" — but the shared error/confirmation keys
// here are available now and this call establishes the namespace for future call sites to adopt incrementally.
registerPluginLocales('tickets', { en });

export const plugin = definePlugin({
  manifest,
  commands: [ticketCommand],
  components: [...panelComponents, ...panelCreateComponents, ...ticketActionComponents],
  events: [messageCreateHandler],
  jobs: [slaJob, deleteChannelJob],
  async onLoad(ctx) {
    ctx.services.register('tickets', createTicketsService(ctx));
  },
  async health(ctx) {
    try {
      await ctx.prisma.ticket.count();
      return { status: 'ok' };
    } catch (err) {
      return { status: 'degraded', details: err instanceof Error ? err.message : 'Database check failed.' };
    }
  },
});

export default plugin;
