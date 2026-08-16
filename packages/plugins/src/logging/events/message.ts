import type { PluginContext, PluginEventHandler } from '../../sdk';

/** Content is only ever meaningful when the Message Content privileged intent is enabled; otherwise Discord never sends it and every message looks empty, so a per-event "content not captured" note is more honest than silently showing blank fields. */
function contentUnavailableNote(ctx: PluginContext): string | undefined {
  return ctx.intentsEnabled.messageContent
    ? undefined
    : 'Message content is not captured (the Message Content privileged intent is disabled for this bot).';
}

export const messageUpdate: PluginEventHandler<'messageUpdate'> = {
  event: 'messageUpdate',
  guildIdOf: (_oldMessage, newMessage) => newMessage.guild?.id ?? null,
  async handler(ctx, oldMessage, newMessage) {
    if (newMessage.author?.bot || newMessage.webhookId) return;
    const logging = ctx.services.get('logging');
    if (!logging || !newMessage.guild) return;

    const before = oldMessage.content ?? '';
    const after = newMessage.content ?? '';
    if (ctx.intentsEnabled.messageContent && before === after) return; // not a content edit (embed load, pin, etc.)

    await logging.log(newMessage.guild.id, 'message.edit', {
      actorId: newMessage.author?.id,
      channelId: newMessage.channelId,
      messageId: newMessage.id,
      description: contentUnavailableNote(ctx),
      contentBefore: before || undefined,
      contentAfter: after || undefined,
    });
  },
};

export const messageDelete: PluginEventHandler<'messageDelete'> = {
  event: 'messageDelete',
  guildIdOf: (message) => message.guild?.id ?? null,
  async handler(ctx, message) {
    if (message.author?.bot || message.webhookId) return;
    const logging = ctx.services.get('logging');
    if (!logging || !message.guild) return;

    await logging.log(message.guild.id, 'message.delete', {
      actorId: message.author?.id,
      channelId: message.channelId,
      messageId: message.id,
      description: contentUnavailableNote(ctx),
      contentBefore: message.content || undefined,
      attachments: message.attachments
        ? [...message.attachments.values()].map((attachment) => attachment.url)
        : undefined,
    });
  },
};

export const messageDeleteBulk: PluginEventHandler<'messageDeleteBulk'> = {
  event: 'messageDeleteBulk',
  guildIdOf: (_messages, channel) => channel.guild.id,
  async handler(ctx, messages, channel) {
    const logging = ctx.services.get('logging');
    if (!logging) return;

    await logging.log(channel.guild.id, 'message.delete', {
      channelId: channel.id,
      title: 'Messages bulk deleted',
      description: `${messages.size} message(s) deleted at once in #${channel.name}.`,
    });
  },
};

export const messageEvents = [messageUpdate, messageDelete, messageDeleteBulk];
