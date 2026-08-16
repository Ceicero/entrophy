import {
  ActionRowBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { assertStaffLevel, buildCustomId, type PluginCommand } from '../../sdk';
import type { UtilityConfig } from '../manifest';

const data = new SlashCommandBuilder()
  .setName('embed')
  .setDescription('Build a rich embed and preview it before sending.')
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addSubcommand((sub) => sub.setName('builder').setDescription('Open the embed builder.'));

/** Builds the (re-usable) create/edit modal. `pendingId` is `'new'` for a fresh build, or an existing pending id when editing. */
export function buildEmbedModal(
  ownerId: string,
  pendingId: string,
  prefill?: { title?: string; description?: string; colorHex?: string; imageUrl?: string; footer?: string },
): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(buildCustomId('utility', 'embed-modal', ownerId, pendingId))
    .setTitle('Embed builder');

  const titleInput = new TextInputBuilder()
    .setCustomId('title')
    .setLabel('Title')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(256);
  if (prefill?.title) titleInput.setValue(prefill.title);

  const descriptionInput = new TextInputBuilder()
    .setCustomId('description')
    .setLabel('Description')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(4000);
  if (prefill?.description) descriptionInput.setValue(prefill.description);

  const colorInput = new TextInputBuilder()
    .setCustomId('colorHex')
    .setLabel('Color (hex, e.g. #5865F2)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(7);
  if (prefill?.colorHex) colorInput.setValue(prefill.colorHex);

  const imageInput = new TextInputBuilder()
    .setCustomId('imageUrl')
    .setLabel('Image URL')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(500);
  if (prefill?.imageUrl) imageInput.setValue(prefill.imageUrl);

  const footerInput = new TextInputBuilder()
    .setCustomId('footer')
    .setLabel('Footer text')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(2048);
  if (prefill?.footer) footerInput.setValue(prefill.footer);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(colorInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(imageInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(footerInput),
  );

  return modal;
}

export const command: PluginCommand = {
  data,
  requirement: { discordPermissions: [PermissionFlagsBits.ManageMessages], guildOnly: true },
  async execute(c) {
    const config = await c.config<UtilityConfig>();
    if (config.embedBuilderStaffOnly) {
      assertStaffLevel(c.staffLevel, 'helper', c.t);
    }

    await c.interaction.showModal(buildEmbedModal(c.interaction.user.id, 'new'));
  },
};
