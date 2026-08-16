import {
  ActionRowBuilder,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { buildCustomId, errorEmbed, type PluginCommand } from '../../sdk';
import { moderationService } from './shared';

const data = new SlashCommandBuilder()
  .setName('appeal')
  .setDescription('Appeal a moderation case taken against you.')
  .setDMPermission(false)
  .addIntegerOption((o) =>
    o.setName('case-number').setDescription('The case number to appeal').setRequired(true).setMinValue(1),
  );

export const command: PluginCommand = {
  data,
  requirement: { staffLevel: 'member', guildOnly: true },
  async execute(c) {
    const caseNumber = c.interaction.options.getInteger('case-number', true);
    const service = moderationService(c.ctx);
    const caseRow = await service.getCase(c.guildId, caseNumber);

    if (!caseRow) {
      await c.interaction.reply({
        embeds: [errorEmbed(c.t('errors.caseNotFound', { number: caseNumber }))],
        ephemeral: true,
      });
      return;
    }
    if (caseRow.targetId !== c.interaction.user.id) {
      await c.interaction.reply({ embeds: [errorEmbed(c.t('appeal.notYours'))], ephemeral: true });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(buildCustomId('moderation', 'appeal-modal', c.interaction.user.id, String(caseNumber)))
      .setTitle(`Appeal case #${caseNumber}`)
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('content')
            .setLabel('Why should this be reconsidered?')
            .setStyle(TextInputStyle.Paragraph)
            .setMinLength(20)
            .setMaxLength(1500)
            .setRequired(true),
        ),
      );

    await c.interaction.showModal(modal);
  },
};
