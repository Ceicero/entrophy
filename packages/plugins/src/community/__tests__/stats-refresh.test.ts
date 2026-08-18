import { beforeEach, describe, expect, it, vi } from 'vitest';
import RedisMock from 'ioredis-mock';
import type { Client } from 'discord.js';
import { createTestContext } from '../../sdk/testing';
import type { CommunityConfig } from '../manifest';
import { configSchema } from '../manifest';
import { refreshGuildStats, statsChannelRenameKey, statsLastKey, statsRefreshJob } from '../jobs/stats-refresh';

const GUILD_ID = 'guild-1';

interface FakeChannel {
  id: string;
  name: string;
  setName: ReturnType<typeof vi.fn>;
}

function fakeChannel(id: string, name: string, setNameImpl?: () => Promise<unknown>): FakeChannel {
  const ch: FakeChannel = {
    id,
    name,
    setName: vi.fn(async (next: string) => {
      if (setNameImpl) await setNameImpl();
      ch.name = next;
      return ch;
    }),
  };
  return ch;
}

function fakeGuild(channels: FakeChannel[], opts: { available?: boolean } = {}) {
  const channelMap = new Map(channels.map((c) => [c.id, c]));
  return {
    id: GUILD_ID,
    available: opts.available ?? true,
    memberCount: 42,
    members: { cache: { filter: () => ({ size: 2 }), size: 42 } },
    premiumSubscriptionCount: 1,
    roles: { cache: { size: 4 } },
    channels: { cache: { size: channels.length, get: (id: string) => channelMap.get(id) } },
  };
}

function buildCtx(guild: ReturnType<typeof fakeGuild>, cfgPatch: Partial<CommunityConfig>) {
  const cfg = configSchema.parse(cfgPatch);
  const setConfigCalls: unknown[] = [];
  const client = {
    user: { id: 'bot-1' },
    guilds: { cache: new Map([[GUILD_ID, guild]]) },
  } as unknown as Client<true>;
  const test = createTestContext({
    config: cfg,
    overrides: {
      client,
      setConfig: async <T>(_guildId: string, patch: Partial<T>) => {
        setConfigCalls.push(patch);
        return { ...cfg, ...patch } as T;
      },
    },
  });
  return { ...test, cfg, setConfigCalls };
}

