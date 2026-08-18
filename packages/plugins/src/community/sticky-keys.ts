// Pure helpers shared by the bot-side sticky service (`./sticky.ts`) and the API (`apps/api/src/routes/community.ts`),
// which must invalidate the same Redis cache when a sticky is deleted from the dashboard. Kept free of discord.js
// so the API can import it cheaply.
import { redisKey } from '@entrophy/core';

/** Seconds the per-guild "channels that have a sticky" set stays cached in Redis. */
export const STICKY_CHANNELS_TTL_SECONDS = 300;

/** Redis key holding a JSON array of channel ids that have a sticky in `guildId` (lazily filled, DEL'd on every write). */
export function stickyChannelsKey(guildId: string): string {
  return redisKey('community', 'sticky-channels', guildId);
}

/** Redis key for the per-channel re-post cooldown (`SET NX EX <cooldownSeconds>`). */
export function stickyCooldownKey(guildId: string, channelId: string): string {
  return redisKey('community', 'sticky-cd', guildId, channelId);
}

/** BullMQ jobId for the single debounced catch-up re-post per channel. Dash-separated for consistency with the
 * rest of the community/roles plugins' custom job ids (see `birthdayRoleRemoveJobId` for why `:` is avoided). */
export function stickyRepostJobId(guildId: string, channelId: string): string {
  return `sticky-${guildId}-${channelId}`;
}

/** The sticky's optional embed — the same flat shape as `/embed builder`'s `EmbedBuilderPayload`. */
export interface StickyEmbed {
  title?: string;
  description?: string;
  colorHex?: string;
  imageUrl?: string;
  footer?: string;
}

/** Normalises the `StickyMessage.embed` Json column into a `StickyEmbed`, dropping anything that isn't a string field. */
export function parseStickyEmbed(raw: unknown): StickyEmbed | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const pick = (key: keyof StickyEmbed): string | undefined =>
    typeof obj[key] === 'string' && (obj[key] as string).trim() ? (obj[key] as string) : undefined;
  const embed: StickyEmbed = {
    title: pick('title'),
    description: pick('description'),
    colorHex: pick('colorHex'),
    imageUrl: pick('imageUrl'),
    footer: pick('footer'),
  };
  return isStickyEmbedEmpty(embed) ? null : embed;
}

/** True when the embed has nothing visible to render (a bare color is not enough). */
export function isStickyEmbedEmpty(embed: StickyEmbed | null | undefined): boolean {
  if (!embed) return true;
  return !embed.title && !embed.description && !embed.imageUrl && !embed.footer;
}

/** Short one-line preview of a sticky for lists (bot `/sticky list` and the dashboard table). */
export function stickyPreview(sticky: { content: string | null; embed: unknown }, maxChars = 40): string {
  const embed = parseStickyEmbed(sticky.embed);
  const source = sticky.content?.trim() || embed?.title || embed?.description || '';
  const oneLine = source.replace(/\s+/g, ' ').trim();
  if (!oneLine) return embed?.imageUrl ? '(image embed)' : '(empty)';
  return oneLine.length > maxChars ? `${oneLine.slice(0, maxChars)}…` : oneLine;
}
