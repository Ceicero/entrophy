import type { PluginEventHandler } from '../../sdk';

/** Thread events route to `LogKind` `'channel.update'` too — see `channel.ts`/`constants.ts`'s `LOG_KIND_LABELS` comment. */
export const threadCreate: PluginEventHandler<'threadCreate'> = {
  event: 'threadCreate',
  guildIdOf: (thread) => thread.guild.id,
  async handler(ctx, thread, newlyCreated) {
    if (!newlyCreated) return; // fires for threads the bot just gained visibility into, not just new ones
    const logging = ctx.services.get('logging');
    if (!logging) return;
    await logging.log(thread.guild.id, 'channel.update', {
      channelId: thread.id,
      title: 'Thread created',
      description: `${thread.toString()} (\`${thread.id}\`) was created${thread.parentId ? ` in <#${thread.parentId}>` : ''}.`,
    });
  },
};

export const threadDelete: PluginEventHandler<'threadDelete'> = {
  event: 'threadDelete',
  guildIdOf: (thread) => thread.guild.id,
  async handler(ctx, thread) {
    const logging = ctx.services.get('logging');
    if (!logging) return;
    await logging.log(thread.guild.id, 'channel.update', {
      title: 'Thread deleted',
      description: `**${thread.name}** (\`${thread.id}\`) was deleted.`,
    });
  },
};

export const threadEvents = [threadCreate, threadDelete];
