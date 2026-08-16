import { assertStaffLevel, infoEmbed, successEmbed, type CommandContext } from '../../sdk';
import { isRuleTypeActive } from '../engine';
import type { AutomodConfig } from '../manifest';

/** `/automod status` — dry-run state, rule counts (active/inactive by intent), recent event volume. */
export async function handleStatus(c: CommandContext): Promise<void> {
  const config = await c.config<AutomodConfig>();
  const rules = await c.ctx.prisma.automodRule.findMany({ where: { guildId: c.guildId, deletedAt: null } });
  const enabledRules = rules.filter((r) => r.enabled);
  const inactiveRules = enabledRules.filter((r) => !isRuleTypeActive(r.type, c.ctx.intentsEnabled));

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [eventsLast24h, pendingReview] = await Promise.all([
    c.ctx.prisma.automodEvent.count({ where: { guildId: c.guildId, createdAt: { gte: since } } }),
    c.ctx.prisma.automodEvent.count({ where: { guildId: c.guildId, reviewStatus: { in: ['NONE', 'PENDING'] } } }),
  ]);

  const lines = [
    `Guild-wide dry-run: ${config.dryRun ? '🧪 **On** (no real actions are taken)' : '🟢 **Off** (actions are live)'}`,
    `Rules: ${rules.length} total, ${enabledRules.length} enabled${inactiveRules.length > 0 ? `, ${inactiveRules.length} inactive (missing intent)` : ''}`,
    `Alert channel: ${config.alertChannelId ? `<#${config.alertChannelId}>` : '_not set_'}`,
    `Quarantine role: ${config.quarantineRoleId ? `<@&${config.quarantineRoleId}>` : '_not set_'}`,
    `Raid lockdown: ${config.raidLockdown}${config.raidLockdown !== 'none' ? ` (${config.raidLockdownMinutes}m)` : ''}`,
    `Events in the last 24h: ${eventsLast24h}`,
    `Pending review: ${pendingReview}`,
  ];

  if (inactiveRules.length > 0) {
    lines.push('', `Inactive: ${inactiveRules.map((r) => `**${r.name}**`).join(', ')} — enable the required privileged intent to activate them.`);
  }

  await c.interaction.reply({ embeds: [infoEmbed(c.t('automod.status.title'), lines.join('\n'))], ephemeral: true });
}

/** `/automod dryrun on|off` — guild-wide dry-run toggle (admin only; TASK: "dryrun <on|off> (guild-wide, admin)"). */
export async function handleDryrun(c: CommandContext): Promise<void> {
  assertStaffLevel(c.staffLevel, 'admin', c.t);
  const on = c.interaction.options.getString('state', true) === 'on';

  // `ctx.setConfig` (GuildConfigStore.setConfig) already writes the audit entry (before/after diff, redacted).
  const after = await c.ctx.setConfig<AutomodConfig>(c.guildId, { dryRun: on }, { id: c.interaction.user.id, source: 'bot' });

  await c.interaction.reply({
    embeds: [successEmbed(after.dryRun ? c.t('automod.dryrun.enabled') : c.t('automod.dryrun.disabled'))],
    ephemeral: true,
  });
}
