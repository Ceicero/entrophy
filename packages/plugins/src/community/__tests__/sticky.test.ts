import { ChannelType, type Guild } from 'discord.js';
import type { Queue } from 'bullmq';
import RedisMock from 'ioredis-mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestContext, type TestContextOverrides } from '../../sdk/testing';
import { stickyMessageCreateHandler } from '../events/sticky';
import { stickyRepostJob } from '../jobs/sticky-repost';
import {
  StickyError,
  getStickyChannelIds,
  removeSticky,
  stickyChannelsKey,
  stickyCooldownKey,
  stickyPayload,
  stickyRepostJobId,
  upsertSticky,
} from '../sticky';
import { parseStickyEmbed, stickyPreview } from '../sticky-keys';

type HandlerMessage = Parameters<typeof stickyMessageCreateHandler.handler>[1];

const GUILD_ID = '100000000000000001';
const CHANNEL_ID = '200000000000000001';
const BOT_ID = '300000000000000001';
const MEMBER_ID = '300000000000000002';

function fakeChannel(overrides: Record<string, unknown> = {}) {
  return {
    id: CHANNEL_ID,
    type: ChannelType.GuildText,
    lastMessageId: null as string | null,
    isTextBased: () => true,
    permissionsFor: () => ({ has: () => true }),
    send: vi.fn(async () => ({ id: 'new-sticky-msg' })),
    messages: { delete: vi.fn(async () => undefined) },
    ...overrides,
  };
}

function fakeGuild(channel: ReturnType<typeof fakeChannel> | null): Guild {
  return {
    id: GUILD_ID,
    members: { me: {} },
    channels: {
      fetch: vi.fn(async (id: string) => (channel && id === channel.id ? channel : null)),
    },
  } as unknown as Guild;
}

function fakeMessage(input: {
  authorId: string;
  guild: Guild;
  channelId?: string;
  system?: boolean;
}): HandlerMessage {
  return {
    guildId: GUILD_ID,
    channelId: input.channelId ?? CHANNEL_ID,
    guild: input.guild,
    author: { id: input.authorId, bot: input.authorId === BOT_ID },
    system: input.system ?? false,
    inGuild: () => true,
  } as unknown as HandlerMessage;
}

