import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { discordTimestamp } from '@entrophy/core';
import type { PluginId } from '@entrophy/types';
import { assertStaffLevel, listEmbed, type PluginCommand } from '../../sdk';
import { createWizardSession, renderWizardStep, WizardSessionStore } from '../wizard';
import { deriveSetupState, describeMissingBotPermissions, type SetupState } from '../format';

const MISSING_LABELS = { modRoles: 'moderator/admin roles', modLogChannel: 'mod-log channel' } as const;

/** First line of `/setup status`: reflects actual config, not just whether the wizard ran. */
function formatSetupLine(
  state: SetupState,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  switch (state.kind) {
    case 'wizard':
      return t('setup.state.wizard', { when: discordTimestamp(new Date(state.completedAt), 'R') });
    case 'configured':
      return t('setup.state.configured');
    case 'incomplete':
      return t('setup.state.incomplete', { missing: state.missing.map((m) => MISSING_LABELS[m]).join(', ') });
  }
}

const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Guided server setup and setup status.')
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) => sub.setName('wizard').setDescription('Run the guided setup wizard.'))
  .addSubcommand((sub) => sub.setName('status').setDescription('Show what has been configured so far.'));

export const command: PluginCommand = {
  data,
  requirement: { staffLevel: 'admin', guildOnly: true },
  async execute(c) {
    assertStaffLevel(c.staffLevel, 'admin', c.t);
    const sub = c.interaction.options.getSubcommand(true);
    const host = c.ctx.services.require('host');

    if (sub === 'wizard') {
      const current = await host.getGuildConfig(c.guildId);
      const manifests = host.listManifests();

      const currentlyEnabled: PluginId[] = [];
      for (const manifest of manifests) {
        if (manifest.alwaysEnabled) continue;
        if (await host.isPluginEnabled(c.guildId, manifest.id)) currentlyEnabled.push(manifest.id);
      }

      const session = createWizardSession(c.guildId, c.interaction.user.id, current, currentlyEnabled);
      const store = new WizardSessionStore(c.ctx.redis);
      await store.save(session);

      const rendered = renderWizardStep(session, manifests);
      await c.interaction.reply({
        embeds: rendered.embeds,
        components: rendered.components,
        ephemeral: true,
      });
      return;
    }

    // sub === 'status'
    const config = await host.getGuildConfig(c.guildId);
    const manifests = host.listManifests();

    let enabledCount = 0;
    for (const manifest of manifests) {
      if (await host.isPluginEnabled(c.guildId, manifest.id)) enabledCount += 1;
    }

    const lines: string[] = [
      formatSetupLine(deriveSetupState(config), c.t),
      `Locale: **${config.locale}** · Timezone: **${config.timezone}**`,
      `Admin roles: ${config.adminRoleIds.length > 0 ? config.adminRoleIds.map((id) => `<@&${id}>`).join(', ') : '_None configured_'}`,
      `Moderator roles: ${config.modRoleIds.length > 0 ? config.modRoleIds.map((id) => `<@&${id}>`).join(', ') : '_None configured_'}`,
      `Helper roles: ${config.helperRoleIds.length > 0 ? config.helperRoleIds.map((id) => `<@&${id}>`).join(', ') : '_None configured_'}`,
      `Mod-log channel: ${config.modLogChannelId ? `<#${config.modLogChannelId}>` : '_Not set_'}`,
      `Staff channel: ${config.staffChannelId ? `<#${config.staffChannelId}>` : '_Not set_'}`,
      `Fast actions (skip confirmations): ${config.fastActions ? 'On' : 'Off'}`,
      `Plugins enabled: **${enabledCount}** / ${manifests.length}`,
    ];

    const permissionWarnings = describeMissingBotPermissions(c.interaction.guild, manifests);
    if (permissionWarnings.length > 0) {
      lines.push('', '⚠️ **Permission warnings**', ...permissionWarnings.map((warning) => `• ${warning}`));
    } else {
      lines.push('', '✅ No missing bot permissions detected for enabled plugins.');
    }

    await c.interaction.reply({ embeds: [listEmbed(c.t('setup.statusTitle'), lines)], ephemeral: true });
  },
};
