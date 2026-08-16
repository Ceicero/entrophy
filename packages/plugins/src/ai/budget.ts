import type Redis from 'ioredis';
import { redisKey } from '@entrophy/core';

const KEY_TTL_SECONDS = 2 * 24 * 60 * 60; // 2 days — comfortably covers the current UTC day plus clock skew.

function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10); // YYYY-MM-DD, UTC
}

function guildBudgetKey(guildId: string, now: Date): string {
  return redisKey('ai', 'budget', 'guild', guildId, dayKey(now));
}

function userBudgetKey(guildId: string, userId: string, now: Date): string {
  return redisKey('ai', 'budget', 'user', guildId, userId, dayKey(now));
}

async function readCount(redis: Redis, key: string): Promise<number> {
  const raw = await redis.get(key);
  return raw ? Number(raw) : 0;
}

export type BudgetCheckResult = { ok: true } | { ok: false; scope: 'guild' | 'user'; used: number; limit: number };

/**
 * Preemptively checks today's (UTC) usage against `dailyBudget`/`perUserBudget` before spending on a provider
 * call. Two-phase with `recordUsage`: this only checks already-recorded usage, so it can't account for the
 * request about to be made — `recordUsage` afterwards adds the real (provider-reported) token count.
 */
export async function checkBudget(
  redis: Redis,
  guildId: string,
  userId: string,
  dailyBudget: number,
  perUserBudget: number,
  now: Date = new Date(),
): Promise<BudgetCheckResult> {
  const [guildUsed, userUsed] = await Promise.all([
    readCount(redis, guildBudgetKey(guildId, now)),
    readCount(redis, userBudgetKey(guildId, userId, now)),
  ]);

  if (guildUsed >= dailyBudget) return { ok: false, scope: 'guild', used: guildUsed, limit: dailyBudget };
  if (userUsed >= perUserBudget) return { ok: false, scope: 'user', used: userUsed, limit: perUserBudget };
  return { ok: true };
}

/** Records `tokens` spent against both the guild's and the user's daily counters (UTC day of `now`). */
export async function recordUsage(redis: Redis, guildId: string, userId: string, tokens: number, now: Date = new Date()): Promise<void> {
  if (tokens <= 0) return;
  const gKey = guildBudgetKey(guildId, now);
  const uKey = userBudgetKey(guildId, userId, now);
  const multi = redis.multi();
  multi.incrby(gKey, tokens);
  multi.expire(gKey, KEY_TTL_SECONDS);
  multi.incrby(uKey, tokens);
  multi.expire(uKey, KEY_TTL_SECONDS);
  await multi.exec();
}

/** Current (UTC-day) usage totals, for display purposes (e.g. `/ai config view`). */
export async function readUsage(redis: Redis, guildId: string, userId: string, now: Date = new Date()): Promise<{ guildUsed: number; userUsed: number }> {
  const [guildUsed, userUsed] = await Promise.all([
    readCount(redis, guildBudgetKey(guildId, now)),
    readCount(redis, userBudgetKey(guildId, userId, now)),
  ]);
  return { guildUsed, userUsed };
}
