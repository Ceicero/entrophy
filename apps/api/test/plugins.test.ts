import { describe, expect, it } from 'vitest';
import { buildTestApp, loginAs, seedUserGuilds } from './helpers/build-test-app';

const GUILD_ID = '444444444444444444';
const USER_ID = '555555555555555555';

/** Minimal stateful `PluginState` fake — enough for the enable/disable round trip to be observable across requests. */
function pluginStateOverrides() {
  const store = new Map<string, boolean>();
  const keyOf = (args: { where: { guildId_pluginId: { guildId: string; pluginId: string } } }) =>
    `${args.where.guildId_pluginId.guildId}:${args.where.guildId_pluginId.pluginId}`;

  return {
    store,
    overrides: {
      pluginState: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fake, args shape mirrors Prisma's generated types
        upsert: async (args: any) => {
          store.set(keyOf(args), args.create.enabled);
          return { ...args.create };
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fake
        findUnique: async (args: any) => {
          const key = keyOf(args);
          return store.has(key) ? { enabled: store.get(key) } : null;
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fake
        findMany: async (args: any) => {
          const guildId: string = args?.where?.guildId ?? GUILD_ID;
          return [...store.entries()]
            .filter(([key]) => key.startsWith(`${guildId}:`))
            .map(([key, enabled]) => ({ pluginId: key.split(':')[1], enabled }));
        },
      },
      guild: { findUnique: async () => ({ id: GUILD_ID, botPresent: true }) },
    },
  };
}

describe('plugin enable/disable', () => {
  it('toggles a plugin off then back on, persisting through the config store', async () => {
    const { overrides } = pluginStateOverrides();
    const { app, redis } = await buildTestApp(overrides);
    const { cookieHeader, session } = await loginAs(app, redis, { userId: USER_ID });
    await seedUserGuilds(redis, USER_ID, [{ id: GUILD_ID, owner: true, permissions: '8' }]);

    const mutHeaders = { cookie: cookieHeader, origin: 'http://localhost:3000', 'x-csrf-token': session.csrfToken };

    const before = await app.inject({ method: 'GET', url: `/guilds/${GUILD_ID}/plugins`, headers: { cookie: cookieHeader } });
    expect(before.statusCode).toBe(200);
    const moderationBefore = before.json().find((p: { id: string }) => p.id === 'moderation');
    expect(moderationBefore.enabled).toBe(true); // moderation defaults to enabled

    const disable = await app.inject({ method: 'POST', url: `/guilds/${GUILD_ID}/plugins/moderation/disable`, headers: mutHeaders });
    expect(disable.statusCode).toBe(200);
    expect(disable.json()).toEqual({ ok: true });

    const afterDisable = await app.inject({ method: 'GET', url: `/guilds/${GUILD_ID}/plugins`, headers: { cookie: cookieHeader } });
    const moderationAfterDisable = afterDisable.json().find((p: { id: string }) => p.id === 'moderation');
    expect(moderationAfterDisable.enabled).toBe(false);

    const enable = await app.inject({ method: 'POST', url: `/guilds/${GUILD_ID}/plugins/moderation/enable`, headers: mutHeaders });
    expect(enable.statusCode).toBe(200);

    const afterEnable = await app.inject({ method: 'GET', url: `/guilds/${GUILD_ID}/plugins`, headers: { cookie: cookieHeader } });
    const moderationAfterEnable = afterEnable.json().find((p: { id: string }) => p.id === 'moderation');
    expect(moderationAfterEnable.enabled).toBe(true);

    await app.close();
  });

  it('refuses to disable the always-enabled admin plugin', async () => {
    const { overrides } = pluginStateOverrides();
    const { app, redis } = await buildTestApp(overrides);
    const { cookieHeader, session } = await loginAs(app, redis, { userId: `${USER_ID}1` });
    await seedUserGuilds(redis, `${USER_ID}1`, [{ id: GUILD_ID, owner: true, permissions: '8' }]);

    const res = await app.inject({
      method: 'POST',
      url: `/guilds/${GUILD_ID}/plugins/admin/disable`,
      headers: { cookie: cookieHeader, origin: 'http://localhost:3000', 'x-csrf-token': session.csrfToken },
    });

    expect(res.statusCode).toBe(500);
    expect(res.json().error.message).not.toMatch(/always enabled/i); // internal errors are never exposed verbatim

    await app.close();
  });
});
