import { describe, expect, it } from 'vitest';
import { buildTestApp, loginAs, seedUserGuilds } from './helpers/build-test-app';

const GUILD_ID = '123456789012345678';

describe('csrf protection', () => {
  it('rejects a mutating request from an authenticated session with no X-CSRF-Token header', async () => {
    const { app, redis } = await buildTestApp({
      guild: { findUnique: async () => ({ id: GUILD_ID, botPresent: true }) },
    });
    const { cookieHeader } = await loginAs(app, redis, { userId: '222222222222222222' });
    await seedUserGuilds(redis, '222222222222222222', [{ id: GUILD_ID, owner: true, permissions: '8' }]);

    const res = await app.inject({
      method: 'PATCH',
      url: `/guilds/${GUILD_ID}/config`,
      headers: { cookie: cookieHeader },
      payload: { fastActions: true },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: 'permission_denied' } });

    await app.close();
  });

  it('rejects a mutating request whose Origin header is not in the dashboard allowlist', async () => {
    const { app, redis } = await buildTestApp({
      guild: { findUnique: async () => ({ id: GUILD_ID, botPresent: true }) },
    });
    const { cookieHeader, session } = await loginAs(app, redis, { userId: '222222222222222223' });
    await seedUserGuilds(redis, '222222222222222223', [{ id: GUILD_ID, owner: true, permissions: '8' }]);

    const res = await app.inject({
      method: 'PATCH',
      url: `/guilds/${GUILD_ID}/config`,
      headers: { cookie: cookieHeader, origin: 'https://evil.example.com', 'x-csrf-token': session.csrfToken },
      payload: { fastActions: true },
    });

    expect(res.statusCode).toBe(403);

    await app.close();
  });

  it('allows a mutating request with a matching X-CSRF-Token header and allowed origin', async () => {
    const { app, redis } = await buildTestApp({
      guild: { findUnique: async () => ({ id: GUILD_ID, botPresent: true }) },
    });
    const { cookieHeader, session } = await loginAs(app, redis, { userId: '222222222222222224' });
    await seedUserGuilds(redis, '222222222222222224', [{ id: GUILD_ID, owner: true, permissions: '8' }]);

    const res = await app.inject({
      method: 'PATCH',
      url: `/guilds/${GUILD_ID}/config`,
      headers: { cookie: cookieHeader, origin: 'http://localhost:3000', 'x-csrf-token': session.csrfToken },
      payload: { fastActions: true },
    });

    expect(res.statusCode).toBe(200);

    await app.close();
  });

  it('does not require a csrf token for GET requests', async () => {
    const { app, redis } = await buildTestApp({
      guild: { findUnique: async () => ({ id: GUILD_ID, botPresent: true }) },
    });
    const { cookieHeader } = await loginAs(app, redis, { userId: '222222222222222225' });
    await seedUserGuilds(redis, '222222222222222225', [{ id: GUILD_ID, owner: true, permissions: '8' }]);

    const res = await app.inject({ method: 'GET', url: `/guilds/${GUILD_ID}/config`, headers: { cookie: cookieHeader } });

    expect(res.statusCode).toBe(200);

    await app.close();
  });
});
