import { describe, expect, it } from 'vitest';
import { buildTestApp, loginAs } from './helpers/build-test-app';

describe('auth guard', () => {
  it('returns 401 without a session', async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/auth/me' });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: 'unauthenticated' } });

    await app.close();
  });

  it('rejects a garbage/tampered session cookie the same as no cookie', async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie: 'sid=not-a-real-signed-value' } });

    expect(res.statusCode).toBe(401);

    await app.close();
  });

  it('returns the session user and a csrf token once authenticated', async () => {
    const { app, redis } = await buildTestApp();
    const { cookieHeader, session } = await loginAs(app, redis, { userId: '111111111111111111', username: 'brandon' });

    const res = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie: cookieHeader } });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user).toEqual({ id: '111111111111111111', username: 'brandon', globalName: null, avatarUrl: null });
    expect(body.csrfToken).toBe(session.csrfToken);

    await app.close();
  });
});
