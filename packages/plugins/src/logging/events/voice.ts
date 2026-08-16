import type { PluginEventHandler } from '../../sdk';

export const voiceStateUpdate: PluginEventHandler<'voiceStateUpdate'> = {
  event: 'voiceStateUpdate',
  guildIdOf: (_oldState, newState) => newState.guild.id,
  async handler(ctx, oldState, newState) {
    const logging = ctx.services.get('logging');
    if (!logging) return;

    const userId = newState.id;
    const before = oldState.channelId;
    const after = newState.channelId;
    if (before === after) return; // mute/deafen/streaming-only changes — not a join/leave/move

    if (!before && after) {
      await logging.log(newState.guild.id, 'voice.join', {
        targetId: userId,
        channelId: after,
        description: `Joined <#${after}>.`,
      });
      return;
    }

    if (before && !after) {
      await logging.log(newState.guild.id, 'voice.leave', {
        targetId: userId,
        channelId: before,
        description: `Left <#${before}>.`,
      });
      return;
    }

    if (before && after) {
      await logging.log(newState.guild.id, 'voice.join', {
        targetId: userId,
        channelId: after,
        title: 'Switched voice channel',
        description: `Moved from <#${before}> to <#${after}>.`,
      });
    }
  },
};