const stickyRow = {
  id: 'sticky1',
  guildId: GUILD_ID,
  channelId: CHANNEL_ID,
  content: 'Post LFG requests here',
  embed: null,
  cooldownSeconds: 10,
  lastMessageId: 'old-sticky-msg',
  lastPostedAt: new Date('2026-01-01T00:00:00Z'),
  createdBy: MEMBER_ID,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

// ioredis-mock instances share one in-memory store, so wipe it between tests (same as engagement/service.test.ts).
beforeEach(async () => {
  await new RedisMock().flushall();
});

/** Builds a test context with a fake gateway client (bot user + guild lookup) and a recording queue. */
function buildCtx(guild: Guild, overrides: TestContextOverrides = {}) {
  const queueAdd = vi.fn(async () => undefined);
  const queueNames: string[] = [];
  const built = createTestContext({
    config: { sticky: { enabled: true, maxPerGuild: 25, defaultCooldownSeconds: 10 } },
    ...overrides,
    overrides: {
      client: {
        user: { id: BOT_ID },
        guilds: { fetch: async (id: string) => (id === GUILD_ID ? guild : null) },
      } as never,
      queue: (name: string) => {
        queueNames.push(name);
        return { add: queueAdd } as unknown as Queue;
      },
      ...overrides.overrides,
    },
  });
  return { ...built, queueAdd, queueNames };
}

describe('sticky messageCreate handler', () => {
  it("ignores the bot's own messages without touching Redis or Prisma", async () => {
    const channel = fakeChannel();
    const guild = fakeGuild(channel);
    const { ctx, prismaCalls } = buildCtx(guild, {
      prismaOverrides: { stickyMessage: { findMany: async () => [{ channelId: CHANNEL_ID }] } },
    });

    await stickyMessageCreateHandler.handler(ctx, fakeMessage({ authorId: BOT_ID, guild }));

    expect(prismaCalls).toHaveLength(0);
    expect(channel.send).not.toHaveBeenCalled();
  });

  it('ignores channels that are not in the cached sticky-channel set (no Prisma calls)', async () => {
    const channel = fakeChannel();
    const guild = fakeGuild(channel);
    const { ctx, prismaCalls, redis } = buildCtx(guild);
    await redis.set(stickyChannelsKey(GUILD_ID), JSON.stringify(['999999999999999999']));

    await stickyMessageCreateHandler.handler(ctx, fakeMessage({ authorId: MEMBER_ID, guild }));

    expect(prismaCalls).toHaveLength(0);
    expect(channel.send).not.toHaveBeenCalled();
  });

  it('first member message → deletes the old sticky, sends exactly one new one, records the new message id', async () => {
    const channel = fakeChannel();
    const guild = fakeGuild(channel);
    const updates: unknown[] = [];
    const { ctx, prismaCalls } = buildCtx(guild, {
      prismaOverrides: {
        stickyMessage: {
          findMany: async () => [{ channelId: CHANNEL_ID }],
          findUnique: async () => stickyRow,
          update: async (args: unknown) => {
            updates.push(args);
            return { ...stickyRow, lastMessageId: 'new-sticky-msg' };
          },
        },
      },
    });

    await stickyMessageCreateHandler.handler(ctx, fakeMessage({ authorId: MEMBER_ID, guild }));

    expect(channel.messages.delete).toHaveBeenCalledWith('old-sticky-msg');
    expect(channel.send).toHaveBeenCalledTimes(1);
    const payload = (channel.send as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      content?: string;
      allowedMentions: { parse: string[] };
    };
    expect(payload.content).toBe('Post LFG requests here');
    expect(payload.allowedMentions.parse).toEqual([]);
    expect(updates).toHaveLength(1);
    expect((updates[0] as { data: { lastMessageId: string } }).data.lastMessageId).toBe('new-sticky-msg');
    // Cache was filled lazily from Prisma exactly once.
    expect(prismaCalls.filter((c) => c.model === 'stickyMessage' && c.method === 'findMany')).toHaveLength(1);
  });

  it('second message inside the cooldown → no send; one debounced catch-up job is queued instead', async () => {
    const channel = fakeChannel();
    const guild = fakeGuild(channel);
    const { ctx, queueAdd, queueNames } = buildCtx(guild, {
      prismaOverrides: {
        stickyMessage: {
          findMany: async () => [{ channelId: CHANNEL_ID }],
          findUnique: async () => stickyRow,
          update: async () => ({ ...stickyRow, lastMessageId: 'new-sticky-msg' }),
        },
      },
    });

    await stickyMessageCreateHandler.handler(ctx, fakeMessage({ authorId: MEMBER_ID, guild }));
    await stickyMessageCreateHandler.handler(ctx, fakeMessage({ authorId: MEMBER_ID, guild }));
    await stickyMessageCreateHandler.handler(ctx, fakeMessage({ authorId: MEMBER_ID, guild }));

    expect(channel.send).toHaveBeenCalledTimes(1);
    expect(queueNames.every((n) => n === 'sticky-repost')).toBe(true);
    expect(queueAdd).toHaveBeenCalledTimes(2);
    const [name, data, opts] = (queueAdd as ReturnType<typeof vi.fn>).mock.calls[0] as unknown as [
      string,
      { guildId: string; channelId: string },
      { jobId: string; delay: number; removeOnComplete: boolean; removeOnFail: boolean },
    ];
    expect(name).toBe('sticky-repost');
    expect(data).toEqual({ guildId: GUILD_ID, channelId: CHANNEL_ID });
    expect(opts.jobId).toBe(stickyRepostJobId(GUILD_ID, CHANNEL_ID));
    expect(opts.delay).toBe(10_000);
    expect(opts.removeOnComplete).toBe(true);
    expect(opts.removeOnFail).toBe(true);
  });

  it('does nothing when the sticky feature is disabled in config', async () => {
    const channel = fakeChannel();
    const guild = fakeGuild(channel);
    const { ctx } = buildCtx(guild, {
      config: { sticky: { enabled: false, maxPerGuild: 25, defaultCooldownSeconds: 10 } },
      prismaOverrides: {
        stickyMessage: {
          findMany: async () => [{ channelId: CHANNEL_ID }],
          findUnique: async () => stickyRow,
        },
      },
    });

    await stickyMessageCreateHandler.handler(ctx, fakeMessage({ authorId: MEMBER_ID, guild }));
    expect(channel.send).not.toHaveBeenCalled();
  });
});

describe('sticky-repost catch-up job', () => {
  it('re-posts when the sticky is no longer the newest message and re-arms the cooldown', async () => {
    const channel = fakeChannel({ lastMessageId: 'some-member-msg' });
    const guild = fakeGuild(channel);
    const { ctx, redis } = buildCtx(guild, {
      prismaOverrides: {
        stickyMessage: {
          findUnique: async () => stickyRow,
          update: async () => ({ ...stickyRow, lastMessageId: 'new-sticky-msg' }),
        },
      },
    });

    await stickyRepostJob.processor(ctx, { data: { guildId: GUILD_ID, channelId: CHANNEL_ID } } as never);

    expect(channel.messages.delete).toHaveBeenCalledWith('old-sticky-msg');
    expect(channel.send).toHaveBeenCalledTimes(1);
    expect(await redis.get(stickyCooldownKey(GUILD_ID, CHANNEL_ID))).toBe('1');
  });

  it('skips the re-post when the sticky is already at the bottom of the channel', async () => {
    const channel = fakeChannel({ lastMessageId: 'old-sticky-msg' });
    const guild = fakeGuild(channel);
    const { ctx } = buildCtx(guild, {
      prismaOverrides: { stickyMessage: { findUnique: async () => stickyRow } },
    });

    await stickyRepostJob.processor(ctx, { data: { guildId: GUILD_ID, channelId: CHANNEL_ID } } as never);

    expect(channel.send).not.toHaveBeenCalled();
    expect(channel.messages.delete).not.toHaveBeenCalled();
  });
});

describe('upsertSticky', () => {
  it('rejects when both content and embed are empty', async () => {
    const channel = fakeChannel();
    const guild = fakeGuild(channel);
    const { ctx, prismaCalls } = buildCtx(guild);

    await expect(
      upsertSticky(ctx, {
        guild,
        guildId: GUILD_ID,
        channelId: CHANNEL_ID,
        content: '   ',
        embed: { title: '', description: '' },
        cooldownSeconds: 10,
        actorId: MEMBER_ID,
      }),
    ).rejects.toMatchObject({ code: 'empty' });
    expect(prismaCalls.filter((c) => c.method === 'upsert')).toHaveLength(0);
    expect(channel.send).not.toHaveBeenCalled();
  });

  it('enforces sticky.maxPerGuild for new channels', async () => {
    const channel = fakeChannel();
    const guild = fakeGuild(channel);
    const { ctx } = buildCtx(guild, {
      config: { sticky: { enabled: true, maxPerGuild: 2, defaultCooldownSeconds: 10 } },
      prismaOverrides: { stickyMessage: { findUnique: async () => null, count: async () => 2 } },
    });

    let thrown: unknown;
    try {
      await upsertSticky(ctx, {
        guild,
        guildId: GUILD_ID,
        channelId: CHANNEL_ID,
        content: 'hello',
        cooldownSeconds: 10,
        actorId: MEMBER_ID,
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(StickyError);
    expect((thrown as StickyError).code).toBe('limit');
    expect((thrown as StickyError).vars).toEqual({ max: 2 });
    expect(channel.send).not.toHaveBeenCalled();
  });

  it('upserts the row, invalidates the channel cache, posts immediately, and audits', async () => {
    const channel = fakeChannel();
    const guild = fakeGuild(channel);
    const audits: unknown[] = [];
    const upserts: unknown[] = [];
    const { ctx, redis } = buildCtx(guild, {
      prismaOverrides: {
        stickyMessage: {
          findUnique: async () => null,
          count: async () => 0,
          upsert: async (args: unknown) => {
            upserts.push(args);
            return { ...stickyRow, lastMessageId: null, lastPostedAt: null };
          },
          update: async () => ({ ...stickyRow, lastMessageId: 'new-sticky-msg' }),
        },
      },
      overrides: {
        audit: async (entry) => {
          audits.push(entry);
        },
      },
    });
    await redis.set(stickyChannelsKey(GUILD_ID), JSON.stringify([]));

    const result = await upsertSticky(ctx, {
      guild,
      guildId: GUILD_ID,
      channelId: CHANNEL_ID,
      content: 'Post LFG requests here',
      embed: { title: 'LFG rules', colorHex: '#5865F2' },
      cooldownSeconds: 15,
      actorId: MEMBER_ID,
    });

    expect(upserts).toHaveLength(1);
    const upsertArgs = upserts[0] as {
      create: {
        guildId: string;
        channelId: string;
        createdBy: string;
        cooldownSeconds: number;
        embed: unknown;
      };
    };
    expect(upsertArgs.create).toMatchObject({
      guildId: GUILD_ID,
      channelId: CHANNEL_ID,
      createdBy: MEMBER_ID,
      cooldownSeconds: 15,
      embed: { title: 'LFG rules', colorHex: '#5865F2' },
    });
    expect(await redis.get(stickyChannelsKey(GUILD_ID))).toBeNull();
    expect(channel.send).toHaveBeenCalledTimes(1);
    expect(result.lastMessageId).toBe('new-sticky-msg');
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: 'community.sticky.set', actorId: MEMBER_ID, source: 'bot' });
    // Cooldown is armed so the very next member message doesn't immediately re-post again.
    expect(await redis.get(stickyCooldownKey(GUILD_ID, CHANNEL_ID))).toBe('1');
  });

  it('rejects when the bot cannot post in the channel', async () => {
    const guild = fakeGuild(null);
    const { ctx } = buildCtx(guild, {
      prismaOverrides: { stickyMessage: { findUnique: async () => null, count: async () => 0 } },
    });
    await expect(
      upsertSticky(ctx, {
        guild,
        guildId: GUILD_ID,
        channelId: CHANNEL_ID,
        content: 'hi',
        cooldownSeconds: 10,
        actorId: MEMBER_ID,
      }),
    ).rejects.toMatchObject({ code: 'badChannel' });
  });
});

describe('removeSticky', () => {
  it('deletes the row, the last posted copy, the cache, and audits', async () => {
    const channel = fakeChannel();
    const guild = fakeGuild(channel);
    const audits: unknown[] = [];
    const { ctx, redis, prismaCalls } = buildCtx(guild, {
      prismaOverrides: {
        stickyMessage: { findUnique: async () => stickyRow, delete: async () => stickyRow },
      },
      overrides: {
        audit: async (entry) => {
          audits.push(entry);
        },
      },
    });
    await redis.set(stickyChannelsKey(GUILD_ID), JSON.stringify([CHANNEL_ID]));

    expect(await removeSticky(ctx, GUILD_ID, CHANNEL_ID, MEMBER_ID)).toBe(true);

    expect(prismaCalls.some((c) => c.model === 'stickyMessage' && c.method === 'delete')).toBe(true);
    expect(channel.messages.delete).toHaveBeenCalledWith('old-sticky-msg');
    expect(await redis.get(stickyChannelsKey(GUILD_ID))).toBeNull();
    expect(audits[0]).toMatchObject({ action: 'community.sticky.remove', targetId: 'sticky1' });
  });

  it('resolves false when there is no sticky for the channel', async () => {
    const guild = fakeGuild(fakeChannel());
    const { ctx } = buildCtx(guild);
    expect(await removeSticky(ctx, GUILD_ID, CHANNEL_ID, MEMBER_ID)).toBe(false);
  });
});

describe('getStickyChannelIds', () => {
  it('fills the cache from Prisma once, then serves from Redis', async () => {
    const guild = fakeGuild(fakeChannel());
    const { ctx, prismaCalls } = buildCtx(guild, {
      prismaOverrides: { stickyMessage: { findMany: async () => [{ channelId: 'a' }, { channelId: 'b' }] } },
    });
    expect(await getStickyChannelIds(ctx, GUILD_ID)).toEqual(['a', 'b']);
    expect(await getStickyChannelIds(ctx, GUILD_ID)).toEqual(['a', 'b']);
    expect(prismaCalls.filter((c) => c.method === 'findMany')).toHaveLength(1);
  });
});

describe('stickyPayload', () => {
  it('always suppresses mentions', () => {
    expect(stickyPayload({ content: '@everyone hi', embed: null }).allowedMentions.parse).toEqual([]);
    expect(stickyPayload({ content: null, embed: { title: 'T' } }).allowedMentions.parse).toEqual([]);
    expect(stickyPayload({ content: null, embed: null }).allowedMentions.parse).toEqual([]);
  });

  it('includes content and/or an embed only when present', () => {
    const textOnly = stickyPayload({ content: 'hello', embed: null });
    expect(textOnly.content).toBe('hello');
    expect(textOnly.embeds).toBeUndefined();

    const embedOnly = stickyPayload({ content: null, embed: { title: 'Rules', colorHex: '#ff0000' } });
    expect(embedOnly.content).toBeUndefined();
    expect(embedOnly.embeds).toHaveLength(1);
    expect(embedOnly.embeds![0]!.toJSON()).toMatchObject({ title: 'Rules', color: 0xff0000 });
  });
});

describe('sticky-keys helpers', () => {
  it('parseStickyEmbed drops non-string fields and empty embeds', () => {
    expect(parseStickyEmbed(null)).toBeNull();
    expect(parseStickyEmbed({ colorHex: '#000000' })).toBeNull();
    expect(parseStickyEmbed({ title: 'x', description: 5 })).toEqual({
      title: 'x',
      description: undefined,
      colorHex: undefined,
      imageUrl: undefined,
      footer: undefined,
    });
  });

  it('stickyPreview prefers content, then embed title/description, and truncates', () => {
    expect(stickyPreview({ content: 'short', embed: null })).toBe('short');
    expect(stickyPreview({ content: null, embed: { title: 'Embed title' } })).toBe('Embed title');
    expect(stickyPreview({ content: 'x'.repeat(50), embed: null }, 40)).toBe(`${'x'.repeat(40)}…`);
    expect(stickyPreview({ content: null, embed: null })).toBe('(empty)');
  });
});
