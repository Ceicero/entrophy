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
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: 'sid=not-a-real-signed-value' },
    });

    expect(res.statusCode).toBe(401);

    await app.close();
  });

  it('returns the session user and a csrf token once authenticated', async () => {
    const { app, redis } = await buildTestApp();
    const { cookieHeader, session } = await loginAs(app, redis, {
      userId: '111111111111111111',
      username: 'brandon',
    });

    const res = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie: cookieHeader } });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user).toEqual({
      id: '111111111111111111',
      username: 'brandon',
      globalName: null,
      avatarUrl: null,
    });
    expect(body.csrfToken).toBe(session.csrfToken);

    await app.close();
  });
});

describe('GET /auth/invite', () => {
  it('redirects to the Discord authorize URL without Administrator, and with the scopes/client id set', async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/auth/invite' });

    expect(res.statusCode).toBe(302);
    const location = res.headers.location as string;
    expect(location).toMatch(/^https:\/\/discord\.com\/oauth2\/authorize\?/);
    expect(location).toContain('client_id=test-discord-client-id');
    expect(location).toContain('scope=bot%20applications.commands');

    const permissions = BigInt(new URL(location).searchParams.get('permissions')!);
    expect(permissions & 8n).toBe(0n); // Administrator bit (1 << 3) must never be set

    await app.close();
  });

  it('appends a validated guild_id and disable_guild_select when provided', async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/auth/invite?guild_id=123456789012345678' });

    expect(res.statusCode).toBe(302);
    const location = res.headers.location as string;
    const url = new URL(location);
    expect(url.searchParams.get('guild_id')).toBe('123456789012345678');
    expect(url.searchParams.get('disable_guild_select')).toBe('true');

    await app.close();
  });

  it('rejects a non-snowflake guild_id', async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/auth/invite?guild_id=not-a-snowflake' });

    expect(res.statusCode).toBe(400);

    await app.close();
  });
});

describe('GET /auth/discord/login — login CSRF protection', () => {
  it('sets a signed, httpOnly, SameSite=Lax oauth_state cookie whose value matches the redirect state param', async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/auth/discord/login' });

    expect(res.statusCode).toBe(302);
    const location = new URL(res.headers.location as string);
    const state = location.searchParams.get('state');
    expect(state).toBeTruthy();

    const setCookie = res.cookies.find((c) => c.name === 'oauth_state');
    expect(setCookie).toBeDefined();
    expect(setCookie?.httpOnly).toBe(true);
    expect(setCookie?.sameSite).toBe('Lax');

    await app.close();
  });
});

describe('GET /auth/discord/callback — login CSRF protection', () => {
  it('rejects the callback when there is no oauth_state cookie at all', async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/auth/discord/callback?code=abc&state=some-state' });

    expect(res.statusCode).toBe(400);

    await app.close();
  });

  it("rejects the callback when the cookie's state does not match the query state (classic login CSRF: attacker's captured code+state loaded in a victim's browser)", async () => {
    const { app } = await buildTestApp();
    const cookieValue = app.signCookie('the-state-that-was-actually-started-in-this-browser');
    const res = await app.inject({
      method: 'GET',
      url: '/auth/discord/callback?code=abc&state=attacker-captured-state',
      headers: { cookie: `oauth_state=${cookieValue}` },
    });

    expect(res.statusCode).toBe(400);

    await app.close();
  });

  it('rejects a tampered/garbage oauth_state cookie the same as a missing one', async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({
      method: 'GET',
      url: '/auth/discord/callback?code=abc&state=some-state',
      headers: { cookie: 'oauth_state=not-a-real-signed-value' },
    });

    expect(res.statusCode).toBe(400);

    await app.close();
  });
});
