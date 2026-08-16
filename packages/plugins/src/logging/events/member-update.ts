import type { GuildMember, PartialGuildMember } from 'discord.js';
import { roleMention } from '../../sdk';
import type { PluginEventHandler } from '../../sdk';

function describeTimeout(before: Date | null, after: Date | null): string | null {
  const beforeMs = before?.getTime() ?? 0;
  const afterMs = after?.getTime() ?? 0;
  if (beforeMs === afterMs) return null;
  if (!before && after) return `Timed out until <t:${Math.floor(after.getTime() / 1000)}:F>.`;
  if (before && !after) return 'Timeout removed.';
  if (before && after) return `Timeout updated to <t:${Math.floor(after.getTime() / 1000)}:F>.`;
  return null;
}

/**
 * `guildMemberUpdate` (roles/nick/timeout — ARCHITECTURE.md's logging task). `LogKind` has no dedicated
 * "member update" entry: role-assignment changes route to `'role.update'` (grouped with role-definition changes,
 * matching SPEC.md §D's single "Role changes" bullet); nickname changes route there too, as the closest existing
 * "member administrative change" bucket; timeout changes route to `'moderation.action'` since a timeout is
 * inherently a moderation action regardless of who/what set it. See `constants.ts`'s `LOG_KIND_LABELS` comment
 * for the same reasoning applied to channel/thread events.
 */
export const guildMemberUpdate: PluginEventHandler<'guildMemberUpdate'> = {
  event: 'guildMemberUpdate',
  guildIdOf: (_old, member) => member.guild.id,
  async handler(ctx, oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) {
    const logging = ctx.services.get('logging');
    if (!logging) return;

    const oldRoleIds = new Set(oldMember.roles.cache.map((role) => role.id));
    const newRoleIds = new Set(newMember.roles.cache.map((role) => role.id));
    const added = [...newRoleIds].filter((id) => !oldRoleIds.has(id));
    const removed = [...oldRoleIds].filter((id) => !newRoleIds.has(id));

    if (added.length > 0 || removed.length > 0) {
      const lines: string[] = [];
      if (added.length > 0) lines.push(`Added: ${added.map((id) => roleMention(id)).join(', ')}`);
      if (removed.length > 0) lines.push(`Removed: ${removed.map((id) => roleMention(id)).join(', ')}`);
      await logging.log(newMember.guild.id, 'role.update', {
        targetId: newMember.id,
        title: 'Member roles changed',
        description: lines.join('\n'),
      });
    }

    if (oldMember.nickname !== newMember.nickname) {
      await logging.log(newMember.guild.id, 'role.update', {
        targetId: newMember.id,
        title: 'Nickname changed',
        description: `${oldMember.nickname ?? '_(none)_'} → ${newMember.nickname ?? '_(none)_'}`,
      });
    }

    const timeoutNote = describeTimeout(
      oldMember.communicationDisabledUntil ?? null,
      newMember.communicationDisabledUntil ?? null,
    );
    if (timeoutNote) {
      await logging.log(newMember.guild.id, 'moderation.action', {
        targetId: newMember.id,
        title: 'Timeout changed',
        description: timeoutNote,
      });
    }
  },
};
