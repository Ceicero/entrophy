import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, type EmbedBuilder } from 'discord.js';
import type { PluginId } from '@entrophy/types';
import { buildCustomId, parseCustomId } from './custom-id';
import { infoEmbed } from './embeds';
import type { ConfirmationInteraction } from './confirm';

const COLLECTOR_TIMEOUT_MS = 2 * 60 * 1000;

export interface PaginatedReplyOptions {
  interaction: ConfirmationInteraction;
  pages: EmbedBuilder[];
  ownerId: string;
  pluginId: PluginId;
  /** Defaults to true (config views, moderation detail, etc. reply ephemerally per ARCHITECTURE.md §7.7). */
  ephemeral?: boolean;
}

function buildPageRow(pluginId: PluginId, ownerId: string, index: number, total: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildCustomId(pluginId, 'page', ownerId, String(index - 1)))
      .setLabel('◀ Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(index <= 0),
    new ButtonBuilder()
      .setCustomId(buildCustomId(pluginId, 'page', ownerId, String(index + 1)))
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(index >= total - 1),
  );
}

/**
 * Replies with `pages[0]` plus Previous/Next buttons (custom id `<pluginId>:page:<ownerId>:<index>`), wiring up
 * a 2-minute message component collector that flips pages for the owning user only. Buttons are removed when
 * the collector times out.
 */
export async function paginatedReply(options: PaginatedReplyOptions): Promise<void> {
  const { interaction, pages, ownerId, pluginId, ephemeral = true } = options;

  if (pages.length === 0) {
    await interaction.reply({ embeds: [infoEmbed('Nothing to show', 'There is nothing to display yet.')], ephemeral });
    return;
  }

  const components = pages.length > 1 ? [buildPageRow(pluginId, ownerId, 0, pages.length)] : [];
  await interaction.reply({ embeds: [pages[0]], components, ephemeral });

  if (pages.length <= 1) return;

  const message = await interaction.fetchReply();
  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: COLLECTOR_TIMEOUT_MS,
  });

  collector.on('collect', (button) => {
    void (async () => {
      if (button.user.id !== ownerId) {
        await button.reply({ content: 'Only the person who ran this command can page through it.', ephemeral: true });
        return;
      }
      const parsed = parseCustomId(button.customId);
      const nextIndex = Number(parsed.args[1]);
      if (!Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex >= pages.length) {
        await button.deferUpdate();
        return;
      }
      await button.update({ embeds: [pages[nextIndex]], components: [buildPageRow(pluginId, ownerId, nextIndex, pages.length)] });
    })();
  });

  collector.on('end', () => {
    void interaction.editReply({ components: [] }).catch(() => {
      // The message may already be gone (e.g. deleted, or an expired ephemeral interaction token) — nothing to clean up.
    });
  });
}
