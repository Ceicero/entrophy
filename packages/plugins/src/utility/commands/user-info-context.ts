import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  type UserContextMenuCommandInteraction,
} from 'discord.js';
import type { PluginCommand } from '../../sdk';
import { buildUserInfoEmbed } from './utility';

const data = new ContextMenuCommandBuilder()
  .setName('User info')
  .setType(ApplicationCommandType.User)
  .setDMPermission(false);

export const command: PluginCommand = {
  data,
  requirement: { guildOnly: true },
  // Chat-input execute is never called for a context-menu-only command; the host routes context menu
  // interactions to `executeContextMenu`. Required by the `PluginCommand` interface regardless.
  async execute() {
    // no-op
  },
  async executeContextMenu(c) {
    const interaction = c.interaction as unknown as UserContextMenuCommandInteraction<'cached'>;
    await interaction.reply({
      embeds: [buildUserInfoEmbed(interaction.targetUser, interaction.targetMember)],
      ephemeral: true,
    });
  },
};
