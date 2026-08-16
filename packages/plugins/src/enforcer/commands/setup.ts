import { ChannelType, type SlashCommandBuilder } from 'discord.js';
import { assertStaffLevel, errorEmbed, successEmbed, type CommandContext } from '../../sdk';
import {
  applyFlagQueueOverwrites,
  applyLedgerOverwrites,
  applyMuteRoleToChannels,
  ensureMuteRole,
  ensureTextChannel,
} from '../channels';
import { buildLedgerEmbed } from '../embeds';
import type { EnforcerConfig } from '../manifest';

export function addSetupSubcommand(builder: SlashCommandBuilder): SlashCommandBuilder {
  return builder.addSubcommand((sub) =>
    sub
      .setName('setup')
      .setDescription('Set up (or repair) the ledger channel, flag-queue channel, and mute role.')
      .addChannelOption((opt) =>
        opt
          .setName('ledger_channel')
          .setDescription('Existing channel to use as the ledger (created as #mod-ledger if omitted).')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false),
      )
      .addStringOption((opt) =>
        opt
          .setName('ledger_visibility')
          .setDescription('Who can read the ledger channel (default: staff only).')
          .addChoices(
            { name: 'Staff only', value: 'staff' },
            { name: 'Everyone (transparency mode)', value: 'everyone' },
          )
          .setRequired(false),
      )
      .addChannelOption((opt) =>
        opt
          .setName('flag_channel')
          .setDescription(
            'Existing channel to use as the flag queue (created as #enforcer-queue if omitted).',
          )
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false),
      )
      .addRoleOption((opt) =>
        opt
          .setName('mute_role')
          .setDescription('Existing role to use for Mute decisions (a "Muted" role is created if omitted).')
          .setRequired(false),
      )
      .addBooleanOption((opt) =>
        opt
          .setName('capture_context')
          .setDescription('Store a short context snapshot with every flag (default: on).')
          .setRequired(false),
      )
      .addBooleanOption((opt) =>
        opt
          .setName('repair')
          .setDescription(
            'Only re-apply channel permission overwrites from the current config — no other changes.',
          )
          .setRequired(false),
      ),
  ) as SlashCommandBuilder;
}

export async function executeSetup(c: CommandContext): Promise<void> {
  assertStaffLevel(c.staffLevel, 'admin', c.t);

  const moderationEnabled = await c.ctx.isEnabled(c.guildId, 'moderation');
  if (!moderationEnabled) {
    await c.interaction.reply({ embeds: [errorEmbed(c.t('setup.moderationRequired'))], ephemeral: true });
    return;
  }

  await c.interaction.deferReply({ ephemeral: true });

  const guild = c.interaction.guild;
  const config = await c.config<EnforcerConfig>();
  const repairOnly = c.interaction.options.getBoolean('repair') ?? false;

  const guildConfig = await c.ctx.services.require('host').getGuildConfig(c.guildId);
  const staffRoleIds = [...guildConfig.adminRoleIds, ...guildConfig.modRoleIds, ...guildConfig.helperRoleIds];

  if (repairOnly) {
    const enforcer = c.ctx.services.get('enforcer');
    if (enforcer) await enforcer.repairChannels(c.guildId);
    await c.interaction.editReply({
      embeds: [successEmbed('Channel permission overwrites re-applied from the current configuration.')],
    });
    return;
  }

  const ledgerChannelOpt = c.interaction.options.getChannel('ledger_channel');
  const ledgerVisibilityOpt = c.interaction.options.getString('ledger_visibility') as
    'staff' | 'everyone' | null;
  const flagChannelOpt = c.interaction.options.getChannel('flag_channel');
  const muteRoleOpt = c.interaction.options.getRole('mute_role');
  const captureContextOpt = c.interaction.options.getBoolean('capture_context');

  const ledgerChannel = await ensureTextChannel({
    guild,
    existingChannelId: ledgerChannelOpt?.id ?? config.ledgerChannelId,
    fallbackName: 'mod-ledger',
    reason: 'Enforcer setup: ledger channel',
  });
  const ledgerVisibility = ledgerVisibilityOpt ?? config.ledgerVisibility;
  await applyLedgerOverwrites(ledgerChannel, ledgerVisibility, staffRoleIds);

  const flagChannel = await ensureTextChannel({
    guild,
    existingChannelId: flagChannelOpt?.id ?? config.flagChannelId,
    fallbackName: 'enforcer-queue',
    reason: 'Enforcer setup: flag-queue channel',
  });
  await applyFlagQueueOverwrites(flagChannel, staffRoleIds);

  let muteRoleId = config.muteRoleId;
  let muteRoleReport = 'unchanged';
  if (muteRoleOpt) {
    muteRoleId = muteRoleOpt.id;
    muteRoleReport = `using <@&${muteRoleId}>`;
  } else if (!config.muteRoleId) {
    const role = await ensureMuteRole({ guild, existingRoleId: null, reason: 'Enforcer setup: mute role' });
    muteRoleId = role.id;
    const { applied, failed } = await applyMuteRoleToChannels(guild, role);
    muteRoleReport = `created <@&${role.id}> and applied deny-overwrites to ${applied} channel(s)${failed > 0 ? ` (${failed} failed — check my Manage Roles/Manage Channels permission there)` : ''}`;
  }

  await c.ctx.setConfig<EnforcerConfig>(
    c.guildId,
    {
      ledgerChannelId: ledgerChannel.id,
      ledgerVisibility,
      flagChannelId: flagChannel.id,
      muteRoleId,
      captureContext: captureContextOpt ?? config.captureContext,
    },
    { id: c.interaction.user.id, source: 'bot' },
  );

  const ledgerEmbed = buildLedgerEmbed({
    recordNumber: 0,
    kind: 'NOTE',
    userId: c.interaction.user.id,
    createdAt: new Date(),
    action: 'Ledger opened',
    source: 'MANUAL',
  });
  await ledgerChannel.send({ embeds: [ledgerEmbed], allowedMentions: { parse: [] } }).catch(() => undefined);

  await c.ctx.audit({
    guildId: c.guildId,
    actorId: c.interaction.user.id,
    actorType: 'user',
    action: 'enforcer.setup.complete',
    targetType: 'guild_config',
    targetId: c.guildId,
    after: { ledgerChannelId: ledgerChannel.id, flagChannelId: flagChannel.id, muteRoleId, ledgerVisibility },
    source: 'bot',
  });

  await c.interaction.editReply({
    embeds: [
      successEmbed(
        [
          `Ledger channel: <#${ledgerChannel.id}> (${ledgerVisibility === 'staff' ? 'staff only' : 'server-wide'})`,
          `Flag-queue channel: <#${flagChannel.id}> (staff only)`,
          `Mute role: ${muteRoleId ? `<@&${muteRoleId}> — ${muteRoleReport}` : 'not set'}`,
          `Capture context: ${(captureContextOpt ?? config.captureContext) ? 'On' : 'Off'}`,
          '',
          'Enable Enforcer with `/plugin enable enforcer`, then create your first policy with `/enforcer policy import` or `/enforcer policy create`.',
        ].join('\n'),
      ),
    ],
  });
}
