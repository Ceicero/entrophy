import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { errorEmbed, listEmbed, successEmbed, type PluginCommand } from '../../sdk';
import type { EngagementConfig } from '../manifest';

const data = new SlashCommandBuilder()
  .setName('starboard')
  .setDescription('Starboard settings.')
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommandGroup((group) =>
    group
      .setName('set')
      .setDescription('Change a starboard setting.')
      .addSubcommand((sub) =>
        sub
          .setName('channel')
          .setDescription('Channel starred messages get posted to.')
          .addChannelOption((opt) => opt.setName('channel').setDescription('Leave empty to disable the starboard.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
      )
      .addSubcommand((sub) =>
        sub
          .setName('threshold')
          .setDescription('How many stars a message needs to be posted.')
          .addIntegerOption((opt) => opt.setName('count').setDescription('Star count required.').setMinValue(1).setMaxValue(1000).setRequired(true)),
      )
      .addSubcommand((sub) =>
        sub
          .setName('emoji')
          .setDescription('Which emoji counts as a star.')
          .addStringOption((opt) => opt.setName('emoji').setDescription('A unicode emoji or a custom emoji from this server.').setRequired(true)),
      )
      .addSubcommand((sub) =>
        sub
          .setName('selfstar')
          .setDescription('Whether authors can star their own message.')
          .addBooleanOption((opt) => opt.setName('ignore').setDescription('True = self-stars do not count (default).').setRequired(true)),
      ),
  )
  .addSubcommand((sub) => sub.setName('status').setDescription('Show the current starboard configuration.'));

export const command: PluginCommand = {
  data,
  requirement: { staffLevel: 'admin', guildOnly: true },
  async execute(c) {
    const group = c.interaction.options.getSubcommandGroup(false);
    const sub = c.interaction.options.getSubcommand(true);
    const config = await c.config<EngagementConfig>();

    if (group === 'set') {
      if (sub === 'channel') {
        const channel = c.interaction.options.getChannel('channel');
        await c.ctx.setConfig<EngagementConfig>(c.guildId, { starboard: { ...config.starboard, channelId: channel?.id ?? null } }, { id: c.interaction.user.id, source: 'bot' });
        await c.interaction.reply({
          embeds: [successEmbed(channel ? c.t('starboard.set.channel', { channel: `<#${channel.id}>` }) : c.t('starboard.set.channelCleared'))],
          ephemeral: true,
        });
        return;
      }

      if (sub === 'threshold') {
        const count = c.interaction.options.getInteger('count', true);
        await c.ctx.setConfig<EngagementConfig>(c.guildId, { starboard: { ...config.starboard, threshold: count } }, { id: c.interaction.user.id, source: 'bot' });
        await c.interaction.reply({ embeds: [successEmbed(c.t('starboard.set.threshold', { threshold: count }))], ephemeral: true });
        return;
      }

      if (sub === 'emoji') {
        const emoji = c.interaction.options.getString('emoji', true).trim();
        if (emoji.length === 0) {
          await c.interaction.reply({ embeds: [errorEmbed('Emoji cannot be empty.')], ephemeral: true });
          return;
        }
        await c.ctx.setConfig<EngagementConfig>(c.guildId, { starboard: { ...config.starboard, emoji } }, { id: c.interaction.user.id, source: 'bot' });
        await c.interaction.reply({ embeds: [successEmbed(c.t('starboard.set.emoji', { emoji }))], ephemeral: true });
        return;
      }

      // sub === 'selfstar'
      const ignore = c.interaction.options.getBoolean('ignore', true);
      await c.ctx.setConfig<EngagementConfig>(c.guildId, { starboard: { ...config.starboard, ignoreSelfStar: ignore } }, { id: c.interaction.user.id, source: 'bot' });
      await c.interaction.reply({ embeds: [successEmbed(c.t('starboard.set.selfstar', { state: ignore ? 'ignored' : 'counted' }))], ephemeral: true });
      return;
    }

    // sub === 'status'
    const s = config.starboard;
    const [posted, total] = await Promise.all([
      c.ctx.prisma.starboardEntry.count({ where: { guildId: c.guildId, starboardMessageId: { not: null } } }),
      c.ctx.prisma.starboardEntry.count({ where: { guildId: c.guildId } }),
    ]);
    const lines = [
      `Channel: ${s.channelId ? `<#${s.channelId}>` : '_Not set (starboard disabled)_'}`,
      `Emoji: ${s.emoji}`,
      `Threshold: ${s.threshold}`,
      `Self-stars: ${s.ignoreSelfStar ? 'Ignored' : 'Counted'}`,
      `NSFW channels: ${s.allowNsfw ? 'Allowed' : 'Excluded'}`,
      `Currently posted: ${posted}`,
      `Tracked messages: ${total}`,
    ];
    await c.interaction.reply({ embeds: [listEmbed(c.t('starboard.status.title'), lines)], ephemeral: true });
  },
};
