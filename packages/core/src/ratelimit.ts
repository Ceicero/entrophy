import type Redis from 'ioredis';
import { redisKey } from './redis';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

/** Common interface implemented by both the Redis-backed and in-memory rate limiters. */
export interface RateLimiterLike {
  consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
}

/** Fixed-window rate limiter backed by Redis, using `MULTI INCR` plus a conditional `PEXPIRE` on the first hit. */
export class RateLimiter implements RateLimiterLike {
  constructor(private readonly redis: Redis) {}

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const fullKey = redisKey('ratelimit', key);
    const multi = this.redis.multi();
    multi.incr(fullKey);
    const results = await multi.exec();
    if (!results) {
      throw new Error('Redis transaction failed for RateLimiter.consume');
    }
    const [incrErr, countRaw] = results[0] as [Error | null, number];
    if (incrErr) throw incrErr;
    const count = Number(countRaw);

    // Only the request that created the window sets its expiry, so concurrent increments never reset the TTL.
    if (count === 1) {
      await this.redis.pexpire(fullKey, windowMs);
    }

    const ttl = await this.redis.pttl(fullKey);
    const resetMs = ttl > 0 ? ttl : windowMs;

    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetMs,
    };
  }
}

interface MemoryWindow {
  count: number;
  resetAt: number;
}

/** In-memory fixed-window rate limiter with the same semantics as `RateLimiter`; used in tests and single-process hosts. */
export class MemoryRateLimiter implements RateLimiterLike {
  private readonly windows = new Map<string, MemoryWindow>();
  private readonly clock: () => number;

  constructor(clock: () => number = Date.now) {
    this.clock = clock;
  }

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const now = this.clock();
    let win = this.windows.get(key);
    if (!win || win.resetAt <= now) {
      win = { count: 0, resetAt: now + windowMs };
      this.windows.set(key, win);
    }
    win.count += 1;

    return {
      allowed: win.count <= limit,
      remaining: Math.max(0, limit - win.count),
      resetMs: Math.max(0, win.resetAt - now),
    };
  }
}

export interface CooldownResult {
  ok: boolean;
  retryAfterMs: number;
}

interface CooldownStore {
  setIfAbsent(key: string, ttlMs: number): Promise<boolean>;
  ttlMs(key: string): Promise<number>;
}

class RedisCooldownStore implements CooldownStore {
  constructor(private readonly redis: Redis) {}

  async setIfAbsent(key: string, ttlMs: number): Promise<boolean> {
    const result = await this.redis.set(key, '1', 'PX', ttlMs, 'NX');
    return result === 'OK';
  }

  async ttlMs(key: string): Promise<number> {
    return this.redis.pttl(key);
  }
}

class MemoryCooldownStore implements CooldownStore {
  private readonly expiryByKey = new Map<string, number>();
  private readonly clock: () => number;

  constructor(clock: () => number = Date.now) {
    this.clock = clock;
  }

  async setIfAbsent(key: string, ttlMs: number): Promise<boolean> {
    const now = this.clock();
    const existing = this.expiryByKey.get(key);
    if (existing !== undefined && existing > now) return false;
    this.expiryByKey.set(key, now + ttlMs);
    return true;
  }

  async ttlMs(key: string): Promise<number> {
    const existing = this.expiryByKey.get(key);
    if (existing === undefined) return -2;
    const remaining = existing - this.clock();
    return remaining > 0 ? remaining : -2;
  }
}

/** Simple `SET key val PX ttl NX` cooldown gate, backed by Redis or an in-memory store for tests. */
export class Cooldowns {
  private readonly store: CooldownStore;

  constructor(backend: Redis | 'memory', clock: () => number = Date.now) {
    this.store = backend === 'memory' ? new MemoryCooldownStore(clock) : new RedisCooldownStore(backend);
  }

  /** Attempts to take the cooldown for `key`; returns `{ ok: true }` if it wasn't on cooldown, else the time left. */
  async take(key: string, seconds: number): Promise<CooldownResult> {
    const fullKey = redisKey('cooldown', key);
    const ttlMs = seconds * 1000;
    const acquired = await this.store.setIfAbsent(fullKey, ttlMs);
    if (acquired) {
      return { ok: true, retryAfterMs: 0 };
    }
    const remaining = await this.store.ttlMs(fullKey);
    return { ok: false, retryAfterMs: remaining > 0 ? remaining : ttlMs };
  }
}
