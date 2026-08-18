import {
  ActionRowBuilder,
  ChannelType,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import {
  buildCustomId,
  errorEmbed,
  infoEmbed,
  listEmbed,
  successEmbed,
  type CommandContext,
  type PluginCommand,
} from '../../sdk';
import type { CommunityConfig } from '../manifest';
import { removeSticky, STICKY_CONTENT_MAX, StickyError, upsertSticky } from '../sticky';
import { stickyPreview } from '../sticky-keys';

export const STICKY_COOLDOWN_MIN = 3;
export const STICKY_COOLDOWN_MAX = 600;

const STICKY_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement] as const;

const data = new SlashCommandBuilder()
  .setName('sticky')
  .setDescription('Keep a staff message pinned to the bottom of a channel.')
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addSubcommand((sub) =>
    sub
      .setName('set')
      .setDescription('Set (or replace) the sticky message for a channel.')
      .addChannelOption((opt) =>
        opt
          .setName('channel')
          .setDescription('Channel to stick the message in (default: this channel)')
          .setRequired(false)
          .addChannelTypes(...STICKY_CHANNEL_TYPES),
      )
      .addStringOption((opt) =>
        opt
          .setName('content')
          .setDescription('Sticky text. Leave empty to open an editor with embed fields.')
          .setRequired(false)
          .setMaxLength(STICKY_CONTENT_MAX),
      )
      .addIntegerOption((opt) =>
        opt
          .setName('cooldown')
          .setDescription('Minimum seconds between re-posts (default from config, usually 10)')
          .setRequired(false)
          .setMinValue(STICKY_COOLDOWN_MIN)
          .setMaxValue(STICKY_COOLDOWN_MAX),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('Remove the sticky message from a channel.')
      .addChannelOption((opt) =>
        opt
          .setName('channel')
          .setDescription('Channel to remove the sticky from (default: this channel)')
          .setRequired(false)
          .addChannelTypes(...STICKY_CHANNEL_TYPES),
      ),
  )
  .addSubcommand((sub) => sub.setName('list').setDescription('List every sticky message in this server.'));

/** `https://discord.com/channels/<guild>/<channel>/<message>` jump link to the bot's current sticky post. */
export function stickyJumpLink(guildId: string, channelId: string, messageId: string): string {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

/** Maps a `StickyError` to its user-facing locale string. */
export function stickyErrorMessage(c: Pick<CommandContext, 't'>, err: StickyError): string {
  return c.t(`sticky.${err.code}`, err.vars);
}

/** Resolves the target channel id: the explicit option, else the invoking channel when it's a text/announcement channel. */
function resolveTargetChannelId(c: CommandContext): string | null {
  const explicit = c.interaction.options.getChannel('channel');
  if (explicit) return explicit.id;
  const current = c.interaction.channel;
  if (!current) return null;
  return (STICKY_CHANNEL_TYPES as readonly ChannelType[]).includes(current.type) ? current.id : null;
}

/** Builds the `/sticky set` editor modal (content textarea + embed title/description). */
export function buildStickyModal(ownerId: string, channelId: string, cooldownSeconds: number): ModalBuilder {
  const row = (input: TextInputBuilder) => new ActionRowBuilder<TextInputBuilder>().addComponents(input);
  return new ModalBuilder()
    .setCustomId(buildCustomId('community', 'sticky-modal', ownerId, channelId, cooldownSeconds))
    .setTitle('Sticky message')
    .addComponents(
      row(
        new TextInputBuilder()
          .setCustomId('content')
          .setLabel('Message text')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(STICKY_CONTENT_MAX),
      ),
      row(
        new TextInputBuilder()
          .setCustomId('embed_title')
          .setLabel('Embed title (optional)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(256),
      ),
      row(
        new TextInputBuilder()
          .setCustomId('embed_description')
          .setLabel('Embed description (optional)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(4000),
      ),
    );
}

async function handleSet(c: CommandContext): Promise<void> {
  const { interaction, ctx, guildId, t } = c;
  const channelId = resolveTargetChannelId(c);
  if (!channelId) {
    await interaction.reply({ embeds: [errorEmbed(t('sticky.badChannel'))], ephemeral: true });
    return;
  }

  const config = await c.config<CommunityConfig>();
  if (!config.sticky.enabled) {
    await interaction.reply({ embeds: [errorEmbed(t('sticky.disabled'))], ephemeral: true });
    return;
  }

  const content = interaction.options.getString('content');
  const cooldownSeconds = interaction.options.getInteger('cooldown') ?? config.sticky.defaultCooldownSeconds;

  if (!content) {
    await interaction.showModal(buildStickyModal(interaction.user.id, channelId, cooldownSeconds));
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  try {
    const sticky = await upsertSticky(ctx, {
      guild: interaction.guild,
      guildId,
      channelId,
      content,
      cooldownSeconds,
      actorId: interaction.user.id,
    });
    const link = sticky.lastMessageId ? stickyJumpLink(guildId, channelId, sticky.lastMessageId) : null;
    await interaction.editReply({
      embeds: [
        successEmbed(
          `${t('sticky.set', { channel: `<#${channelId}>`, cooldown: cooldownSeconds })}${link ? `\n${link}` : ''}`,
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
}

async function handleRemove(c: CommandContext): Promise<void> {
  const { interaction, ctx, guildId, t } = c;
  const channelId = resolveTargetChannelId(c);
  if (!channelId) {
    await interaction.reply({ embeds: [errorEmbed(t('sticky.badChannel'))], ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  const removed = await removeSticky(ctx, guildId, channelId, interaction.user.id);
  await interaction.editReply({
    embeds: [
      removed
        ? successEmbed(t('sticky.removed', { channel: `<#${channelId}>` }))
        : errorEmbed(t('sticky.notFound', { channel: `<#${channelId}>` })),
    ],
  });
}

async function handleList(c: CommandContext): Promise<void> {
  const { interaction, ctx, guildId, t } = c;
  const rows = await ctx.prisma.stickyMessage.findMany({ where: { guildId }, orderBy: { createdAt: 'asc' } });
  if (rows.length === 0) {
    await interaction.reply({
      embeds: [infoEmbed(t('sticky.listTitle'), t('sticky.listEmpty'))],
      ephemeral: true,
    });
    return;
  }
  const lines = rows.map((s) => {
    const posted = s.lastPostedAt ? `<t:${Math.floor(s.lastPostedAt.getTime() / 1000)}:R>` : '—';
    const link = s.lastMessageId ? ` · [jump](${stickyJumpLink(guildId, s.channelId, s.lastMessageId)})` : '';
    return `<#${s.channelId}> — ${stickyPreview(s)} — last posted ${posted}${link}`;
  });
  await interaction.reply({ embeds: [listEmbed(t('sticky.listTitle'), lines)], ephemeral: true });
}

export const command: PluginCommand = {
  data,
  requirement: {
    staffLevel: 'moderator',
    guildOnly: true,
    botPermissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
  },
  async execute(c) {
    const sub = c.interaction.options.getSubcommand(true);
    if (sub === 'set') return handleSet(c);
    if (sub === 'remove') return handleRemove(c);
    return handleList(c);
  },
};
