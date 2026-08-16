import { randomBytes } from 'node:crypto';
import type { ZodFastifyInstance } from '../lib/http';
import { z } from 'zod';
import { AuditAction, ExternalServiceError, NotFoundError, ValidationError, encryptSecret, env, redisKey } from '@entrophy/core';
import type { IntegrationConnectionDto, WebhookEndpointDto } from '@entrophy/types';
import { writeDashboardAudit } from '../lib/audit';
import { toIntegrationConnectionDto, toWebhookEndpointDto } from '../lib/dto';
import { requireGuildAccess } from '../lib/guild-access';
import {
  OAUTH_PROVIDER_IDS,
  PROVIDER_ENUM_MAP,
  WEBHOOK_PROVIDER_IDS,
  buildProviderAuthorizeUrl,
  isOAuthProvider,
  isOAuthProviderConfigured,
  isWebhookProvider,
  type IntegrationProviderId,
} from '../lib/integrations/providers';
import { guildIdParamSchema } from '../lib/schemas';

const ALL_PROVIDER_IDS = [...OAUTH_PROVIDER_IDS, ...WEBHOOK_PROVIDER_IDS] as [IntegrationProviderId, ...IntegrationProviderId[]];
const providerParamSchema = guildIdParamSchema.extend({ provider: z.enum(ALL_PROVIDER_IDS) });
const connectionParamSchema = guildIdParamSchema.extend({ connectionId: z.string().min(1) });
const endpointParamSchema = guildIdParamSchema.extend({ endpointId: z.string().min(1) });
const webhookCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  provider: z.string().trim().max(50).default('generic'),
  events: z.array(z.string()).default([]),
  channelId: z.string().nullable().optional(),
});

function webhookPathFor(provider: IntegrationProviderId, endpointId: string): string {
  if (provider === 'github') return `/webhooks/github/${endpointId}`;
  return `/webhooks/generic/${endpointId}`;
}

