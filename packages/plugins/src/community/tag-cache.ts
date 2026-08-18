// Redis-cached list of a guild's trigger-enabled tags (spec CG-02, "fast path"). The `messageCreate`
// auto-responder reads this on every message, so the cache must be cheap to hit and empty lists must short-
// circuit without a DB round-trip. Every tag write — bot or dashboard/API — DELs the key (the API builds the same
// key via `tagTriggersCacheKey` from `./tag-schemas`).
import type Redis from 'ioredis';
import type { PluginContext } from '../sdk';
import { tagTriggersCacheKey, type TagTriggerModeValue } from './tag-schemas';

export const TAG_TRIGGERS_CACHE_TTL_SECONDS = 300;

/** The minimal per-tag shape cached for trigger matching (no content — fetched only on a match). */
export interface CachedTriggerTag {
  id: string;
  name: string;
  triggerMode: TagTriggerModeValue;
  trigger: string;
  triggerChannelIds: string[];
}

function isCachedTriggerTag(value: unknown): value is CachedTriggerTag {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.triggerMode === 'string' &&
    typeof v.trigger === 'string' &&
    Array.isArray(v.triggerChannelIds)
  );
}

/** Parses the cached JSON list, tolerating garbage (returns `null` = cache miss so the caller reloads). */
export function parseCachedTriggerTags(raw: string | null): CachedTriggerTag[] | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(isCachedTriggerTag);
  } catch {
    return null;
  }
}

/** Removes the cached trigger list for `guildId` so the next message reloads it from the database. */
export async function invalidateTagTriggerCache(redis: Redis, guildId: string): Promise<void> {
  await redis.del(tagTriggersCacheKey(guildId));
}

/** Returns the guild's trigger-enabled tags, from Redis when cached (TTL 300s), else from Prisma (then cached). */
export async function loadTriggerTags(ctx: PluginContext, guildId: string): Promise<CachedTriggerTag[]> {
  const key = tagTriggersCacheKey(guildId);
  const cached = parseCachedTriggerTags(await ctx.redis.get(key));
  if (cached !== null) return cached;

  const rows = await ctx.prisma.tag.findMany({
    // `staffOnly: false` here is a defense-in-depth filter, not the only guard — the messageCreate handler
    // (`events/tag-triggers.ts`) re-checks `!tag.staffOnly` on the full row it fetches after a match, so a
    // staff-only tag never fires as a public auto-responder even if this cache were ever seeded incorrectly.
    where: { guildId, triggerMode: { not: 'NONE' }, staffOnly: false },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, triggerMode: true, trigger: true, triggerChannelIds: true },
  });
  const list: CachedTriggerTag[] = rows
    .filter((row) => typeof row.trigger === 'string' && row.trigger.length > 0)
    .map((row) => ({
      id: row.id,
      name: row.name,
      triggerMode: row.triggerMode,
      trigger: row.trigger as string,
      triggerChannelIds: row.triggerChannelIds,
    }));

  await ctx.redis.set(key, JSON.stringify(list), 'EX', TAG_TRIGGERS_CACHE_TTL_SECONDS);
  return list;
}
