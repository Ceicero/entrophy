import type { PluginEventHandler } from '../../sdk';

/** `roleCreate`/`roleUpdate`/`roleDelete` all route to `LogKind` `'role.update'` — see `constants.ts`'s `LOG_KIND_LABELS` comment. */
export const roleCreate: PluginEventHandler<'roleCreate'> = {
  event: 'roleCreate',
  guildIdOf: (role) => role.guild.id,
  async handler(ctx, role) {
    const logging = ctx.services.get('logging');
    if (!logging) return;
    await logging.log(role.guild.id, 'role.update', {
      title: 'Role created',
      description: `${role.toString()} (\`${role.id}\`) was created.`,
    });
  },
};

export const roleUpdate: PluginEventHandler<'roleUpdate'> = {
  event: 'roleUpdate',
  guildIdOf: (_oldRole, newRole) => newRole.guild.id,
  async handler(ctx, oldRole, newRole) {
    const logging = ctx.services.get('logging');
    if (!logging) return;

    const changes: string[] = [];
    if (oldRole.name !== newRole.name) changes.push(`Name: ${oldRole.name} → ${newRole.name}`);
    if (oldRole.color !== newRole.color) changes.push(`Color: #${oldRole.color.toString(16).padStart(6, '0')} → #${newRole.color.toString(16).padStart(6, '0')}`);
    if (oldRole.hoist !== newRole.hoist) changes.push(`Hoisted: ${oldRole.hoist} → ${newRole.hoist}`);
    if (oldRole.mentionable !== newRole.mentionable) changes.push(`Mentionable: ${oldRole.mentionable} → ${newRole.mentionable}`);
    if (!oldRole.permissions.equals(newRole.permissions)) changes.push('Permissions changed');
    if (changes.length === 0) return;

    await logging.log(newRole.guild.id, 'role.update', {
      title: 'Role updated',
      description: `${newRole.toString()} (\`${newRole.id}\`)\n${changes.join('\n')}`,
    });
  },
};

export const roleDelete: PluginEventHandler<'roleDelete'> = {
  event: 'roleDelete',
  guildIdOf: (role) => role.guild.id,
  async handler(ctx, role) {
    const logging = ctx.services.get('logging');
    if (!logging) return;
    await logging.log(role.guild.id, 'role.update', {
      title: 'Role deleted',
      description: `**${role.name}** (\`${role.id}\`) was deleted.`,
    });
  },
};

export const roleEvents = [roleCreate, roleUpdate, roleDelete];