/** `/guilds/:guildId/integrations` — connection list/connect/disconnect/status, and inbound webhook endpoint CRUD (ARCHITECTURE.md §10). */
export default async function integrationsRoutes(app: ZodFastifyInstance): Promise<void> {
  app.get('/:guildId/integrations', { schema: { params: guildIdParamSchema }, preHandler: requireGuildAccess() }, async (request): Promise<IntegrationConnectionDto[]> => {
    const rows = await app.prisma.integrationConnection.findMany({ where: { guildId: request.guildId!, deletedAt: null }, orderBy: { createdAt: 'desc' } });
    return rows.map(toIntegrationConnectionDto);
  });

  app.post('/:guildId/integrations/:provider/connect', { schema: { params: providerParamSchema }, preHandler: requireGuildAccess() }, async (request) => {
    const guildId = request.guildId!;
    const session = request.session!;
    const { provider } = request.params as { provider: IntegrationProviderId };

    if (isOAuthProvider(provider)) {
      if (!isOAuthProviderConfigured(provider)) {
        throw new ExternalServiceError(`${provider} is not configured on this server.`);
      }
      const state = randomBytes(24).toString('hex');
      await app.redis.set(
        redisKey('oauthstate', 'integration', state),
        JSON.stringify({ guildId, provider, userId: session.userId }),
        'EX',
        600,
      );
      const redirectUri = `${env.API_BASE_URL ?? ''}/integrations/${provider}/callback`;
      return { url: buildProviderAuthorizeUrl(provider, state, redirectUri) };
    }

    if (isWebhookProvider(provider)) {
      const connection = await app.prisma.integrationConnection.create({
        data: { guildId, provider: PROVIDER_ENUM_MAP[provider], status: 'CONNECTED', config: {}, connectedBy: session.userId },
      });

      let endpointDto: WebhookEndpointDto | null = null;
      let secret: string | undefined;
      let webhookUrl: string | null = null;

      if (provider === 'stripe') {
        // Stripe is verified globally via STRIPE_WEBHOOK_SECRET at a single shared endpoint — no per-guild secret to hand out.
        webhookUrl = `${env.API_BASE_URL ?? ''}/webhooks/stripe`;
      } else {
        secret = randomBytes(32).toString('hex');
        const endpointRow = await app.prisma.webhookEndpoint.create({
          data: { guildId, direction: 'INBOUND', provider, name: `${provider} webhook`, secretEnc: encryptSecret(secret), events: [] },
        });
        endpointDto = toWebhookEndpointDto(endpointRow);
        webhookUrl = `${env.API_BASE_URL ?? ''}${webhookPathFor(provider, endpointRow.id)}`;
      }

      await writeDashboardAudit(app.prisma, {
        guildId,
        actorId: session.userId,
        action: AuditAction.IntegrationConnect,
        targetType: 'integration_connection',
        targetId: connection.id,
        after: { provider },
      });

      // `secret` is returned exactly once here — it is never retrievable again (only the encrypted form is stored).
      return { connection: toIntegrationConnectionDto(connection), endpoint: endpointDto, webhookUrl, secret };
    }

    throw new ValidationError('Unknown integration provider.');
  });

  app.post('/:guildId/integrations/:connectionId/disconnect', { schema: { params: connectionParamSchema }, preHandler: requireGuildAccess() }, async (request) => {
    const guildId = request.guildId!;
    const session = request.session!;
    const { connectionId } = request.params as { connectionId: string };
    const existing = await app.prisma.integrationConnection.findFirst({ where: { id: connectionId, guildId, deletedAt: null } });
    if (!existing) throw new NotFoundError('Integration connection not found.');

    await app.prisma.integrationConnection.update({ where: { id: connectionId }, data: { status: 'DISCONNECTED' } });
    await app.prisma.oAuthToken.deleteMany({ where: { connectionId } });

    await writeDashboardAudit(app.prisma, {
      guildId,
      actorId: session.userId,
      action: AuditAction.IntegrationDisconnect,
      targetType: 'integration_connection',
      targetId: connectionId,
    });

    return { ok: true };
  });

  app.get('/:guildId/integrations/:connectionId/status', { schema: { params: connectionParamSchema }, preHandler: requireGuildAccess() }, async (request) => {
    const guildId = request.guildId!;
    const { connectionId } = request.params as { connectionId: string };
    const row = await app.prisma.integrationConnection.findFirst({ where: { id: connectionId, guildId } });
    if (!row) throw new NotFoundError('Integration connection not found.');
    return { ...toIntegrationConnectionDto(row), lastSyncAt: row.lastSyncAt ? row.lastSyncAt.toISOString() : null, lastError: row.lastError };
  });

  app.get('/:guildId/integrations/webhooks', { schema: { params: guildIdParamSchema }, preHandler: requireGuildAccess() }, async (request): Promise<WebhookEndpointDto[]> => {
    const rows = await app.prisma.webhookEndpoint.findMany({ where: { guildId: request.guildId!, deletedAt: null }, orderBy: { createdAt: 'desc' } });
    return rows.map(toWebhookEndpointDto);
  });

  app.post(
    '/:guildId/integrations/webhooks',
    { schema: { params: guildIdParamSchema, body: webhookCreateSchema }, preHandler: requireGuildAccess() },
    async (request, reply) => {
      const guildId = request.guildId!;
      const session = request.session!;
      const secret = randomBytes(32).toString('hex');
      const row = await app.prisma.webhookEndpoint.create({
        data: {
          guildId,
          direction: 'INBOUND',
          provider: request.body.provider,
          name: request.body.name,
          events: request.body.events,
          channelId: request.body.channelId,
          secretEnc: encryptSecret(secret),
        },
      });

      await writeDashboardAudit(app.prisma, {
        guildId,
        actorId: session.userId,
        action: AuditAction.IntegrationWebhookCreate,
        targetType: 'webhook_endpoint',
        targetId: row.id,
        after: { name: row.name, provider: row.provider },
      });

      reply.status(201);
      return { ...toWebhookEndpointDto(row), secret, url: `${env.API_BASE_URL ?? ''}/webhooks/generic/${row.id}` };
    },
  );

  app.delete('/:guildId/integrations/webhooks/:endpointId', { schema: { params: endpointParamSchema }, preHandler: requireGuildAccess() }, async (request, reply) => {
    const guildId = request.guildId!;
    const session = request.session!;
    const { endpointId } = request.params as { endpointId: string };
    const existing = await app.prisma.webhookEndpoint.findFirst({ where: { id: endpointId, guildId, deletedAt: null } });
    if (!existing) throw new NotFoundError('Webhook endpoint not found.');

    await app.prisma.webhookEndpoint.update({ where: { id: endpointId }, data: { deletedAt: new Date(), enabled: false } });
    await writeDashboardAudit(app.prisma, {
      guildId,
      actorId: session.userId,
      action: AuditAction.IntegrationWebhookDelete,
      targetType: 'webhook_endpoint',
      targetId: endpointId,
    });
    reply.status(204);
    return null;
  });
}
