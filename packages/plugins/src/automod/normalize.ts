import { ChannelType, type GuildMember, type Message, type PartialMessage } from 'discord.js';
import type { NormalizedJoin, NormalizedMessage } from './engine/types';

/**
 * Builds a `NormalizedMessage` from a real discord.js `Message` (ARCHITECTURE.md §7's plugin SDK contract:
 * evaluators stay discord.js-free and unit-testable). `hasContentIntent` controls whether `content` is populated —
 * without the Message Content intent, Discord simply never sends it for messages the bot didn't author, so this
 * always yields `''` in that case regardless of what `message.content` happens to hold.
 */
export function normalizeMessage(
  message: Message | PartialMessage,
  hasContentIntent: boolean,
): NormalizedMessage {
  const channel = message.channel;
  const channelNsfw = channel && 'nsfw' in channel ? Boolean((channel as { nsfw?: boolean }).nsfw) : false;

  return {
    guildId: message.guildId ?? '',
    channelId: message.channelId,
    messageId: message.id,
    authorId: message.author?.id ?? '',
    authorBot: message.author?.bot ?? false,
    content: hasContentIntent ? (message.content ?? '') : '',
    userMentionCount: message.mentions?.users.size ?? 0,
    roleMentionCount: message.mentions?.roles.size ?? 0,
    everyoneMentioned: message.mentions?.everyone ?? false,
    attachments: message.attachments
      ? [...message.attachments.values()].map((a) => ({ filename: a.name, contentType: a.contentType }))
      : [],
    channelNsfw,
    createdAt: message.createdAt ?? new Date(),
  };
}

/** Builds a `NormalizedJoin` from a real discord.js `GuildMember` (`guildMemberAdd`). */
export function normalizeJoin(member: GuildMember): NormalizedJoin {
  return {
    guildId: member.guild.id,
    userId: member.id,
    userBot: member.user.bot,
    accountCreatedAt: member.user.createdAt,
    joinedAt: member.joinedAt ?? new Date(),
  };
}

/** True if `channelId` resolves to a real, text-capable (non-thread, non-voice) guild channel — used to skip evaluating rules in channel types where "delete"/"alert" actions don't make sense. */
export function isEvaluableChannelType(type: ChannelType | undefined): boolean {
  return (
    type !== ChannelType.GuildVoice &&
    type !== ChannelType.GuildStageVoice &&
    type !== ChannelType.GuildCategory
  );
}
