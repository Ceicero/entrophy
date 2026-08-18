import type { ModalSubmitInteraction } from 'discord.js';
import { errorEmbed, successEmbed, type ComponentHandler } from '../../sdk';
import type { CommunityConfig } from '../manifest';
import {
  STICKY_COOLDOWN_MAX,
  STICKY_COOLDOWN_MIN,
  stickyErrorMessage,
  stickyJumpLink,
} from '../commands/sticky';
import { StickyError, upsertSticky } from '../sticky';

/**
 * `/sticky set` editor modal submit — custom id `community:sticky-modal:<ownerId>:<channelId>:<cooldown>`.
 * The owner check is done by the host (`ownerOnly`, first arg); staff level is re-checked here because a modal
 * can be submitted long after the command that opened it.
 */
const stickyModal: ComponentHandler = {
  action: 'sticky-modal',
  kind: 'modal',
  ownerOnly: true,
  requirement: { staffLevel: 'moderator' },
  async handler(c) {
    const interaction = c.interaction as unknown as ModalSubmitInteraction<'cached'>;
    const [, channelId, cooldownArg] = c.args;
    if (!channelId) {
      await interaction.reply({ embeds: [errorEmbed(c.t('sticky.badChannel'))], ephemeral: true });
      return;
    }

    const config = await c.config<CommunityConfig>();
    const parsedCooldown = Number.parseInt(cooldownArg ?? '', 10);
    const cooldownSeconds =
      Number.isFinite(parsedCooldown) &&
      parsedCooldown >= STICKY_COOLDOWN_MIN &&
      parsedCooldown <= STICKY_COOLDOWN_MAX
        ? parsedCooldown
        : config.sticky.defaultCooldownSeconds;

    const content = interaction.fields.getTextInputValue('content') || undefined;
    const title = interaction.fields.getTextInputValue('embed_title') || undefined;
    const description = interaction.fields.getTextInputValue('embed_description') || undefined;

    await interaction.deferReply({ ephemeral: true });
    try {
      const sticky = await upsertSticky(c.ctx, {
        guild: interaction.guild,
        guildId: c.guildId,
        channelId,
        content,
        embed: title || description ? { title, description } : null,
        cooldownSeconds,
        actorId: interaction.user.id,
      });
      const link = sticky.lastMessageId ? stickyJumpLink(c.guildId, channelId, sticky.lastMessageId) : null;
      await interaction.editReply({
        embeds: [
          successEmbed(
            `${c.t('sticky.set', { channel: `<#${channelId}>`, cooldown: cooldownSeconds })}${link ? `\n${link}` : ''}`,
          ),
        ],
      });
    } catch (err) {
      if (err instanceof StickyError) {
        await interaction.editReply({ embeds: [errorEmbed(stickyErrorMessage(c, err))] });
        return;
      }
      throw err;
    }
  },
};

export const stickyComponents: ComponentHandler[] = [stickyModal];
