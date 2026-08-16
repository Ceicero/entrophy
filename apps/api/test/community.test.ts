import { describe, expect, it } from 'vitest';
import { buildTestApp, loginAs, seedUserGuilds } from './helpers/build-test-app';

const GUILD_ID = '111111111111111111';
const USER_ID = '222222222222222222';

async function authedApp(overrides: Parameters<typeof buildTestApp>[0] = {}) {
  const built = await buildTestApp({
    guild: { findUnique: async () => ({ id: GUILD_ID, botPresent: true }) },
    ...overrides,
  });
  const { cookieHeader, session } = await loginAs(built.app, built.redis, { userId: USER_ID });
  await seedUserGuilds(built.redis, USER_ID, [{ id: GUILD_ID, owner: true, permissions: '8' }]);
  const mutHeaders = {
    cookie: cookieHeader,
    origin: 'http://localhost:3000',
    'x-csrf-token': session.csrfToken,
  };
  return { ...built, cookieHeader, mutHeaders };
}

describe('community giveaways', () => {
  it('lists giveaways with an entry count derived from the relation', async () => {
    const row = {
      id: 'gw1',
      guildId: GUILD_ID,
      channelId: 'c1',
      messageId: 'm1',
      prize: 'Nitro',
      winnerCount: 1,
      hostId: 'host1',
      endsAt: new Date('2026-02-01T00:00:00Z'),
      ended: false,
      requiredRoleIds: [],
      minAccountAgeDays: null,
      minLevel: null,
      winnerIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      _count: { entries: 7 },
    };
    const { app, cookieHeader } = await authedApp({ giveaway: { findMany: async () => [row] } });

    const res = await app.inject({
      method: 'GET',
      url: `/guilds/${GUILD_ID}/community/giveaways`,
      headers: { cookie: cookieHeader },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items[0]).toMatchObject({ id: 'gw1', prize: 'Nitro', entryCount: 7 });

    await app.close();
  });
});

describe('community poll results', () => {
  const poll = {
    id: 'poll1',
    guildId: GUILD_ID,
    channelId: 'c1',
    messageId: 'm1',
    question: 'Best pet?',
    anonymous: false,
    multiSelect: false,
    endsAt: null,
    closed: false,
    createdBy: 'author1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const options = [
    { id: 'a', pollId: 'poll1', label: 'Cats', position: 0, emoji: null },
    { id: 'b', pollId: 'poll1', label: 'Dogs', position: 1, emoji: null },
  ];
  const votes = [
    { id: 'v1', pollId: 'poll1', optionId: 'a', userId: 'u1', createdAt: new Date() },
    { id: 'v2', pollId: 'poll1', optionId: 'a', userId: 'u2', createdAt: new Date() },
  ];

  it('tallies votes per option and includes voter ids for a non-anonymous poll', async () => {
    const { app, cookieHeader } = await authedApp({
      poll: { findFirst: async () => poll },
      pollOption: { findMany: async () => options },
      pollVote: { findMany: async () => votes },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/guilds/${GUILD_ID}/community/polls/poll1/results`,
      headers: { cookie: cookieHeader },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totalVotes).toBe(2);
    expect(body.options[0]).toMatchObject({ id: 'a', votes: 2, voterIds: ['u1', 'u2'] });
    expect(body.options[1]).toMatchObject({ id: 'b', votes: 0 });

    await app.close();
  });

  it('omits voter ids for an anonymous poll', async () => {
    const { app, cookieHeader } = await authedApp({
      poll: { findFirst: async () => ({ ...poll, anonymous: true }) },
      pollOption: { findMany: async () => options },
      pollVote: { findMany: async () => votes },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/guilds/${GUILD_ID}/community/polls/poll1/results`,
      headers: { cookie: cookieHeader },
    });
    expect(res.json().options[0]).not.toHaveProperty('voterIds');

    await app.close();
  });

  it('404s for a poll that does not exist in the guild', async () => {
    const { app, cookieHeader } = await authedApp({ poll: { findFirst: async () => null } });
    const res = await app.inject({
      method: 'GET',
      url: `/guilds/${GUILD_ID}/community/polls/nope/results`,
      headers: { cookie: cookieHeader },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('community announcements', () => {
  it('lists scheduled announcements', async () => {
    const row = {
      id: 'ann1',
      guildId: GUILD_ID,
      channelId: 'c1',
      content: { content: 'Hello!' },
      cron: '0 12 * * *',
      runAt: null,
      enabled: true,
      lastRunAt: null,
      createdBy: 'staff1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const { app, cookieHeader } = await authedApp({ scheduledAnnouncement: { findMany: async () => [row] } });

    const res = await app.inject({
      method: 'GET',
      url: `/guilds/${GUILD_ID}/community/announcements`,
      headers: { cookie: cookieHeader },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items[0]).toMatchObject({
      id: 'ann1',
      cron: '0 12 * * *',
      content: { content: 'Hello!' },
    });

    await app.close();
  });

  it('cancels an announcement: disables it and returns the updated DTO', async () => {
    const existing = { id: 'ann1', guildId: GUILD_ID, cron: null };
    const updated = {
      ...existing,
      channelId: 'c1',
      content: { content: 'Hi' },
      runAt: new Date(),
      enabled: false,
      lastRunAt: null,
      createdBy: 'staff1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const { app, mutHeaders } = await authedApp({
      scheduledAnnouncement: { findFirst: async () => existing, update: async () => updated },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/guilds/${GUILD_ID}/community/announcements/ann1/cancel`,
      headers: mutHeaders,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: 'ann1', enabled: false });

    await app.close();
  }, 10_000);

  it('404s cancelling an announcement that does not belong to the guild', async () => {
    const { app, mutHeaders } = await authedApp({ scheduledAnnouncement: { findFirst: async () => null } });
    const res = await app.inject({
      method: 'POST',
      url: `/guilds/${GUILD_ID}/community/announcements/nope/cancel`,
      headers: mutHeaders,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('community events', () => {
  it('lists events with RSVP counts summarized from the relation', async () => {
    const row = {
      id: 'ev1',
      guildId: GUILD_ID,
      title: 'Movie night',
      description: null,
      startsAt: new Date('2026-03-01T20:00:00Z'),
      endsAt: null,
      channelId: 'c1',
      messageId: 'm1',
      hostId: 'host1',
      discordEventId: null,
      reminderMinutes: [60, 10],
      createdAt: new Date(),
      updatedAt: new Date(),
      rsvps: [
        {
          id: 'r1',
          eventId: 'ev1',
          userId: 'u1',
          status: 'GOING',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'r2',
          eventId: 'ev1',
          userId: 'u2',
          status: 'MAYBE',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'r3',
          eventId: 'ev1',
          userId: 'u3',
          status: 'DECLINED',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    };
    const { app, cookieHeader } = await authedApp({ communityEvent: { findMany: async () => [row] } });

    const res = await app.inject({
      method: 'GET',
      url: `/guilds/${GUILD_ID}/community/events`,
      headers: { cookie: cookieHeader },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items[0]).toMatchObject({
      id: 'ev1',
      title: 'Movie night',
      rsvps: { going: 1, maybe: 1, declined: 1 },
    });

    await app.close();
  });
});

describe('economy settings', () => {
  it('GET returns manifest defaults, PUT persists a patch', async () => {
    const store = new Map<string, Record<string, unknown>>();
    const { app, cookieHeader, mutHeaders } = await authedApp({
      pluginConfig: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fake, args shape mirrors Prisma's generated types
        findUnique: async (args: any) =>
          store.has(args.where.guildId_pluginId.pluginId)
            ? { config: store.get(args.where.guildId_pluginId.pluginId) }
            : null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fake
        upsert: async (args: any) => {
          store.set(args.where.guildId_pluginId.pluginId, args.create.config);
          return { config: args.create.config };
        },
      },
    });

    const before = await app.inject({
      method: 'GET',
      url: `/guilds/${GUILD_ID}/economy/config`,
      headers: { cookie: cookieHeader },
    });
    expect(before.statusCode).toBe(200);
    expect(before.json().currencyName).toBe('Coins');
    expect(before.json().dailyMinAmount).toBe(50);

    const put = await app.inject({
      method: 'PUT',
      url: `/guilds/${GUILD_ID}/economy/config`,
      headers: mutHeaders,
      payload: { currencyName: 'Gems', currencySymbol: '💎' },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().currencyName).toBe('Gems');
    expect(put.json().currencySymbol).toBe('💎');
    // untouched fields keep their defaults
    expect(put.json().dailyMaxAmount).toBe(150);

    await app.close();
  });

  it('rejects an unauthenticated request', async () => {
    const { app } = await authedApp();
    const res = await app.inject({ method: 'GET', url: `/guilds/${GUILD_ID}/economy/config` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('community suggestions status', () => {
  it('updates status and writes an audit entry', async () => {
    const existing = { id: 's1', guildId: GUILD_ID, deletedAt: null, status: 'PENDING' };
    const updated = {
      ...existing,
      status: 'APPROVED',
      number: 1,
      authorId: 'a1',
      channelId: 'c1',
      messageId: 'm1',
      content: 'Add dark mode',
      staffNote: null,
      threadId: null,
      upvotes: 0,
      downvotes: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const { app, mutHeaders } = await authedApp({
      suggestion: { findFirst: async () => existing, update: async () => updated },
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/guilds/${GUILD_ID}/community/suggestions/s1`,
      headers: mutHeaders,
      payload: { status: 'APPROVED' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('APPROVED');

    await app.close();
  });

  it('404s updating a suggestion that does not belong to the guild', async () => {
    const { app, mutHeaders } = await authedApp({ suggestion: { findFirst: async () => null } });
    const res = await app.inject({
      method: 'PATCH',
      url: `/guilds/${GUILD_ID}/community/suggestions/nope`,
      headers: mutHeaders,
      payload: { status: 'APPROVED' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
