import { describe, expect, it } from 'vitest';
import type { PrismaStubOverrides } from '@entrophy/plugins/sdk/testing';
import { buildTestApp, loginAs, seedUserGuilds } from './helpers/build-test-app';

const GUILD_ID = '666666666666666666';
const USER_ID = '777777777777777777';

function guildOverrides() {
  return { guild: { findUnique: async () => ({ id: GUILD_ID, botPresent: true }) } };
}

function integrationConnectionOverrides() {
  const rows = new Map<string, Record<string, unknown>>();
  let nextId = 1;
  return {
    integrationConnection: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fake, args shape mirrors Prisma's generated types
      create: async (args: any) => {
        const id = `conn${nextId++}`;
        const row = {
          id,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSyncAt: null,
          lastError: null,
          externalAccountId: null,
          externalAccountName: null,
          deletedAt: null,
          ...args.data,
        };
        rows.set(id, row);
        return row;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findMany: async (args: any) => {
        let list = [...rows.values()].filter(
          (r) => r.guildId === args?.where?.guildId && r.deletedAt === null,
        );
        const providerFilter = args?.where?.provider;
        if (providerFilter) {
          if (typeof providerFilter === 'string') list = list.filter((r) => r.provider === providerFilter);
          else if (providerFilter.in) list = list.filter((r) => providerFilter.in.includes(r.provider));
        }
        return list;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findFirst: async (args: any) =>
        [...rows.values()].find(
          (r) =>
            r.id === args.where.id &&
            r.guildId === args.where.guildId &&
            (args.where.deletedAt === undefined || r.deletedAt === args.where.deletedAt),
        ) ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: async (args: any) => {
        const existing = rows.get(args.where.id)!;
        const updated = { ...existing, ...args.data };
        rows.set(args.where.id, updated);
        return updated;
      },
    },
    ...guildOverrides(),
  };
}

function webhookEndpointOverrides() {
  const rows = new Map<string, Record<string, unknown>>();
  let nextId = 1;
  return {
    webhookEndpoint: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: async (args: any) => {
        const id = `hook${nextId++}`;
        const row = {
          id,
          createdAt: new Date(),
          updatedAt: new Date(),
          failureCount: 0,
          lastDeliveryAt: null,
          enabled: true,
          channelId: null,
          url: null,
          deletedAt: null,
          ...args.data,
        };
        rows.set(id, row);
        return row;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findMany: async (args: any) =>
        [...rows.values()].filter(
          (r) =>
            r.guildId === args?.where?.guildId &&
            r.direction === args?.where?.direction &&
            r.deletedAt === null,
        ),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findFirst: async (args: any) =>
        [...rows.values()].find((r) => r.id === args.where.id && r.guildId === args.where.guildId) ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: async (args: any) => {
        const existing = rows.get(args.where.id)!;
        const updated = { ...existing, ...args.data };
        rows.set(args.where.id, updated);
        return updated;
      },
    },
    ...guildOverrides(),
  };
}

async function setupAuthedApp(overrides: PrismaStubOverrides) {
  const { app, redis, ...rest } = await buildTestApp(overrides);
  const { cookieHeader, session } = await loginAs(app, redis, { userId: USER_ID });
  await seedUserGuilds(redis, USER_ID, [{ id: GUILD_ID, owner: true, permissions: '8' }]);
  return { app, redis, cookieHeader, csrfToken: session.csrfToken, ...rest };
}

describe('GET /guilds/:guildId/integrations/providers', () => {
  it('returns availability for all 10 providers', async () => {
    const { app, cookieHeader } = await setupAuthedApp(guildOverrides());
    const res = await app.inject({
      method: 'GET',
      url: `/guilds/${GUILD_ID}/integrations/providers`,
      headers: { cookie: cookieHeader },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { id: string; available: boolean }[];
    expect(body).toHaveLength(10);
    expect(body.map((p) => p.id)).toEqual(
      expect.arrayContaining([
        'twitch',
        'youtube',
        'github',
        'reddit',
        'steam',
        'google_calendar',
        'microsoft_calendar',
        'notion',
        'stripe',
        'generic_webhook',
      ]),
    );
    await app.close();
  });
});

describe('alert connections', () => {
  it('creates, lists, and deletes an alert watch', async () => {
    const { app, cookieHeader, csrfToken } = await setupAuthedApp(integrationConnectionOverrides());

    const create = await app.inject({
      method: 'POST',
      url: `/guilds/${GUILD_ID}/integrations/alerts`,
      headers: { cookie: cookieHeader, 'x-csrf-token': csrfToken },
      payload: { provider: 'twitch', target: 'shroud', channelId: '888888888888888888' },
    });
    expect(create.statusCode).toBe(201);
    const created = create.json() as { id: string; target: string };
    expect(created.target).toBe('shroud');

    const list = await app.inject({
      method: 'GET',
      url: `/guilds/${GUILD_ID}/integrations/alerts`,
      headers: { cookie: cookieHeader },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toHaveLength(1);

    const del = await app.inject({
      method: 'DELETE',
      url: `/guilds/${GUILD_ID}/integrations/alerts/${created.id}`,
      headers: { cookie: cookieHeader, 'x-csrf-token': csrfToken },
    });
    expect(del.statusCode).toBe(204);

    const listAfter = await app.inject({
      method: 'GET',
      url: `/guilds/${GUILD_ID}/integrations/alerts`,
      headers: { cookie: cookieHeader },
    });
    expect(listAfter.json()).toHaveLength(0);

    await app.close();
  });
});

describe('outbound webhooks', () => {
  it('rejects a private-IP URL at creation (SSRF)', async () => {
    const { app, cookieHeader, csrfToken } = await setupAuthedApp(webhookEndpointOverrides());
    const res = await app.inject({
      method: 'POST',
      url: `/guilds/${GUILD_ID}/integrations/outbound`,
      headers: { cookie: cookieHeader, 'x-csrf-token': csrfToken },
      payload: { name: 'internal', url: 'https://127.0.0.1/hook', events: ['moderation.caseCreated'] },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('creates an outbound webhook, lists it, and queues a test delivery', async () => {
    const { app, cookieHeader, csrfToken, queues } = await setupAuthedApp(webhookEndpointOverrides());

    const create = await app.inject({
      method: 'POST',
      url: `/guilds/${GUILD_ID}/integrations/outbound`,
      headers: { cookie: cookieHeader, 'x-csrf-token': csrfToken },
      payload: {
        name: 'my hook',
        url: 'https://example.com/hook',
        events: ['moderation.caseCreated', 'ticket.opened'],
      },
    });
    expect(create.statusCode).toBe(201);
    const created = create.json() as { id: string; secret: string };
    expect(created.secret).toBeTruthy();

    const list = await app.inject({
      method: 'GET',
      url: `/guilds/${GUILD_ID}/integrations/outbound`,
      headers: { cookie: cookieHeader },
    });
    expect(list.json()).toHaveLength(1);

    const test = await app.inject({
      method: 'POST',
      url: `/guilds/${GUILD_ID}/integrations/outbound/${created.id}/test`,
      headers: { cookie: cookieHeader, 'x-csrf-token': csrfToken },
    });
    expect(test.statusCode).toBe(200);
    expect(
      queues.calls.some(
        (c) => c.queue === 'bot-actions' && (c.data as { type: string }).type === 'integrations.testWebhook',
      ),
    ).toBe(true);

    await app.close();
  });
});
