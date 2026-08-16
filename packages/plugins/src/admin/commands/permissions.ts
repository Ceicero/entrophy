import { PermissionFlagsBits, PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import { describePermission } from '@entrophy/core';
import { assertStaffLevel, brandEmbed, type PluginCommand } from '../../sdk';

const data = new SlashCommandBuilder()
  .setName('permissions')
  .setDescription('Audit bot permissions and configuration health.')
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) => sub.setName('audit').setDescription('Run a permissions and configuration audit.'));

export const command: PluginCommand = {
  data,
  requirement: { staffLevel: 'admin', guildOnly: true },
  async execute(c) {
    assertStaffLevel(c.staffLevel, 'admin', c.t);
    const host = c.ctx.services.require('host');
    const manifests = host.listManifests();
    const guildConfig = await host.getGuildConfig(c.guildId);
    const guild = c.interaction.guild;
    const botMember = guild.members.me;

    const permissionLines: string[] = [];
    const have = botMember?.permissions.bitfield ?? 0n;
    if (!botMember) {
      permissionLines.push("❌ I couldn't read my own member/permissions in this server.");
    }
    for (const manifest of manifests) {
      if (manifest.permissions.length === 0) continue;
      const enabled = manifest.alwaysEnabled ? true : await host.isPluginEnabled(c.guildId, manifest.id);
      if (!enabled) continue;
      for (const doc of manifest.permissions) {
        const bit = PermissionsBitField.resolve(doc.permission);
        if ((have & bit) === bit) continue;
        const requirement = doc.optional ? 'optional' : 'required';
        permissionLines.push(`❌ **${manifest.name}** — missing **${describePermission(bit)}** (${requirement}) for ${doc.feature}. ${doc.fallback}`);
      }
    }
    if (permissionLines.length === 0) permissionLines.push(c.t('permissions.noMissingPermissions'));

    const hierarchyLines: string[] = [];
    if (botMember) {
      const staffRoleIds = [...new Set([...guildConfig.adminRoleIds, ...guildConfig.modRoleIds, ...guildConfig.helperRoleIds])];
      for (const roleId of staffRoleIds) {
        const role = guild.roles.cache.get(roleId);
        if (role && role.position >= botMember.roles.highest.position) {
          hierarchyLines.push(`⚠️ My highest role is at or below <@&${roleId}> — I may not be able to moderate members with that role.`);
        }
      }
    }
    if (hierarchyLines.length === 0) hierarchyLines.push(c.t('permissions.hierarchyOk'));

    const intentLines: string[] = [];
    for (const manifest of manifests) {
      if (!manifest.privilegedIntents || manifest.privilegedIntents.length === 0) continue;
      const enabled = manifest.alwaysEnabled ? true : await host.isPluginEnabled(c.guildId, manifest.id);
      if (!enabled) continue;
      for (const intent of manifest.privilegedIntents) {
        const key = intent === 'MessageContent' ? 'messageContent' : intent === 'GuildMembers' ? 'guildMembers' : 'guildPresences';
        if (!c.ctx.intentsEnabled[key]) {
          intentLines.push(`⚠️ **${manifest.name}** needs the ${intent} privileged intent, which isn't enabled — related features are degraded.`);
        }
      }
    }
    if (intentLines.length === 0) intentLines.push(c.t('permissions.intentsOk'));

    const embed = brandEmbed()
      .setTitle(c.t('permissions.auditTitle'))
      .addFields(
        { name: c.t('permissions.botPermissionsField'), value: permissionLines.join('\n').slice(0, 1024) },
        { name: c.t('permissions.roleHierarchyField'), value: hierarchyLines.join('\n').slice(0, 1024) },
        { name: c.t('permissions.privilegedIntentsField'), value: intentLines.join('\n').slice(0, 1024) },
      );

    await c.interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
