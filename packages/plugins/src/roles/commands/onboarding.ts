import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import {
  assertStaffLevel,
  buildCustomId,
  errorEmbed,
  infoEmbed,
  listEmbed,
  resolveTextChannel,
  successEmbed,
  type PluginCommand,
} from '../../sdk';
import { buildOnboardingChecklist, parseOnboardingProgress } from '../engine';
import type { RolesConfig } from '../manifest';

const data = new SlashCommandBuilder()
  .setName('onboarding')
  .setDescription('Rules acknowledgement and the member onboarding checklist.')
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) => sub.setName('checklist').setDescription('See your onboarding progress.'))
  .addSubcommand((sub) =>
    sub
      .setName('config')
      .setDescription('Configure onboarding (staff only).')
      .addStringOption((opt) =>
        opt
          .setName('rules-text')
          .setDescription('The rules text shown by /onboarding rules-post')
          .setMaxLength(4000),
      )
      .addRoleOption((opt) =>
        opt.setName('rules-role').setDescription('Role granted when a member agrees to the rules'),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('rules-post')
      .setDescription('Post the rules with an "I agree" button (staff only).')
      .addChannelOption((opt) =>
        opt
          .setName('channel')
          .setDescription('Channel to post in')
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('step-add')
      .setDescription('Add a custom onboarding checklist step (staff only).')
      .addStringOption((opt) =>
        opt.setName('id').setDescription('Short unique id').setRequired(true).setMaxLength(64),
      )
      .addStringOption((opt) =>
        opt.setName('label').setDescription('What the member sees').setRequired(true).setMaxLength(200),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('step-remove')
      .setDescription('Remove a custom onboarding step (staff only).')
      .addStringOption((opt) =>
        opt.setName('id').setDescription('Step id').setRequired(true).setAutocomplete(true),
      ),
  );

export const command: PluginCommand = {
  data,
  async execute(c) {
    const sub = c.interaction.options.getSubcommand(true);
    const config = await c.config<RolesConfig>();

    if (sub === 'checklist') {
      const progressRow = await c.ctx.prisma.onboardingProgress.findUnique({
        where: { guildId_userId: { guildId: c.guildId, userId: c.interaction.user.id } },
      });
      const items = buildOnboardingChecklist({
        rulesConfigured: Boolean(config.rulesText),
        rulesAcceptedAt: progressRow?.rulesAcceptedAt ?? null,
        verificationEnabled: Boolean(config.verification.verifiedRoleId),
        progress: parseOnboardingProgress(progressRow?.steps),
        customStepDefs: config.steps,
      });
      const lines = items.map((item) => `${item.done ? '✅' : '⬜'} ${item.label}`);
      await c.interaction.reply({ embeds: [listEmbed('Your onboarding checklist', lines)], ephemeral: true });
      return;
    }

    assertStaffLevel(c.staffLevel, 'moderator', c.t);

    if (sub === 'config') {
      const rulesText = c.interaction.options.getString('rules-text');
      const rulesRole = c.interaction.options.getRole('rules-role');
      if (rulesText === null && rulesRole === null) {
        await c.interaction.reply({
          embeds: [errorEmbed('Provide rules-text and/or rules-role.')],
          ephemeral: true,
        });
        return;
      }
      await c.ctx.setConfig<RolesConfig>(
        c.guildId,
        {
          ...(rulesText !== null ? { rulesText } : {}),
          ...(rulesRole !== null ? { rulesRoleId: rulesRole.id } : {}),
        },
        { id: c.interaction.user.id, source: 'bot' },
      );
      await c.interaction.reply({
        embeds: [successEmbed('Onboarding configuration updated.')],
        ephemeral: true,
      });
      return;
    }

    if (sub === 'rules-post') {
      if (!config.rulesText) {
        await c.interaction.reply({
          embeds: [errorEmbed('Set the rules text first with `/onboarding config rules-text:...`.')],
          ephemeral: true,
        });
        return;
      }
      const channel = c.interaction.options.getChannel('channel', true);
      const target = await resolveTextChannel(c.interaction.guild, channel.id);
      if (!target) {
        await c.interaction.reply({
          embeds: [errorEmbed("I can't send messages in that channel.")],
          ephemeral: true,
        });
        return;
      }
      const embed = infoEmbed('Server rules', config.rulesText);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(buildCustomId('roles', 'rules-agree'))
          .setLabel('I agree')
          .setStyle(ButtonStyle.Success),
      );
      await target.send({ embeds: [embed], components: [row] });
      await c.interaction.reply({
        embeds: [successEmbed(`Posted the rules in <#${target.id}>.`)],
        ephemeral: true,
      });
      return;
    }

    if (sub === 'step-add') {
      const id = c.interaction.options.getString('id', true);
      const label = c.interaction.options.getString('label', true);
      if (config.steps.some((s) => s.id === id)) {
        await c.interaction.reply({
          embeds: [errorEmbed(`A step with id \`${id}\` already exists.`)],
          ephemeral: true,
        });
        return;
      }
      if (config.steps.length >= 20) {
        await c.interaction.reply({
          embeds: [errorEmbed('At most 20 custom steps are supported.')],
          ephemeral: true,
        });
        return;
      }
      await c.ctx.setConfig<RolesConfig>(
        c.guildId,
        { steps: [...config.steps, { id, label }] },
        { id: c.interaction.user.id, source: 'bot' },
      );
      await c.interaction.reply({ embeds: [successEmbed(`Added step **${label}**.`)], ephemeral: true });
      return;
    }

    if (sub === 'step-remove') {
      const id = c.interaction.options.getString('id', true);
      if (!config.steps.some((s) => s.id === id)) {
        await c.interaction.reply({ embeds: [errorEmbed('No step with that id.')], ephemeral: true });
        return;
      }
      await c.ctx.setConfig<RolesConfig>(
        c.guildId,
        { steps: config.steps.filter((s) => s.id !== id) },
        { id: c.interaction.user.id, source: 'bot' },
      );
      await c.interaction.reply({ embeds: [successEmbed('Removed the step.')], ephemeral: true });
    }
  },
  async autocomplete(c) {
    const config = await c.config<RolesConfig>();
    const query = String(c.interaction.options.getFocused()).toLowerCase();
    const matches = config.steps
      .filter((s) => s.id.toLowerCase().includes(query) || s.label.toLowerCase().includes(query))
      .slice(0, 25);
    await c.interaction.respond(matches.map((s) => ({ name: `${s.id} — ${s.label}`, value: s.id })));
  },
};
