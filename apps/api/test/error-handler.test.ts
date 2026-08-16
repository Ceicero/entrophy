import { describe, expect, it } from 'vitest';
import { buildTestApp, loginAs, seedUserGuilds } from './helpers/build-test-app';

const GUILD_ID = '666666666666666666';
const USER_ID = '777777777777777777';

describe('error handler', () => {
  it('never leaks a stack trace or the raw error message for an unexpected (500) failure', async () => {
    const boom = new Error('super secret internal detail: postgres://user:pass@host/db');
    const { app, redis } = await buildTestApp({
      guild: { findUnique: async () => ({ id: GUILD_ID, botPresent: true }) },
      pluginState: {
        findMany: async () => {
          throw boom;
        },
      },
    });
    const { cookieHeader } = await loginAs(app, redis, { userId: USER_ID });
    await seedUserGuilds(redis, USER_ID, [{ id: GUILD_ID, owner: true, permissions: '8' }]);

    const res = await app.inject({
      method: 'GET',
      url: `/guilds/${GUILD_ID}/plugins`,
      headers: { cookie: cookieHeader },
    });

    expect(res.statusCode).toBe(500);
    const text = res.body;
    expect(text).not.toContain('postgres://');
    expect(text).not.toContain('super secret');
    expect(text).not.toMatch(/at\s+\S+\s+\(.*:\d+:\d+\)/); // no stack-trace-looking lines

    const body = res.json();
    expect(body).toEqual({ error: { code: 'internal_error', message: 'An unexpected error occurred.' } });

    await app.close();
  });

  it('returns a clean 404 for an unknown route', async () => {
    const { app } = await buildTestApp();

    const res = await app.inject({ method: 'GET', url: '/this-route-does-not-exist' });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');

    await app.close();
  });
});
