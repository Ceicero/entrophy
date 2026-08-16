import type { PluginEventHandler } from '../../sdk';
import { handleMemberJoin } from '../service';

/** `guildMemberAdd` — account-age and raid-burst evaluation (TASK: "guildMemberAdd (account age, raid windows)"). */
export const memberAddHandler: PluginEventHandler<'guildMemberAdd'> = {
  event: 'guildMemberAdd',
  guildIdOf: (member) => member.guild.id,
  async handler(ctx, member) {
    await handleMemberJoin(ctx, member);
  },
};
