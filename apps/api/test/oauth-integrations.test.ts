import { afterEach, describe, expect, it, vi } from 'vitest';
import { env, redisKey } from '@entrophy/core';
import { buildTestApp, loginAs } from './helpers/build-test-app';
import { exchangeProviderCode } from '../src/lib/integrations/providers';

const GUILD_ID = '888888888888888888';
const INITIATOR_ID = '111111111111111111';
const VICTIM_ID = '222222222222222222';
const STATE = 'test-integration-state-token';

async function seedPendingState(redis: any, overrides: Record<string, unknown> = {}) {
  await redis.set(
    redisKey('oauthstate', 'integration', STATE),
    JSON.stringify({ guildId: GUILD_ID, provider: 'twitch', userId: INITIATOR_ID, ...overrides }),
    'EX',
    600,
  );
}

describe('GET /integrations/:provider/callback — account-linking CSRF guard', () => {
  it('rejects the callback when there is no session at all', async () => {
    const { app, redis } = await buildTestApp();
    await seedPendingState(redis);

    const res = await app.inject({
      method: 'GET',
      url: `/integrations/twitch/callback?code=abc&state=${STATE}`,
    });

    expect(res.statusCode).toBe(401);
    // The state must still be consumable — it should NOT have been deleted by an unauthenticated attempt.
    expect(await redis.get(redisKey('oauthstate', 'integration', STATE))).not.toBeNull();
  });

  it('rejects the callback when the logged-in user is not the one who started the flow', async () => {
    const { app, redis } = await buildTestApp();
    await seedPendingState(redis);
    const { cookieHeader } = await loginAs(app, redis, { userId: VICTIM_ID });

    const res = await app.inject({
      method: 'GET',
      url: `/integrations/twitch/callback?code=abc&state=${STATE}`,
      headers: { cookie: cookieHeader },
    });

    expect(res.statusCode).toBe(403);

    const { prisma } = await buildTestApp();
    const connections = await prisma.integrationConnection.findMany({ where: { guildId: GUILD_ID } });
    expect(connections).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// `exchangeProviderCode` scope normalization — root cause of the `token.scope.split is not a function`
// production bug (Twitch's real `POST /oauth2/token` returns `scope` as a JSON array of strings, not a
// space-delimited string like every other provider here). Covers both shapes so a regression on either one
// fails a unit test instead of only surfacing in production.
// ---------------------------------------------------------------------------

describe('exchangeProviderCode — scope normalization', () => {
  const ORIGINAL_REDDIT_CLIENT_ID = env.REDDIT_CLIENT_ID;
  const ORIGINAL_REDDIT_CLIENT_SECRET = env.REDDIT_CLIENT_SECRET;
  const ORIGINAL_TWITCH_CLIENT_ID = env.TWITCH_CLIENT_ID;
  const ORIGINAL_TWITCH_CLIENT_SECRET = env.TWITCH_CLIENT_SECRET;

  afterEach(() => {
    env.REDDIT_CLIENT_ID = ORIGINAL_REDDIT_CLIENT_ID;
    env.REDDIT_CLIENT_SECRET = ORIGINAL_REDDIT_CLIENT_SECRET;
    env.TWITCH_CLIENT_ID = ORIGINAL_TWITCH_CLIENT_ID;
    env.TWITCH_CLIENT_SECRET = ORIGINAL_TWITCH_CLIENT_SECRET;
    vi.unstubAllGlobals();
  });

  function stubTokenResponse(body: unknown): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }),
      ),
    );
  }

  it('normalizes a space-delimited string scope (Reddit, and every other non-Twitch provider here) into string[]', async () => {
    env.REDDIT_CLIENT_ID = 'test-reddit-client-id';
    env.REDDIT_CLIENT_SECRET = 'test-reddit-client-secret';
    stubTokenResponse({
      access_token: 'reddit-access-token',
      refresh_token: 'reddit-refresh-token',
      expires_in: 3600,
      token_type: 'bearer',
      scope: 'identity read', // Reddit's real token response shape: a space-delimited string.
    });

    const token = await exchangeProviderCode(
      'reddit',
      'code123',
      'https://api.example.com/integrations/reddit/callback',
    );
    expect(token.scopes).toEqual(['identity', 'read']);
  });

  it("normalizes a JSON array scope (Twitch's real shape — the bug this covers) into the same string[] shape", async () => {
    env.TWITCH_CLIENT_ID = 'test-twitch-client-id';
    env.TWITCH_CLIENT_SECRET = 'test-twitch-client-secret';
    stubTokenResponse({
      access_token: 'twitch-access-token',
      refresh_token: 'twitch-refresh-token',
      expires_in: 14400,
      token_type: 'bearer',
      scope: ['user:read:chat', 'user:write:chat', 'user:bot'], // Twitch always returns an array, never a string.
    });

    const token = await exchangeProviderCode(
      'twitch',
      'code456',
      'https://api.example.com/integrations/twitch/callback',
    );
    expect(token.scopes).toEqual(['user:read:chat', 'user:write:chat', 'user:bot']);
  });

  it('normalizes an absent scope into an empty array', async () => {
    env.REDDIT_CLIENT_ID = 'test-reddit-client-id';
    env.REDDIT_CLIENT_SECRET = 'test-reddit-client-secret';
    stubTokenResponse({ access_token: 'tok', expires_in: 3600, token_type: 'bearer' });

    const token = await exchangeProviderCode(
      'reddit',
      'code789',
      'https://api.example.com/integrations/reddit/callback',
    );
    expect(token.scopes).toEqual([]);
  });
});
