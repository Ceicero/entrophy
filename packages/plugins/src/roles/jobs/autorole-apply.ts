import { fetchMemberSafe, type PluginJob } from '../../sdk';
import { selectAutoRoles } from '../engine';
import type { RolesConfig } from '../manifest';
import { AUTO_ROLE_JOB_NAME, grantAutoRoles, type AutoRoleJobData } from '../service';

/**
 * Delayed auto-role delivery (queue `roles.autorole-apply`). Scheduled by `applyAutoRoles` when
 * `config.autoRoles.delaySeconds > 0`, with jobId `autorole-<guildId>-<userId>` so a leave+rejoin inside the
 * window doesn't double-schedule. When it fires: the member must still be here and no longer `pending`, and
 * only roles that are STILL in the current config list are applied (an admin may have removed some while the
 * job waited). Every actual grant goes through `grantAutoRoles`, which re-checks assignability and audits.
 */
export const autoRoleApplyJob: PluginJob<AutoRoleJobData> = {
  name: AUTO_ROLE_JOB_NAME,
  async processor(ctx, job) {
    const { guildId, userId, roleIds } = job.data;

    const guild = await ctx.client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;

    const member = await fetchMemberSafe(guild, userId);
    if (!member) return; // Left before the delay elapsed — nothing to do, nothing stored.
    if (member.pending) return; // Still in Discord's membership screening; the join flow will re-run once they finish.

    const config = await ctx.getConfig<RolesConfig>(guildId);
    if (!config.autoRoles.enabled) return;

    const currentList = new Set(selectAutoRoles({ isBot: member.user.bot, config: config.autoRoles }));
    const stillConfigured = roleIds.filter((id) => currentList.has(id));
    if (stillConfigured.length === 0) return;

    await grantAutoRoles(ctx, member, stillConfigured, config.allowElevatedRoles);
  },
};
