import type { StringSelectMenuInteraction } from 'discord.js';
import { errorEmbed, successEmbed, type ComponentHandler } from '../../sdk';
import { checkRoleAssignable, resolveGroupSelection } from '../engine';
import type { RolesConfig } from '../manifest';
import { markRolesPicked } from './panel-toggle';

/** Select-style panel: `roles:select:<panelId>` — the select's current values become the member's roles from this panel's option set (everything else in the option set is removed). */
export const panelSelectHandler: ComponentHandler = {
  action: 'select',
  kind: 'select',
  ownerOnly: false,
  async handler(c) {
    const [panelId] = c.args;
    const interaction = c.interaction as StringSelectMenuInteraction<'cached'>;

    const panel = await c.ctx.prisma.rolePanel.findFirst({
      where: { id: panelId, guildId: c.guildId, deletedAt: null },
      include: { options: true },
    });
    if (!panel) {
      await interaction.reply({ embeds: [errorEmbed('This panel no longer exists.')], ephemeral: true });
      return;
    }

    const config = await c.config<RolesConfig>();
    const guild = interaction.guild;
    await guild.roles.fetch();
    const botTopRolePosition = guild.members.me?.roles.highest.position ?? 0;

    const optionRoleIds = panel.options.map((o) => o.roleId);
    const selectedRoleIds = interaction.values;

    const skippedUnsafe: string[] = [];
    const safeSelected = selectedRoleIds.filter((roleId) => {
      const role = guild.roles.cache.get(roleId);
      if (!role) return false;
      const result = checkRoleAssignable({
        permissionsBitfield: role.permissions.bitfield,
        position: role.position,
        managed: role.managed,
        botTopRolePosition,
        allowElevatedRoles: config.allowElevatedRoles,
      });
      if (!result.ok) skippedUnsafe.push(roleId);
      return result.ok;
    });

    const member = interaction.member;
    const currentOptionRoles = optionRoleIds.filter((id) => member.roles.cache.has(id));

    let toAdd = safeSelected.filter((id) => !currentOptionRoles.includes(id));
    let toRemove = currentOptionRoles.filter((id) => !safeSelected.includes(id));

    if (panel.groupId) {
      const group = await c.ctx.prisma.roleGroup.findUnique({ where: { id: panel.groupId } });
      if (group) {
        const nextGroupRoles = [...currentOptionRoles.filter((id) => !toRemove.includes(id)), ...toAdd];
        const currentGroupRoles = group.roleIds.filter((id) => member.roles.cache.has(id));
        const resolved = resolveGroupSelection(group, nextGroupRoles, currentGroupRoles);
        toAdd = resolved.toAdd;
        toRemove = [...new Set([...toRemove, ...resolved.toRemove])];
      }
    }

    if (toRemove.length > 0) await member.roles.remove(toRemove, `Role panel: ${panel.title}`);
    if (toAdd.length > 0) await member.roles.add(toAdd, `Role panel: ${panel.title}`);

    const lines: string[] = [];
    if (toAdd.length > 0) lines.push(`Added: ${toAdd.map((id) => `<@&${id}>`).join(', ')}`);
    if (toRemove.length > 0) lines.push(`Removed: ${toRemove.map((id) => `<@&${id}>`).join(', ')}`);
    if (skippedUnsafe.length > 0) lines.push("Skipped (I can't assign these right now — ask staff).");
    if (lines.length === 0) lines.push('No changes.');

    await interaction.reply({ embeds: [successEmbed(lines.join('\n'))], ephemeral: true });
    if (toAdd.length > 0) await markRolesPicked(c);
  },
};
