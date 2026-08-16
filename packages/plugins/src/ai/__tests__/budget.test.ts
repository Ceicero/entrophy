import RedisMock from 'ioredis-mock';
import type Redis from 'ioredis';
import { beforeEach, describe, expect, it } from 'vitest';
import { checkBudget, readUsage, recordUsage } from '../budget';

const DAY_1 = new Date('2026-01-01T12:00:00.000Z');
const DAY_2 = new Date('2026-01-02T00:00:01.000Z');

describe('ai budget', () => {
  // ioredis-mock instances share one process-wide in-memory store by default, so without this, tests that
  // record usage under the same guild/user/day keys as an earlier test would see its leftover totals.
  beforeEach(async () => {
    await new RedisMock().flushall();
  });

  it('allows spend under both the guild and per-user budget', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const result = await checkBudget(redis, 'g1', 'u1', 1000, 100, DAY_1);
    expect(result).toEqual({ ok: true });
  });

  it('records usage against both the guild and user counters', async () => {
    const redis = new RedisMock() as unknown as Redis;
    await recordUsage(redis, 'g1', 'u1', 400, DAY_1);
    const usage = await readUsage(redis, 'g1', 'u1', DAY_1);
    expect(usage).toEqual({ guildUsed: 400, userUsed: 400 });
  });

  it('accumulates usage across multiple calls on the same day', async () => {
    const redis = new RedisMock() as unknown as Redis;
    await recordUsage(redis, 'g1', 'u1', 300, DAY_1);
    await recordUsage(redis, 'g1', 'u1', 250, DAY_1);
    const usage = await readUsage(redis, 'g1', 'u1', DAY_1);
    expect(usage).toEqual({ guildUsed: 550, userUsed: 550 });
  });

  it('rejects once the per-user budget is exhausted, even if the guild budget has room', async () => {
    const redis = new RedisMock() as unknown as Redis;
    await recordUsage(redis, 'g1', 'u1', 100, DAY_1);
    const result = await checkBudget(redis, 'g1', 'u1', 10_000, 100, DAY_1);
    expect(result).toEqual({ ok: false, scope: 'user', used: 100, limit: 100 });
  });

  it('rejects once the guild budget is exhausted, even for a fresh user', async () => {
    const redis = new RedisMock() as unknown as Redis;
    await recordUsage(redis, 'g1', 'u1', 1000, DAY_1);
    const result = await checkBudget(redis, 'g1', 'u2', 1000, 500, DAY_1);
    expect(result).toEqual({ ok: false, scope: 'guild', used: 1000, limit: 1000 });
  });

  it('tracks separate guilds independently', async () => {
    const redis = new RedisMock() as unknown as Redis;
    await recordUsage(redis, 'g1', 'u1', 1000, DAY_1);
    const other = await checkBudget(redis, 'g2', 'u1', 1000, 500, DAY_1);
    expect(other).toEqual({ ok: true });
  });

  it('rolls over daily: usage recorded on one UTC day does not count against a different day', async () => {
    const redis = new RedisMock() as unknown as Redis;
    await recordUsage(redis, 'g1', 'u1', 1000, DAY_1);

    const sameDayCheck = await checkBudget(redis, 'g1', 'u1', 1000, 1000, DAY_1);
    expect(sameDayCheck).toEqual({ ok: false, scope: 'guild', used: 1000, limit: 1000 });

    const nextDayCheck = await checkBudget(redis, 'g1', 'u1', 1000, 1000, DAY_2);
    expect(nextDayCheck).toEqual({ ok: true });

    const nextDayUsage = await readUsage(redis, 'g1', 'u1', DAY_2);
    expect(nextDayUsage).toEqual({ guildUsed: 0, userUsed: 0 });
  });
});