describe('statsRefreshJob', () => {
  // ioredis-mock instances share one in-memory store per process; clear the gate keys between tests.
  beforeEach(async () => {
    await new RedisMock().flushall();
  });

  it('renames a channel whose name differs and leaves a matching one alone', async () => {
    const stale = fakeChannel('c1', 'Members: 0');
    const fresh = fakeChannel('c2', 'Bots: 2');
    const guild = fakeGuild([stale, fresh]);
    const { ctx } = buildCtx(guild, {
      statsChannels: [
        { channelId: 'c1', template: 'Members: {members}' },
        { channelId: 'c2', template: 'Bots: {bots}' },
      ],
    });

    await statsRefreshJob.processor(ctx, {} as never);

    expect(stale.setName).toHaveBeenCalledTimes(1);
    expect(stale.setName).toHaveBeenCalledWith('Members: 42', 'Server stats');
    expect(fresh.setName).not.toHaveBeenCalled();
  });

  it('per-guild gate blocks a second run inside the interval', async () => {
    const ch = fakeChannel('c1', 'Members: 0');
    const guild = fakeGuild([ch]);
    const { ctx, redis } = buildCtx(guild, {
      statsChannels: [{ channelId: 'c1', template: 'Members: {members}' }],
    });

    await statsRefreshJob.processor(ctx, {} as never);
    expect(ch.setName).toHaveBeenCalledTimes(1);
    expect(await redis.get(statsLastKey(GUILD_ID))).toBeTruthy();

    // Simulate the count changing; the second tick must not rename because the interval hasn't elapsed.
    guild.memberCount = 43;
    await statsRefreshJob.processor(ctx, {} as never);
    expect(ch.setName).toHaveBeenCalledTimes(1);

    // Once the gate key expires, the next tick renames again. The per-CHANNEL rename budget (A7) is a separate
    // gate — clear it too, since this test is only about the per-guild interval (see the dedicated per-channel
    // throttle test below).
    await redis.del(statsLastKey(GUILD_ID));
    await redis.del(statsChannelRenameKey(GUILD_ID, 'c1'));
    await statsRefreshJob.processor(ctx, {} as never);
    expect(ch.setName).toHaveBeenCalledTimes(2);
    expect(ch.name).toBe('Members: 43');
  });

  it('skips an unavailable guild (regional outage) and leaves its stats-channel config untouched', async () => {
    const ch = fakeChannel('c1', 'Members: 0');
    const guild = fakeGuild([ch], { available: false });
    const { ctx, setConfigCalls } = buildCtx(guild, {
      statsChannels: [
        { channelId: 'c1', template: 'Members: {members}' },
        { channelId: 'gone', template: 'Boosts: {boosts}' },
      ],
    });

    await statsRefreshJob.processor(ctx, {} as never);

    expect(ch.setName).not.toHaveBeenCalled();
    // Without the availability check an unavailable guild's empty channel cache would make every configured
    // channel look deleted, wiping "gone" AND "c1" out of config.
    expect(setConfigCalls).toHaveLength(0);
  });

  it('throttles a channel’s renames per CHANNEL (Redis NX/EX), independent of the per-guild refresh gate', async () => {
    const ch = fakeChannel('c1', 'Members: 0');
    const guild = fakeGuild([ch]);
    const { ctx, cfg } = buildCtx(guild, {
      statsChannels: [{ channelId: 'c1', template: 'Members: {members}' }],
    });

    // Two direct calls to refreshGuildStats (bypassing the per-guild `statsLastKey` gate entirely) simulate the
    // periodic job landing right next to a manual `/statschannel refresh` — the per-CHANNEL budget must still
    // hold even though each call's own guild-level gate would otherwise allow it.
    const first = await refreshGuildStats(ctx, guild as never, cfg);
    expect(first.renamed).toBe(1);
    expect(ch.setName).toHaveBeenCalledTimes(1);

    guild.memberCount = 99; // the rendered name would differ again
    const second = await refreshGuildStats(ctx, guild as never, cfg);
    expect(second.renamed).toBe(0);
    expect(second.unchanged).toBe(1);
    expect(ch.setName).toHaveBeenCalledTimes(1); // blocked by the per-channel budget, not called again
  });

  it('drops a missing channel from config without crashing', async () => {
    const ch = fakeChannel('c1', 'Members: 42');
    const guild = fakeGuild([ch]);
    const { ctx, setConfigCalls } = buildCtx(guild, {
      statsChannels: [
        { channelId: 'c1', template: 'Members: {members}' },
        { channelId: 'gone', template: 'Boosts: {boosts}' },
      ],
    });

    await statsRefreshJob.processor(ctx, {} as never);

    expect(setConfigCalls).toHaveLength(1);
    expect(setConfigCalls[0]).toEqual({
      statsChannels: [{ channelId: 'c1', template: 'Members: {members}' }],
    });
  });

  it('skips guilds where the plugin is disabled or no stats channels are configured', async () => {
    const ch = fakeChannel('c1', 'Members: 0');
    const guild = fakeGuild([ch]);
    const none = buildCtx(guild, { statsChannels: [] });
    await statsRefreshJob.processor(none.ctx, {} as never);
    expect(ch.setName).not.toHaveBeenCalled();

    const disabled = createTestContext({
      enabled: false,
      config: configSchema.parse({ statsChannels: [{ channelId: 'c1', template: 'Members: {members}' }] }),
      overrides: {
        client: {
          user: { id: 'bot-1' },
          guilds: { cache: new Map([[GUILD_ID, guild]]) },
        } as unknown as Client<true>,
      },
    });
    await statsRefreshJob.processor(disabled.ctx, {} as never);
    expect(ch.setName).not.toHaveBeenCalled();
  });

  it('never throws when a rename fails (50013 → missingPermission flag, other errors → skipped)', async () => {
    const noPerm = fakeChannel('c1', 'Members: 0', async () => {
      throw Object.assign(new Error('Missing Permissions'), { code: 50013 });
    });
    const flaky = fakeChannel('c2', 'Bots: 0', async () => {
      throw new Error('boom');
    });
    const guild = fakeGuild([noPerm, flaky]);
    const { ctx, cfg } = buildCtx(guild, {
      statsChannels: [
        { channelId: 'c1', template: 'Members: {members}' },
        { channelId: 'c2', template: 'Bots: {bots}' },
      ],
    });

    const result = await refreshGuildStats(ctx, guild as never, cfg);
    expect(result.missingPermission).toBe(true);
    expect(result.renamed).toBe(0);
    expect(result.unchanged).toBe(0);
    await expect(statsRefreshJob.processor(ctx, {} as never)).resolves.toBeUndefined();
  });

  it('declares the 5-minute repeat and concurrency 1', () => {
    expect(statsRefreshJob.name).toBe('stats-refresh');
    expect(statsRefreshJob.repeat).toEqual({ pattern: '*/5 * * * *' });
    expect(statsRefreshJob.concurrency).toBe(1);
  });
});
