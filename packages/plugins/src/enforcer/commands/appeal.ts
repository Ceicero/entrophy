import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, type SlashCommandBuilder } from 'discord.js';
import { errorEmbed, PendingStore, buildCustomId, type CommandContext } from '../../sdk';

export function addAppealSubcommand(builder: SlashCommandBuilder): SlashCommandBuilder {
  return builder.addSubcommand((sub) =>
    sub.setName('appeal').setDescription('Appeal an Enforcer record (member-facing).').addIntegerOption((opt) => opt.setName('record').setDescription('Record number, e.g. 12 for #E-12.').setRequired(true).setMinValue(1)),
  ) as SlashCommandBuilder;
}

/** Member-facing — anyone can run this (no `assertStaffLevel` call), but only against their own record. */
export async function executeAppeal(c: CommandContext): Promise<void> {
  const number = c.interaction.options.getInteger('record', true);
  const record = await c.ctx.prisma.enforcerRecord.findUnique({ where: { guildId_recordNumber: { guildId: c.guildId, recordNumber: number } } });

  if (!record || record.userId !== c.interaction.user.id) {
    await c.interaction.reply({ embeds: [errorEmbed(c.t('record.notFound'))], ephemeral: true });
    return;
  }
  if (!record.caseId) {
    await c.interaction.reply({ embeds: [errorEmbed(c.t('appeal.noCase'))], ephemeral: true });
    return;
  }

  const pendingStore = new PendingStore(c.ctx.redis);
  const pendingId = await pendingStore.put({ recordId: record.id, caseId: record.caseId }, 300);

  const modal = new ModalBuilder()
    .setCustomId(buildCustomId('enforcer', 'appeal-modal', c.interaction.user.id, pendingId))
    .setTitle(`Appeal record #E-${number}`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('content').setLabel('Why should this decision be reconsidered?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000),
      ),
    );

  await c.interaction.showModal(modal);
}
