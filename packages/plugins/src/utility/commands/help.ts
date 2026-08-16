import {
  ActionRowBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { buildCustomId, infoEmbed, type PluginCommand } from '../../sdk';

const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('List every plugin and its commands.')
  .setDMPermission(false);

const MAX_SELECT_OPTIONS = 25;

export const command: PluginCommand = {
  data,
  requirement: { guildOnly: true },
  async execute(c) {
    const host = c.ctx.services.get('host');
    if (!host) {
      await c.interaction.reply({
        embeds: [
          infoEmbed(
            c.t('help.title'),
            'The plugin catalog is not available right now. Try again in a moment.',
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    const manifests = host.listManifests();
    const availability = host.getPluginAvailability();

    const options: StringSelectMenuOptionBuilder[] = [];
    for (const manifest of manifests) {
      const isAvailable = availability.get(manifest.id)?.available !== false;
      if (!isAvailable) continue;
      const enabled = manifest.alwaysEnabled ? true : await host.isPluginEnabled(c.guildId, manifest.id);
      if (!enabled) continue;
      options.push(
        new StringSelectMenuOptionBuilder()
          .setLabel(manifest.name)
          .setValue(manifest.id)
          .setDescription(manifest.description.slice(0, 100)),
      );
      if (options.length >= MAX_SELECT_OPTIONS) break;
    }

    if (options.length === 0) {
      await c.interaction.reply({
        embeds: [infoEmbed(c.t('help.title'), c.t('help.noPlugins'))],
        ephemeral: true,
      });
      return;
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId(buildCustomId('utility', 'help-select', c.interaction.user.id))
      .setPlaceholder('Choose a plugin to see its commands')
      .addOptions(options);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

    await c.interaction.reply({
      embeds: [infoEmbed(c.t('help.title'), c.t('help.intro'))],
      components: [row],
      ephemeral: true,
    });
  },
};
