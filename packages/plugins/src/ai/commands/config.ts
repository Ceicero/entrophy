import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { ValidationError } from '@entrophy/core';
import { errorEmbed, listEmbed, successEmbed, type PluginCommand } from '../../sdk';
import { describeAvailability } from '../service';
import type { AiConfig } from '../manifest';
import { openSetKeyModal } from '../components/set-key-modal';

const PROVIDER_CHOICES = [
  { name: 'OpenAI', value: 'openai' },
  { name: 'Anthropic', value: 'anthropic' },
  { name: 'OpenAI-compatible', value: 'compatible' },
] as const;

const data = new SlashCommandBuilder()
  .setName('ai')
  .setDescription('Configure the AI assistant for this server.')
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommandGroup((group) =>
    group
      .setName('config')
      .setDescription('AI assistant configuration')
      .addSubcommand((sub) => sub.setName('view').setDescription('View the current AI assistant configuration.'))
      .addSubcommand((sub) => sub.setName('set-key').setDescription('Set the API key for the configured provider.'))
      .addSubcommand((sub) => sub.setName('clear-key').setDescription('Remove the configured API key.'))
      .addSubcommand((sub) =>
        sub
          .setName('provider')
          .setDescription('Set the AI provider.')
          .addStringOption((opt) => opt.setName('provider').setDescription('Provider').setRequired(true).addChoices(...PROVIDER_CHOICES))
          .addStringOption((opt) => opt.setName('base-url').setDescription('Base URL (only used for OpenAI-compatible)').setMaxLength(300)),
      )
      .addSubcommand((sub) =>
        sub
          .setName('model')
          .setDescription('Set the model name.')
          .addStringOption((opt) => opt.setName('name').setDescription('Model name, e.g. gpt-4o-mini').setRequired(true).setMaxLength(200)),
      )
      .addSubcommand((sub) =>
        sub
          .setName('channels')
          .setDescription('Add or remove an allowed channel for /ask and /summarize.')
          .addStringOption((opt) =>
            opt
              .setName('action')
              .setDescription('add or remove')
              .setRequired(true)
              .addChoices({ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' }),
          )
          .addChannelOption((opt) =>
            opt
              .setName('channel')
              .setDescription('Channel')
              .setRequired(true)
              .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.PublicThread, ChannelType.PrivateThread),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('budget')
          .setDescription('Set daily token budgets.')
          .addIntegerOption((opt) => opt.setName('daily').setDescription('Server-wide daily token budget').setRequired(true).setMinValue(1000).setMaxValue(10_000_000))
          .addIntegerOption((opt) => opt.setName('per-user').setDescription('Per-user daily token budget').setRequired(true).setMinValue(100).setMaxValue(1_000_000)),
      ),
  );

function formatChannels(channelIds: string[]): string {
  return channelIds.length > 0 ? channelIds.map((id) => `<#${id}>`).join(', ') : '_None — /ask and /summarize are disabled until at least one channel is added_';
}

export const command: PluginCommand = {
  data,
  requirement: { guildOnly: true, staffLevel: 'admin' },
  async execute(c) {
    const sub = c.interaction.options.getSubcommand(true);
    const actor = { id: c.interaction.user.id, source: 'bot' as const };

    if (sub === 'view') {
      const config = await c.config<AiConfig>();
      const availability = describeAvailability(config, { OPENAI_API_KEY: c.ctx.env.OPENAI_API_KEY, ANTHROPIC_API_KEY: c.ctx.env.ANTHROPIC_API_KEY });
      await c.interaction.reply({
        embeds: [
          listEmbed(c.t('config.viewTitle'), [
            `Status: ${availability.available ? '✅ Ready' : `⚠️ ${availability.reason}`}`,
            `Provider: ${config.provider}${config.provider === 'compatible' && config.baseUrl ? ` (${config.baseUrl})` : ''}`,
            `Model: ${config.model}`,
            `API key: ${config.apiKeyEnc ? 'Set for this server' : config.allowEnvKeys ? 'Not set — using environment key fallback if available' : 'Not set, and environment fallback is off'}`,
            `Allowed channels (/ask, /summarize): ${formatChannels(config.allowedChannelIds)}`,
            `Per-user cooldown: ${config.userCooldownSeconds}s`,
            `Daily token budget (server): ${config.dailyTokenBudget.toLocaleString()}`,
            `Daily token budget (per user): ${config.perUserDailyTokenBudget.toLocaleString()}`,
          ]),
        ],
        ephemeral: true,
      });
      return;
    }

    if (sub === 'set-key') {
      await openSetKeyModal(c.interaction, c.interaction.user.id);
      return;
    }

    if (sub === 'clear-key') {
      await c.ctx.setConfig<AiConfig>(c.guildId, { apiKeyEnc: null }, actor);
      await c.interaction.reply({ embeds: [successEmbed(c.t('config.keyCleared'))], ephemeral: true });
      return;
    }

    if (sub === 'provider') {
      const provider = c.interaction.options.getString('provider', true) as AiConfig['provider'];
      const baseUrl = c.interaction.options.getString('base-url');
      if (provider === 'compatible' && !baseUrl) {
        throw new ValidationError(c.t('errors.compatibleNeedsBaseUrl'));
      }
      await c.ctx.setConfig<AiConfig>(c.guildId, { provider, baseUrl: provider === 'compatible' ? baseUrl : null }, actor);
      await c.interaction.reply({ embeds: [successEmbed(c.t('config.providerSet', { provider }))], ephemeral: true });
      return;
    }

    if (sub === 'model') {
      const name = c.interaction.options.getString('name', true);
      await c.ctx.setConfig<AiConfig>(c.guildId, { model: name }, actor);
      await c.interaction.reply({ embeds: [successEmbed(c.t('config.modelSet', { model: name }))], ephemeral: true });
      return;
    }

    if (sub === 'channels') {
      const action = c.interaction.options.getString('action', true);
      const channel = c.interaction.options.getChannel('channel', true);
      const config = await c.config<AiConfig>();
      const next =
        action === 'add'
          ? [...new Set([...config.allowedChannelIds, channel.id])]
          : config.allowedChannelIds.filter((id) => id !== channel.id);
      await c.ctx.setConfig<AiConfig>(c.guildId, { allowedChannelIds: next }, actor);
      await c.interaction.reply({
        embeds: [successEmbed(action === 'add' ? c.t('config.channelAdded', { channel: channel.name }) : c.t('config.channelRemoved', { channel: channel.name }))],
        ephemeral: true,
      });
      return;
    }

    if (sub === 'budget') {
      const daily = c.interaction.options.getInteger('daily', true);
      const perUser = c.interaction.options.getInteger('per-user', true);
      if (perUser > daily) {
        throw new ValidationError(c.t('errors.perUserBudgetExceedsDaily'));
      }
      await c.ctx.setConfig<AiConfig>(c.guildId, { dailyTokenBudget: daily, perUserDailyTokenBudget: perUser }, actor);
      await c.interaction.reply({ embeds: [successEmbed(c.t('config.budgetSet', { daily, perUser }))], ephemeral: true });
      return;
    }

    await c.interaction.reply({ embeds: [errorEmbed(c.t('errors.generic'))], ephemeral: true });
  },
};
