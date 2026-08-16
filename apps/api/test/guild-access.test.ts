import { describe, expect, it } from 'vitest';
import { buildTestApp, loginAs, seedUserGuilds } from './helpers/build-test-app';

const GUILD_ID = '123456789012345678';

describe('guild access', () => {
  it('returns 403 for a user who does not manage the guild (from their cached Discord guild list)', async () => {
    const { app, redis } = await buildTestApp({
      guild: { findUnique: async () => ({ id: GUILD_ID, botPresent: true }) },
    });
    const { cookieHeader } = await loginAs(app, redis, { userId: '333333333333333331' });
    // Member of the guild, but no MANAGE_GUILD/ADMINISTRATOR and not the owner.
    await seedUserGuilds(redis, '333333333333333331', [{ id: GUILD_ID, owner: false, permissions: '0' }]);

    const res = await app.inject({
      method: 'GET',
      url: `/guilds/${GUILD_ID}/plugins`,
      headers: { cookie: cookieHeader },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: 'permission_denied' } });

    await app.close();
  });

  it('returns 403 for a guild the user cannot see at all', async () => {
    const { app, redis } = await buildTestApp({
      guild: { findUnique: async () => ({ id: GUILD_ID, botPresent: true }) },
    });
    const { cookieHeader } = await loginAs(app, redis, { userId: '333333333333333332' });
    await seedUserGuilds(redis, '333333333333333332', []); // not in any guilds

    const res = await app.inject({
      method: 'GET',
      url: `/guilds/${GUILD_ID}/plugins`,
      headers: { cookie: cookieHeader },
    });

    expect(res.statusCode).toBe(403);

    await app.close();
  });

  it('returns 404 when the user manages the guild but the bot is not present', async () => {
    const { app, redis } = await buildTestApp({
      guild: { findUnique: async () => null },
    });
    const { cookieHeader } = await loginAs(app, redis, { userId: '333333333333333333' });
    await seedUserGuilds(redis, '333333333333333333', [{ id: GUILD_ID, owner: true, permissions: '8' }]);

    const res = await app.inject({
      method: 'GET',
      url: `/guilds/${GUILD_ID}/plugins`,
      headers: { cookie: cookieHeader },
    });

    expect(res.statusCode).toBe(404);

    await app.close();
  });

  it('allows a MANAGE_GUILD holder (not owner) with the bot present', async () => {
    const { app, redis } = await buildTestApp({
      guild: { findUnique: async () => ({ id: GUILD_ID, botPresent: true }) },
    });
    const { cookieHeader } = await loginAs(app, redis, { userId: '333333333333333334' });
    // permissions bit 0x20 = MANAGE_GUILD
    await seedUserGuilds(redis, '333333333333333334', [
      { id: GUILD_ID, owner: false, permissions: String(0x20n) },
    ]);

    const res = await app.inject({
      method: 'GET',
      url: `/guilds/${GUILD_ID}/plugins`,
      headers: { cookie: cookieHeader },
    });

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);

    await app.close();
  });
});
