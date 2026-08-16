import { describe, expect, it } from 'vitest';
import { redisKey } from '@entrophy/core';
import { buildTestApp, loginAs } from './helpers/build-test-app';

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
