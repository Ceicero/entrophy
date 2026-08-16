import type { SlashCommandBuilder } from 'discord.js';
import { assertStaffLevel, listEmbed, type CommandContext } from '../../sdk';
import type { EnforcerConfig } from '../manifest';

export function addStatusSubcommand(builder: SlashCommandBuilder): SlashCommandBuilder {
  return builder.addSubcommand((sub) =>
    sub.setName('status').setDescription('Show Enforcer setup status, health, and configuration.'),
  ) as SlashCommandBuilder;
}

export async function executeStatus(c: CommandContext): Promise<void> {
  assertStaffLevel(c.staffLevel, 'helper', c.t);

  const config = await c.config<EnforcerConfig>();
  const moderationEnabled = await c.ctx.isEnabled(c.guildId, 'moderation');
  const enforcerEnabled = await c.ctx.isEnabled(c.guildId);
  const policyCount = await c.ctx.prisma.enforcerPolicy.count({
    where: { guildId: c.guildId, deletedAt: null, enabled: true },
  });
  const pendingCount = await c.ctx.prisma.enforcerRecord.count({
    where: { guildId: c.guildId, kind: 'FLAG', status: 'PENDING' },
  });

  const lines = [
    `Enabled: ${enforcerEnabled ? 'Yes' : 'No — run `/plugin enable enforcer`'}`,
    `Moderation plugin: ${moderationEnabled ? 'Enabled ✅' : 'Disabled ❌ — Enforcer decisions cannot execute without it'}`,
    `Message Content intent: ${c.ctx.intentsEnabled.messageContent ? 'Enabled — automatic flagging is active' : 'Disabled — manual flagging only (context menu / `/enforcer flag`)'}`,
    `Ledger channel: ${config.ledgerChannelId ? `<#${config.ledgerChannelId}> (${config.ledgerVisibility})` : '_Not set — run `/enforcer setup`_'}`,
    `Flag-queue channel: ${config.flagChannelId ? `<#${config.flagChannelId}>` : '_Not set — run `/enforcer setup`_'}`,
    `Mute role: ${config.muteRoleId ? `<@&${config.muteRoleId}>` : '_Not set_'}`,
    `Capture context: ${config.captureContext ? `On (${config.contextBefore} before / ${config.contextAfter} after)` : 'Off — flags carry only a jump link'}`,
    `Auto-flagging: ${config.autoFlagEnabled ? 'On' : 'Off'}`,
    `Exempt staff from auto-flagging: ${config.exemptStaff ? 'Yes' : 'No'}`,
    `AI assist: ${config.aiAssist ? (c.ctx.services.get('ai') ? 'On' : 'On, but the AI plugin is unavailable') : 'Off'}`,
    `Active policies: **${policyCount}**`,
    `Pending flags: **${pendingCount}**`,
    `Allowed decisions: ${config.allowedDecisions.join(', ')}`,
  ];

  await c.interaction.reply({ embeds: [listEmbed(c.t('setup.statusTitle'), lines)], ephemeral: true });
}
