import type { PluginEventHandler } from '../../sdk';
import { readInviteSnapshot, writeInviteSnapshot } from '../invite-cache';

/**
 * `inviteCreate`/`inviteDelete` keep the Redis invite-use cache (`invite-cache.ts`) fresh so `events/member.ts`'s
 * join-time attribution diff isn't comparing against a stale snapshot right after an invite is created/deleted.
 * These do not themselves emit `'invite.use'` log entries (that only happens on an actual join).
 */
export const inviteCreate: PluginEventHandler<'inviteCreate'> = {
  event: 'inviteCreate',
  guildIdOf: (invite) => invite.guild?.id ?? null,
  async handler(ctx, invite) {
    if (!invite.guild) return;
    const snapshot = await readInviteSnapshot(ctx.redis, invite.guild.id);
    const withoutThis = snapshot.filter((entry) => entry.code !== invite.code);
    withoutThis.push({ code: invite.code, uses: invite.uses ?? 0 });
    await writeInviteSnapshot(ctx.redis, invite.guild.id, withoutThis);
  },
};

export const inviteDelete: PluginEventHandler<'inviteDelete'> = {
  event: 'inviteDelete',
  guildIdOf: (invite) => invite.guild?.id ?? null,
  async handler(ctx, invite) {
    if (!invite.guild) return;
    const snapshot = await readInviteSnapshot(ctx.redis, invite.guild.id);
    await writeInviteSnapshot(
      ctx.redis,
      invite.guild.id,
      snapshot.filter((entry) => entry.code !== invite.code),
    );
  },
};

export const inviteEvents = [inviteCreate, inviteDelete];
