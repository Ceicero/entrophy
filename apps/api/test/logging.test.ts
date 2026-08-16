import { describe, expect, it } from 'vitest';
import { buildTestApp, loginAs, seedUserGuilds } from './helpers/build-test-app';

const GUILD_ID = '666666666666666666';
const USER_ID = '777777777777777777';

/** Minimal stateful `PluginConfig` fake — the default Prisma stub always returns defaults, which can't exercise a PUT-then-GET round trip through `GuildConfigStore`. */
function pluginConfigOverrides() {
  const store = new Map<string, Record<string, unknown>>();
  const keyOf = (args: { where: { guildId_pluginId: { guildId: string; pluginId: string } } }) =>
    `${args.where.guildId_pluginId.guildId}:${args.where.guildId_pluginId.pluginId}`;

  return {
    pluginConfig: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fake, args shape mirrors Prisma's generated types
      findUnique: async (args: any) => {
        const key = keyOf(args);
        return store.has(key) ? { config: store.get(key) } : null;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fake
      upsert: async (args: any) => {
        const key = keyOf(args);
        const config = store.has(key) ? args.update.config : args.create.config;
        store.set(key, config);
        return { config };
      },
    },
  };
}

async function authedContext() {
  const { app, redis, prisma } = await buildTestApp({
    guild: { findUnique: async () => ({ id: GUILD_ID, botPresent: true }) },
    ...pluginConfigOverrides(),
  });
  const { cookieHeader, session } = await loginAs(app, redis, { userId: USER_ID });
  await seedUserGuilds(redis, USER_ID, [{ id: GUILD_ID, owner: true, permissions: '8' }]);
  const mutHeaders = {
    cookie: cookieHeader,
    origin: 'http://localhost:3000',
    'x-csrf-token': session.csrfToken,
  };
  return { app, cookieHeader, mutHeaders, prisma };
}

describe('logging settings', () => {
  it('GET returns the plugin defaults when nothing has been configured yet', async () => {
    const { app, cookieHeader } = await authedContext();

    const res = await app.inject({
      method: 'GET',
      url: `/guilds/${GUILD_ID}/logging/settings`,
      headers: { cookie: cookieHeader },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.storeEvents).toBe(true);
    expect(body.retentionDays).toBe(90);
    expect(body.redactionPatterns).toEqual([]);
    expect(body.channels).toEqual({});

    await app.close();
  });

  it('PUT persists a partial patch (retentionDays) without clobbering other fields', async () => {
    const { app, mutHeaders, cookieHeader } = await authedContext();

    const put = await app.inject({
      method: 'PUT',
      url: `/guilds/${GUILD_ID}/logging/settings`,
      headers: mutHeaders,
      payload: { retentionDays: 30 },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().retentionDays).toBe(30);
    expect(put.json().storeEvents).toBe(true); // unaffected default preserved

    const get = await app.inject({
      method: 'GET',
      url: `/guilds/${GUILD_ID}/logging/settings`,
      headers: { cookie: cookieHeader },
    });
    expect(get.json().retentionDays).toBe(30);

    await app.close();
  });
});

describe('POST /:guildId/logging/redaction/test', () => {
  it('reports which default patterns matched and returns redacted text', async () => {
    const { app, mutHeaders } = await authedContext();

    const res = await app.inject({
      method: 'POST',
      url: `/guilds/${GUILD_ID}/logging/redaction/test`,
      headers: mutHeaders,
      payload: { text: 'reach me at test@example.com please' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.redacted).toBe('reach me at [redacted:email] please');
    const emailMatch = body.matches.find((m: { name: string }) => m.name === 'email');
    expect(emailMatch.matched).toBe(true);
  });

  it('rejects an empty text body', async () => {
    const { app, mutHeaders } = await authedContext();

    const res = await app.inject({
      method: 'POST',
      url: `/guilds/${GUILD_ID}/logging/redaction/test`,
      headers: mutHeaders,
      payload: { text: '' },
    });

    expect(res.statusCode).toBe(400);
  });
});
