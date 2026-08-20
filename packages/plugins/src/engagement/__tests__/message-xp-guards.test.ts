import { describe, expect, it } from 'vitest';
import type { Message, OmitPartialGroupDMChannel } from 'discord.js';
import { createTestContext } from '../../sdk/testing';
import { messageCreateHandler } from '../events/message-create';
import { configSchema } from '../manifest';

const GUILD_ID = 'guild-1';
const USER_ID = 'user-1';

interface MessageSpec {
  bot?: boolean;
  system?: boolean;
  webhookId?: string | null;
}

function buildMessage(spec: MessageSpec = {}): OmitPartialGroupDMChannel<Message> {
  return {
    guild: { id: GUILD_ID },
    guildId: GUILD_ID,
    channelId: 'channel-1',
    author: { id: USER_ID, bot: spec.bot ?? false },
    member: null,
    system: spec.system ?? false,
    webhookId: spec.webhookId ?? null,
  } as unknown as OmitPartialGroupDMChannel<Message>;
}

// ioredis-mock shares its in-memory keyspace across instances, so without a flush the first test's XP
// cooldown would suppress every later one and the guards would look like they worked.
async function buildContext() {
  const cfg = configSchema.parse({});
  const test = createTestContext({
    config: cfg,
    prismaOverrides: {
      levelProfile: {
        upsert: async () => ({ id: 'p1', guildId: GUILD_ID, userId: USER_ID, xp: 20, level: 0 }),
      },
    },
  });
  await test.redis.flushall();
  return test;
}

describe('engagement messageCreate XP guard', () => {
  it('awards XP for an ordinary member message (control)', async () => {
    const { ctx, prismaCalls } = await buildContext();
    await messageCreateHandler.handler(ctx, buildMessage());

    expect(prismaCalls.map((call) => `${call.model}.${call.method}`)).toContain('levelProfile.upsert');
  });

  // Join/boost/pin notices carry the real member as `author` with `bot: false`, so a member could farm XP
  // by rejoining without ever typing.
  it('ignores system messages (join/boost/pin notices)', async () => {
    const { ctx, prismaCalls } = await buildContext();
    await messageCreateHandler.handler(ctx, buildMessage({ system: true }));

    expect(prismaCalls).toHaveLength(0);
  });

  it('ignores webhook posts', async () => {
    const { ctx, prismaCalls } = await buildContext();
    await messageCreateHandler.handler(ctx, buildMessage({ webhookId: '444444444444444444' }));

    expect(prismaCalls).toHaveLength(0);
  });

  it('ignores bot messages', async () => {
    const { ctx, prismaCalls } = await buildContext();
    await messageCreateHandler.handler(ctx, buildMessage({ bot: true }));

    expect(prismaCalls).toHaveLength(0);
  });
});
