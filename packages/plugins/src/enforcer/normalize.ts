import type { Message } from 'discord.js';
import type { NormalizedMessage } from './engine';

// discord.gg/xxx, discord.com/invite/xxx, discordapp.com/invite/xxx (ARCHITECTURE.md §19).
const INVITE_PATTERN =
  /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)[a-z0-9-]+/gi;
const URL_PATTERN = /https?:\/\/[^\s<>()[\]]+/gi;

/** Extracts every `https?://` URL from `content`, best-effort (no validation beyond the scheme). */
function extractLinks(content: string): string[] {
  return [...content.matchAll(URL_PATTERN)].map((m) => m[0]);
}

/** Extracts every Discord invite link from `content` (ARCHITECTURE.md §19's invite detection). */
function extractInvites(content: string): string[] {
  return [...content.matchAll(INVITE_PATTERN)].map((m) => m[0]);
}

export interface NormalizeOptions {
  /** True if the author has any configured staff role, or Administrator/ManageGuild (ARCHITECTURE.md §19 `exemptStaff`). */
  isStaff: boolean;
}

/**
 * Builds a `NormalizedMessage` from a real discord.js `Message`, so `engine.evaluate` never has to touch
 * discord.js directly (ARCHITECTURE.md §19). Content-dependent fields are empty when the Message Content
 * intent isn't enabled — discord.js itself already blanks `message.content` in that case for messages not
 * authored by the bot, so this is mostly a pass-through plus mention/attachment/link extraction.
 */
export function normalizeMessage(message: Message, options: NormalizeOptions): NormalizedMessage {
  const content = message.content ?? '';
  const mentionsCount =
    message.mentions.users.size + message.mentions.roles.size + (message.mentions.everyone ? 1 : 0);

  return {
    content,
    authorId: message.author.id,
    authorRoleIds: message.member ? [...message.member.roles.cache.keys()] : [],
    channelId: message.channelId,
    mentionsCount,
    attachments: [...message.attachments.values()].map((att) => ({
      name: att.name,
      contentType: att.contentType ?? undefined,
    })),
    links: extractLinks(content),
    invites: extractInvites(content),
    isStaff: options.isStaff,
  };
}

export { extractLinks, extractInvites };
