import type { MessageReaction, PartialMessageReaction, PartialUser, User } from 'discord.js';
import type { PluginEventHandler } from '../../sdk';
import { checkRoleAssignable } from '../engine';
import type { RolesConfig } from '../manifest';

/** Builds the same emoji key format `RolePanelOption.emoji` is stored in: unicode emoji as-is, custom emoji as `<:name:id>`/`<a:name:id>`. */
function emojiKeyFromReaction(reaction: MessageReaction | PartialMessageReaction): string {
  const emoji = reaction.emoji;
  if (emoji.id) {
    return `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`;
  }
  return emoji.name ?? '';
}

async function resolveReactionContext(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
): Promise<{ reaction: MessageReaction; user: User } | null> {
  try {
    const fullReaction = reaction.partial ? await reaction.fetch() : reaction;
    const fullUser = user.partial ? await user.fetch() : user;
    return { reaction: fullReaction, user: fullUser };
  } catch {
    return null;
  }
}

/** Shared reaction-role logic for both `messageReactionAdd` and `messageReactionRemove`. */
async function handleReactionRole(
  ctx: Parameters<PluginEventHandler<'messageReactionAdd'>['handler']>[0],
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
  mode: 'add' | 'remove',
): Promise<void> {
  if (user.bot) return;

  const resolved = await resolveReactionContext(reaction, user);
  if (!resolved) return;
  const guildId = resolved.reaction.message.guildId;
  if (!guildId) return;

  const panel = await ctx.prisma.rolePanel.findFirst({
    where: { guildId, messageId: resolved.reaction.message.id, style: 'REACTIONS', deletedAt: null },
    include: { options: true },
  });
  if (!panel) return;

  const emojiKey = emojiKeyFromReaction(resolved.reaction);
  const option = panel.options.find((opt) => opt.emoji === emojiKey);
  if (!option) return;

  const guild = resolved.reaction.message.guild;
  if (!guild) return;
  const member = await guild.members.fetch(resolved.user.id).catch(() => null);
  if (!member) return;

  const config = await ctx.getConfig<RolesConfig>(guildId);
  await guild.roles.fetch();
  const role = guild.roles.cache.get(option.roleId);
  if (!role) return;

  const botTopRolePosition = guild.members.me?.roles.highest.position ?? 0;
  const assignable = checkRoleAssignable({
    permissionsBitfield: role.permissions.bitfield,
    position: role.position,
    managed: role.managed,
    botTopRolePosition,
    allowElevatedRoles: config.allowElevatedRoles,
  });
  if (!assignable.ok) return;

  if (mode === 'add') {
    await member.roles.add(option.roleId, `Reaction role panel: ${panel.title}`).catch(() => undefined);
  } else {
    await member.roles.remove(option.roleId, `Reaction role panel: ${panel.title}`).catch(() => undefined);
  }
}

export const reactionAddHandler: PluginEventHandler<'messageReactionAdd'> = {
  event: 'messageReactionAdd',
  guildIdOf: (reaction) => reaction.message.guildId,
  async handler(ctx, reaction, user) {
    await handleReactionRole(ctx, reaction, user, 'add');
  },
};

export const reactionRemoveHandler: PluginEventHandler<'messageReactionRemove'> = {
  event: 'messageReactionRemove',
  guildIdOf: (reaction) => reaction.message.guildId,
  async handler(ctx, reaction, user) {
    await handleReactionRole(ctx, reaction, user, 'remove');
  },
};
