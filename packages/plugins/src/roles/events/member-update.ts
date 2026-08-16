import type { PluginEventHandler } from '../../sdk';
import type { RolesConfig } from '../manifest';
import { handleFullyJoined } from './member-join';

/**
 * Discord's own membership screening (`guild.features` includes `MEMBER_VERIFICATION_GATE_ENABLED`) delivers
 * `guildMemberAdd` with `member.pending === true`; that handler intentionally skips welcome/role-persistence
 * until this event reports `pending` flipping to `false` (the member finished Discord's own screening form).
 */
export const memberUpdateHandler: PluginEventHandler<'guildMemberUpdate'> = {
  event: 'guildMemberUpdate',
  guildIdOf: (_oldMember, newMember) => newMember.guild.id,
  async handler(ctx, oldMember, newMember) {
    if (!oldMember.pending || newMember.pending) return;

    const config = await ctx.getConfig<RolesConfig>(newMember.guild.id);
    await handleFullyJoined(ctx, newMember, config);
  },
};
