import type { PluginEventHandler } from '../../sdk';

/** `channelCreate`/`channelUpdate`/`channelDelete` (and thread events, see `thread.ts`) all route to `LogKind` `'channel.update'` — see `constants.ts`'s `LOG_KIND_LABELS` comment. DMs (which share `channelUpdate`/`channelDelete`'s type with guild channels) are skipped via `guildIdOf` returning `null`. */
export const channelCreate: PluginEventHandler<'channelCreate'> = {
  event: 'channelCreate',
  guildIdOf: (channel) => channel.guild.id,
  async handler(ctx, channel) {
    const logging = ctx.services.get('logging');
    if (!logging) return;
    await logging.log(channel.guild.id, 'channel.update', {
      channelId: channel.id,
      title: 'Channel created',
      description: `${channel.toString()} (\`${channel.id}\`) was created.`,
    });
  },
};

export const channelUpdate: PluginEventHandler<'channelUpdate'> = {
  event: 'channelUpdate',
  guildIdOf: (_oldChannel, newChannel) => ('guild' in newChannel ? newChannel.guild.id : null),
  async handler(ctx, oldChannel, newChannel) {
    if (!('guild' in newChannel) || !('guild' in oldChannel)) return;
    const logging = ctx.services.get('logging');
    if (!logging) return;

    const changes: string[] = [];
    if (oldChannel.name !== newChannel.name) changes.push(`Name: ${oldChannel.name} → ${newChannel.name}`);
    if ('topic' in oldChannel && 'topic' in newChannel && oldChannel.topic !== newChannel.topic) changes.push('Topic changed');
    if ('nsfw' in oldChannel && 'nsfw' in newChannel && oldChannel.nsfw !== newChannel.nsfw) changes.push(`NSFW: ${oldChannel.nsfw} → ${newChannel.nsfw}`);
    if (changes.length === 0) return;

    await logging.log(newChannel.guild.id, 'channel.update', {
      channelId: newChannel.id,
      title: 'Channel updated',
      description: `${newChannel.toString()}\n${changes.join('\n')}`,
    });
  },
};

export const channelDelete: PluginEventHandler<'channelDelete'> = {
  event: 'channelDelete',
  guildIdOf: (channel) => ('guild' in channel ? channel.guild.id : null),
  async handler(ctx, channel) {
    if (!('guild' in channel)) return;
    const logging = ctx.services.get('logging');
    if (!logging) return;
    await logging.log(channel.guild.id, 'channel.update', {
      title: 'Channel deleted',
      description: `**#${channel.name}** (\`${channel.id}\`) was deleted.`,
    });
  },
};

export const channelEvents = [channelCreate, channelUpdate, channelDelete];
