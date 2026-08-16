import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type ModalSubmitInteraction } from 'discord.js';
import {
  buildCustomId,
  errorEmbed,
  infoEmbed,
  resolveTextChannel,
  successEmbed,
  type ComponentHandler,
} from '../../sdk';
import type { RolesConfig } from '../manifest';

/** Submit handler for the `/verify` modal-mode question form: `roles:verify-modal:<userId>`. Creates a PENDING `VerificationRequest` and posts it to the staff queue channel. */
export const verifyModalHandler: ComponentHandler = {
  action: 'verify-modal',
  kind: 'modal',
  ownerOnly: true,
  async handler(c) {
    const interaction = c.interaction as unknown as ModalSubmitInteraction<'cached'>;
    const config = await c.config<RolesConfig>();

    const existingPending = await c.ctx.prisma.verificationRequest.findFirst({
      where: { guildId: c.guildId, userId: interaction.user.id, status: 'PENDING' },
    });
    if (existingPending) {
      await interaction.reply({
        embeds: [errorEmbed('You already have a verification request pending staff review.')],
        ephemeral: true,
      });
      return;
    }

    const answers = config.verification.questions.map((question, i) => ({
      question,
      answer: interaction.fields.getTextInputValue(`q${i}`),
    }));

    const request = await c.ctx.prisma.verificationRequest.create({
      data: {
        guildId: c.guildId,
        userId: interaction.user.id,
        method: 'MODAL',
        status: 'PENDING',
        answers: answers as never,
      },
    });

    if (config.verification.staffChannelId) {
      const channel = await resolveTextChannel(interaction.guild, config.verification.staffChannelId);
      if (channel) {
        const embed = infoEmbed(
          'Verification request',
          `<@${interaction.user.id}> (${interaction.user.tag}) — \`${interaction.user.id}\``,
        ).addFields(
          answers.map((a, i) => ({
            name: `Q${i + 1}: ${a.question}`.slice(0, 256),
            value: (a.answer || '_(blank)_').slice(0, 1024),
          })),
        );
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(buildCustomId('roles', 'verify-approve', request.id))
            .setLabel('Approve')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(buildCustomId('roles', 'verify-deny', request.id))
            .setLabel('Deny')
            .setStyle(ButtonStyle.Danger),
        );
        const sent = await channel.send({ embeds: [embed], components: [row] }).catch(() => null);
        if (sent) {
          await c.ctx.prisma.verificationRequest.update({
            where: { id: request.id },
            data: { staffMessageId: sent.id },
          });
        }
      }
    }

    await interaction.reply({
      embeds: [successEmbed('Submitted — staff will review your answers shortly.')],
      ephemeral: true,
    });
  },
};
