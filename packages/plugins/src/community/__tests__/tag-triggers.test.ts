import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientEvents } from 'discord.js';
import RedisMock from 'ioredis-mock';
import { createTestContext, type TestContextOverrides } from '../../sdk/testing';
import { tagTriggersHandler } from '../events/tag-triggers';
import { configSchema } from '../manifest';
import { tagTriggersCacheKey } from '../tags';

/** The `messageCreate` handler's message type (discord.js omits partial group-DM channels). */
type IncomingMessage = ClientEvents['messageCreate'][0];

const GUILD_ID = '111111111111111111';
const CHANNEL_ID = '222222222222222222';

const config = configSchema.parse({
  tags: { enabled: true, triggersEnabled: true, triggerCooldownSeconds: 15 },
});

const tagRow = {
  id: 'tag1',
  guildId: GUILD_ID,
  name: 'verify',
  content: 'Go to #verify, {user}!',
  embed: null,
  triggerMode: 'CONTAINS',
  trigger: 'how do i verify',
  triggerChannelIds: [] as string[],
  staffOnly: false,
  uses: 0,
  createdBy: 'staff1',
  updatedBy: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function fakeMessage(content: string, overrides: Partial<Record<string, unknown>> = {}) {
  const reply = vi.fn(async (_payload: unknown) => undefined);
  const message = {
    inGuild: () => true,
    guildId: GUILD_ID,
    channelId: CHANNEL_ID,
    content,
    author: { id: 'user1', bot: false, username: 'alice', tag: 'alice#0' },
    webhookId: null,
    system: false,
    guild: { id: GUILD_ID, name: 'Test Guild', memberCount: 10 },
    reply,
    ...overrides,
  };
  return { message: message as unknown as IncomingMessage, reply };
}

function buildCtx(overrides: TestContextOverrides = {}) {
  return createTestContext({
    config,
    prismaOverrides: {
      tag: {
        findUnique: async () => tagRow,
        findMany: async () => [tagRow],
        update: async () => ({ ...tagRow, uses: 1 }),
      },
    },
    ...overrides,
  });
}

async function seedCache(redis: ReturnType<typeof buildCtx>['redis']) {
  await redis.set(
    tagTriggersCacheKey(GUILD_ID),
    JSON.stringify([
      {
        id: tagRow.id,
        name: tagRow.name,
        triggerMode: tagRow.triggerMode,
        trigger: tagRow.trigger,
        triggerChannelIds: tagRow.triggerChannelIds,
      },
    ]),
  );
}

describe('tag auto-responder (messageCreate)', () => {
  // ioredis-mock instances share one in-memory store; start each test clean (cache + cooldown keys).
  beforeEach(async () => {
    await new RedisMock().flushall();
  });

  it('does nothing without the Message Content intent — no prisma access at all', async () => {
    const { ctx, prismaCalls } = buildCtx({ intentsEnabled: { messageContent: false } });
    const { message, reply } = fakeMessage('how do i verify?');
    await tagTriggersHandler.handler(ctx, message);
    expect(reply).not.toHaveBeenCalled();
    expect(prismaCalls).toHaveLength(0);
  });

  it('does nothing when triggers are switched off in config', async () => {
    const off = configSchema.parse({ tags: { triggersEnabled: false } });
    const { ctx, prismaCalls } = buildCtx({ intentsEnabled: { messageContent: true }, config: off });
    const { message, reply } = fakeMessage('how do i verify?');
    await tagTriggersHandler.handler(ctx, message);
    expect(reply).not.toHaveBeenCalled();
    expect(prismaCalls).toHaveLength(0);
  });

  it('ignores bots, webhooks, and DMs', async () => {
    const { ctx, prismaCalls } = buildCtx({ intentsEnabled: { messageContent: true } });
    await seedCache(ctx.redis);
    const bot = fakeMessage('how do i verify', { author: { id: 'b', bot: true, username: 'b', tag: 'b#0' } });
    await tagTriggersHandler.handler(ctx, bot.message);
    const webhook = fakeMessage('how do i verify', { webhookId: 'wh' });
    await tagTriggersHandler.handler(ctx, webhook.message);
    const dm = fakeMessage('how do i verify', { inGuild: () => false });
    await tagTriggersHandler.handler(ctx, dm.message);
    expect(bot.reply).not.toHaveBeenCalled();
    expect(webhook.reply).not.toHaveBeenCalled();
    expect(dm.reply).not.toHaveBeenCalled();
    expect(prismaCalls).toHaveLength(0);
  });

  it('with the intent on and a cached trigger list, replies once and honours the cooldown', async () => {
    const { ctx, prismaCalls } = buildCtx({ intentsEnabled: { messageContent: true } });
    await seedCache(ctx.redis);

    const first = fakeMessage('Hey, how do I verify?');
    await tagTriggersHandler.handler(ctx, first.message);
    expect(first.reply).toHaveBeenCalledTimes(1);
    const payload = first.reply.mock.calls[0]![0] as unknown as {
      content?: string;
      allowedMentions?: { parse: string[] };
    };
    expect(payload.content).toBe('Go to #verify, alice!');
    expect(payload.allowedMentions).toEqual({ parse: [] });
    // Fetched the full tag on match and bumped its use counter — but never touched findMany (cache hit).
    expect(prismaCalls.map((c) => `${c.model}.${c.method}`)).toEqual(['tag.findUnique', 'tag.update']);

    const second = fakeMessage('how do i verify again');
    await tagTriggersHandler.handler(ctx, second.message);
    expect(second.reply).not.toHaveBeenCalled();
  });

  it('respects triggerChannelIds and non-matching text', async () => {
    const { ctx } = buildCtx({ intentsEnabled: { messageContent: true } });
    await ctx.redis.set(
      tagTriggersCacheKey(GUILD_ID),
      JSON.stringify([
        {
          id: tagRow.id,
          name: tagRow.name,
          triggerMode: 'CONTAINS',
          trigger: 'how do i verify',
          triggerChannelIds: ['999'],
        },
      ]),
    );
    const wrongChannel = fakeMessage('how do i verify');
    await tagTriggersHandler.handler(ctx, wrongChannel.message);
    expect(wrongChannel.reply).not.toHaveBeenCalled();

    const rightChannel = fakeMessage('how do i verify', { channelId: '999' });
    await tagTriggersHandler.handler(ctx, rightChannel.message);
    expect(rightChannel.reply).toHaveBeenCalledTimes(1);

    const noMatch = fakeMessage('unrelated chatter', { channelId: '999' });
    await tagTriggersHandler.handler(ctx, noMatch.message);
    expect(noMatch.reply).not.toHaveBeenCalled();
  });

  it('loads and caches the trigger list from prisma on a cache miss, and skips DB when the cache is empty', async () => {
    const { ctx, prismaCalls } = buildCtx({ intentsEnabled: { messageContent: true } });
    const miss = fakeMessage('nothing to see');
    await tagTriggersHandler.handler(ctx, miss.message);
    expect(prismaCalls.map((c) => `${c.model}.${c.method}`)).toEqual(['tag.findMany']);
    expect(await ctx.redis.get(tagTriggersCacheKey(GUILD_ID))).toContain('"id":"tag1"');

    // Now an explicitly empty cache: no DB access at all.
    prismaCalls.length = 0;
    await ctx.redis.set(tagTriggersCacheKey(GUILD_ID), '[]');
    const empty = fakeMessage('how do i verify');
    await tagTriggersHandler.handler(ctx, empty.message);
    expect(empty.reply).not.toHaveBeenCalled();
    expect(prismaCalls).toHaveLength(0);
  });
});
