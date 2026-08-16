import { definePlugin, registerPluginLocales } from '../sdk';
import { manifest } from './manifest';
import { command as modCommand } from './commands/mod';
import { command as appealCommand } from './commands/appeal';
import { command as warnUserContextCommand } from './commands/context-menu-warn';
import { command as viewCasesContextCommand } from './commands/context-menu-cases';
import { confirmationComponents } from './components/confirmations';
import { appealComponents } from './components/appeal';
import { warnModalComponent } from './components/warn-modal';
import { expireJob } from './jobs/expire';
import { sweepJob } from './jobs/sweep';
import { appealSyncJob } from './jobs/appeal-sync';
import { ModerationServiceImpl } from './service';
import en from './locales/en.json';

registerPluginLocales('moderation', { en });

export const plugin = definePlugin({
  manifest,
  commands: [modCommand, appealCommand, warnUserContextCommand, viewCasesContextCommand],
  components: [...confirmationComponents, ...appealComponents, warnModalComponent],
  jobs: [expireJob, sweepJob, appealSyncJob],
  async onLoad(ctx) {
    ctx.services.register('moderation', new ModerationServiceImpl(ctx));
  },
  async health(ctx) {
    const hasService = ctx.services.has('moderation');
    return hasService ? { status: 'ok' } : { status: 'degraded', details: 'Service not registered.' };
  },
});

export default plugin;
