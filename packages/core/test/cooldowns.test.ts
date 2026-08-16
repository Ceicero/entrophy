import RedisMock from 'ioredis-mock';
import type Redis from 'ioredis';
import { describe, expect, it } from 'vitest';
import { Cooldowns } from '../src/ratelimit';

describe('Cooldowns (memory backend)', () => {
  it('takes the cooldown once, then reports retryAfterMs until it expires', async () => {
    let now = 0;
    const cooldowns = new Cooldowns('memory', () => now);

    const first = await cooldowns.take('user-1:warn', 30);
    expect(first.ok).toBe(true);
    expect(first.retryAfterMs).toBe(0);

    const second = await cooldowns.take('user-1:warn', 30);
    expect(second.ok).toBe(false);
    expect(second.retryAfterMs).toBeGreaterThan(0);
    expect(second.retryAfterMs).toBeLessThanOrEqual(30_000);

    now += 30_001;
    const third = await cooldowns.take('user-1:warn', 30);
    expect(third.ok).toBe(true);
  });

  it('keeps separate cooldowns per key', async () => {
    const cooldowns = new Cooldowns('memory');
    const a = await cooldowns.take('a', 60);
    const b = await cooldowns.take('b', 60);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });
});

describe('Cooldowns (Redis backend via ioredis-mock)', () => {
  it('uses SET NX PX semantics: first take succeeds, immediate retake fails', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const cooldowns = new Cooldowns(redis);

    const first = await cooldowns.take('guild-1:user-1:ban', 60);
    expect(first.ok).toBe(true);

    const second = await cooldowns.take('guild-1:user-1:ban', 60);
    expect(second.ok).toBe(false);
    expect(second.retryAfterMs).toBeGreaterThan(0);
  });
});
