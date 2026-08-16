import type { PluginCommand } from '../../sdk';
import { buildSectionCommand, buildSectionExecute } from './welcome-goodbye-shared';

export const command: PluginCommand = {
  data: buildSectionCommand('welcome'),
  requirement: { staffLevel: 'moderator', guildOnly: true },
  execute: buildSectionExecute('welcome'),
};
