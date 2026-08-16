import { SlashCommandBuilder } from 'discord.js';
import { definePlugin, registerPluginLocales, type ComponentHandler, type PluginCommand } from '../sdk';
import { manifest } from './manifest';
import { registerAppealListeners } from './appeal-listeners';
import { createEnforcerService } from './service';
import { messageCreateHandler } from './events/message-create';

import { addSetupSubcommand, executeSetup } from './commands/setup';
import { addStatusSubcommand, executeStatus } from './commands/status';
import { addPolicyGroup, autocompletePolicy, executePolicy } from './commands/policy';
import { addFlagSubcommand, executeFlag, flagContextMenuCommand } from './commands/flag';
import { addSearchSubcommand, executeSearch } from './commands/search';
import { addRecordSubcommand, executeRecord } from './commands/record';
import { addHistorySubcommand, executeHistory } from './commands/history';
import { addExportSubcommand, executeExport } from './commands/export';
import { addAppealSubcommand, executeAppeal } from './commands/appeal';
import { addMuteSubcommands, executeMute, executeUnmute } from './commands/mute';

import { decideComponents } from './components/decide';
import { contextComponents } from './components/context';
import { historyButtonComponents } from './components/history-button';
import { flagReviewComponents } from './components/flag-review';
import { appealComponents } from './components/appeal';

import en from './locales/en.json';

registerPluginLocales('enforcer', { en });

let enforcerBuilder = new SlashCommandBuilder()
  .setName('enforcer')
  .setDescription('Policy-driven, hands-off moderation: flag, decide, and keep an immutable ledger.')
  .setDMPermission(false);
// No `.setDefaultMemberPermissions(...)` here: `/enforcer appeal` is member-facing, so the top-level command
// stays visible to everyone; every staff-only subcommand asserts its own required staff level in its handler
// (ARCHITECTURE.md §7.7's per-command staffLevel doesn't fit a group with mixed audiences).
enforcerBuilder = addSetupSubcommand(enforcerBuilder);
enforcerBuilder = addStatusSubcommand(enforcerBuilder);
enforcerBuilder = addPolicyGroup(enforcerBuilder);
enforcerBuilder = addFlagSubcommand(enforcerBuilder);
enforcerBuilder = addSearchSubcommand(enforcerBuilder);
enforcerBuilder = addRecordSubcommand(enforcerBuilder);
enforcerBuilder = addHistorySubcommand(enforcerBuilder);
enforcerBuilder = addExportSubcommand(enforcerBuilder);
enforcerBuilder = addAppealSubcommand(enforcerBuilder);
enforcerBuilder = addMuteSubcommands(enforcerBuilder);

const enforcerCommand: PluginCommand = {
  data: enforcerBuilder,
  requirement: { guildOnly: true },
  async execute(c) {
    const group = c.interaction.options.getSubcommandGroup(false);
    const sub = c.interaction.options.getSubcommand(true);

    if (group === 'policy') {
      await executePolicy(c, sub);
      return;
    }

    switch (sub) {
      case 'setup':
        await executeSetup(c);
        return;
      case 'status':
        await executeStatus(c);
        return;
      case 'flag':
        await executeFlag(c);
        return;
      case 'search':
        await executeSearch(c);
        return;
      case 'record':
        await executeRecord(c);
        return;
      case 'history':
        await executeHistory(c);
        return;
      case 'export':
        await executeExport(c);
        return;
      case 'appeal':
        await executeAppeal(c);
        return;
      case 'mute':
        await executeMute(c);
        return;
      case 'unmute':
        await executeUnmute(c);
        return;
      default:
        return;
    }
  },
  async autocomplete(c) {
    // Every autocompletable option across this command's subcommands is named "policy"
    // (policy view/edit/delete/toggle/test, flag's policy option, search's policy option).
    await autocompletePolicy(c);
  },
};

const components: ComponentHandler[] = [
  ...decideComponents,
  ...contextComponents,
  ...historyButtonComponents,
  ...flagReviewComponents,
  ...appealComponents,
];

export const plugin = definePlugin({
  manifest,
  commands: [enforcerCommand, flagContextMenuCommand],
  components,
  events: [messageCreateHandler],
  async onLoad(ctx) {
    ctx.services.register('enforcer', createEnforcerService(ctx));
    registerAppealListeners(ctx);
  },
  async health(ctx) {
    if (!ctx.services.get('moderation')) {
      return {
        status: 'degraded',
        details: 'The moderation plugin is not loaded/enabled — decisions cannot execute until it is.',
      };
    }
    if (!ctx.intentsEnabled.messageContent) {
      return {
        status: 'degraded',
        details:
          'The Message Content privileged intent is off — automatic flagging is unavailable; manual flagging still works.',
      };
    }
    return { status: 'ok' };
  },
});

export default plugin;
