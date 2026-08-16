import type { ZodFastifyInstance } from '../lib/http';
import { z } from 'zod';
import { AuditAction, ValidationError, encryptSecret, env, redisKey } from '@entrophy/core';
import { writeDashboardAudit } from '../lib/audit';
import { OAUTH_PROVIDER_IDS, PROVIDER_ENUM_MAP, exchangeProviderCode, type OAuthProviderId } from '../lib/integrations/providers';

const paramsSchema = z.object({ provider: z.enum(OAUTH_PROVIDER_IDS as [OAuthProviderId, ...OAuthProviderId[]]) });
const querySchema = z.object({ code: z.string().min(1), state: z.string().min(1) });

interface OAuthStatePayload {
  guildId: string;
  provider: OAuthProviderId;
  userId: string;
}

/** `/integrations/:provider/callback` — NOT guild-scoped in the URL (state carries the guildId) (ARCHITECTURE.md §10). */
export default async function oauthIntegrationsRoutes(app: ZodFastifyInstance): Promise<void> {
  app.get('/:provider/callback', { schema: { params: paramsSchema, querystring: querySchema } }, async (request, reply) => {
    const { provider } = request.params as { provider: OAuthProviderId };
    const { code, state } = request.query as { code: string; state: string };

    const stateKey = redisKey('oauthstate', 'integration', state);
    const raw = await app.redis.get(stateKey);
    if (!raw) {
      throw new ValidationError('This integration link has expired or was already used. Please reconnect from the dashboard.');
    }
    await app.redis.del(stateKey);
    const payload = JSON.parse(raw) as OAuthStatePayload;
    if (payload.provider !== provider) {
      throw new ValidationError('Provider mismatch on integration callback.');
    }

    const redirectUri = `${env.API_BASE_URL ?? ''}/integrations/${provider}/callback`;
    const token = await exchangeProviderCode(provider, code, redirectUri);

    const connection = await app.prisma.integrationConnection.create({
      data: { guildId: payload.guildId, provider: PROVIDER_ENUM_MAP[provider], status: 'CONNECTED', config: {}, connectedBy: payload.userId },
    });

    await app.prisma.oAuthToken.create({
      data: {
        connectionId: connection.id,
        accessTokenEnc: encryptSecret(token.accessToken),
        refreshTokenEnc: token.refreshToken ? encryptSecret(token.refreshToken) : undefined,
        tokenType: token.tokenType,
        scopes: token.scope ? token.scope.split(' ').filter(Boolean) : [],
        expiresAt: token.expiresIn ? new Date(Date.now() + token.expiresIn * 1000) : undefined,
      },
    });

    await writeDashboardAudit(app.prisma, {
      guildId: payload.guildId,
      actorId: payload.userId,
      action: AuditAction.IntegrationConnect,
      targetType: 'integration_connection',
      targetId: connection.id,
      after: { provider },
    });

    reply.redirect(`${env.DASHBOARD_URL}/dashboard/${payload.guildId}/integrations?connected=${provider}`);
  });
}
