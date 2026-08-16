import type { GuildMember, PartialGuildMember } from 'discord.js';
import { resolveTextChannel, type PluginEventHandler } from '../../sdk';
import { filterPersistableRoles, isElevatedPermissionBitfield } from '../engine';
import type { RolesConfig } from '../manifest';
import { deliverWelcomeGoodbye } from '../service';

export const memberLeaveHandler: PluginEventHandler<'guildMemberRemove'> = {
  event: 'guildMemberRemove',
  guildIdOf: (member) => member.guild.id,
  async handler(ctx, member: GuildMember | PartialGuildMember) {
    const config = await ctx.getConfig<RolesConfig>(member.guild.id);

    // --- Goodbye message -------------------------------------------------------------------------------
    if (config.goodbye.enabled) {
      const channel = config.goodbye.channelId ? await resolveTextChannel(member.guild, config.goodbye.channelId) : null;
      await deliverWelcomeGoodbye({
        ctx,
        guild: member.guild,
        channel,
        member: { id: member.id, user: { tag: member.user?.tag, username: member.user?.username ?? 'Unknown' } },
        section: config.goodbye,
        // Goodbye DMs routinely fail (the member just left and may have DMs closed) — `safeDm` inside
        // `deliverWelcomeGoodbye` already swallows that; `fetchUser` just needs to hand back something with `.send`.
        fetchUser: member.user ? async () => member.user : undefined,
      });
    }

    // --- Role persistence snapshot ----------------------------------------------------------------------
    if (config.rolePersistence.enabled && !member.partial) {
      const botTopRolePosition = member.guild.members.me?.roles.highest.position ?? 0;
      const roleIds = [...member.roles.cache.keys()];
      const elevatedOrUnsafe = new Set<string>();
      const managed = new Set<string>();
      for (const roleId of roleIds) {
        const role = member.guild.roles.cache.get(roleId);
        if (!role) continue;
        if (isElevatedPermissionBitfield(role.permissions.bitfield) || role.position >= botTopRolePosition) elevatedOrUnsafe.add(roleId);
        if (role.managed) managed.add(roleId);
      }
      const persistable = filterPersistableRoles({ roleIds, elevatedRoleIds: elevatedOrUnsafe, managedRoleIds: managed, everyoneRoleId: member.guild.roles.everyone.id });

      if (persistable.length > 0) {
        await ctx.prisma.memberRoleSnapshot.upsert({
          where: { guildId_userId: { guildId: member.guild.id, userId: member.id } },
          create: { guildId: member.guild.id, userId: member.id, roleIds: persistable, leftAt: new Date() },
          update: { roleIds: persistable, leftAt: new Date() },
        });
      }
    }
  },
};
