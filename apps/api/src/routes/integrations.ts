import { randomBytes } from 'node:crypto';
import type { ZodFastifyInstance } from '../lib/http';
import { z } from 'zod';
import {
  AuditAction,
  ExternalServiceError,
  NotFoundError,
  ValidationError,
  assertPublicHttpUrl,
  encryptSecret,
  env,
  redisKey,
} from '@entrophy/core';
import type { WebhookEndpointDto } from '@entrophy/types';
import type {
  IntegrationConnectionDetailDto,
  IntegrationProviderInfoDto,
  WebhookDeliveryDto,
  WebhookEndpointDetailDto,
} from '@entrophy/types/integrations';
import { writeDashboardAudit } from '../lib/audit';
import { toIntegrationConnectionDto, toWebhookEndpointDto } from '../lib/dto';
import {
  toIntegrationConnectionDetailDto,
  toWebhookDeliveryDto,
  toWebhookEndpointDetailDto,
} from '../lib/integrations/dto';
import { requireGuildAccess } from '../lib/guild-access';
import {
  ALERT_PROVIDER_IDS,
  CANONICAL_PROVIDER_ENUM_MAP,
  OAUTH_PROVIDER_IDS,
  PROVIDER_ENUM_MAP,
  WEBHOOK_PROVIDER_IDS,
  buildProviderAuthorizeUrl,
  isOAuthProvider,
  isOAuthProviderConfigured,
  isWebhookProvider,
  listProviderAvailability,
  type AlertProviderId,
  type IntegrationProviderId,
} from '../lib/integrations/providers';
import { OUTBOUND_PLATFORM_EVENTS } from '../lib/integrations/outbound-events';
import { guildIdParamSchema, snowflakeSchema } from '../lib/schemas';

const ALL_PROVIDER_IDS = [...OAUTH_PROVIDER_IDS, ...WEBHOOK_PROVIDER_IDS] as [
  IntegrationProviderId,
  ...IntegrationProviderId[],
];
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

const alertCreateSchema = z.object({
  provider: z.enum(ALERT_PROVIDER_IDS as [AlertProviderId, ...AlertProviderId[]]),
  target: z.string().trim().min(1).max(200),
  channelId: snowflakeSchema,
  roleId: snowflakeSchema.nullable().optional(),
  template: z.string().max(300).nullable().optional(),
});
const alertsListQuerySchema = z.object({
  provider: z.enum(ALERT_PROVIDER_IDS as [AlertProviderId, ...AlertProviderId[]]).optional(),
});

const outboundCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  url: z.string().url(),
  events: z.array(z.enum(OUTBOUND_PLATFORM_EVENTS)).min(1),
});

const deliveriesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/** `/guilds/:guildId/integrations` — connection list/connect/disconnect/status, and inbound webhook endpoint CRUD (ARCHITECTURE.md §10). */
export default async function integrationsRoutes(app: ZodFastifyInstance): Promise<void> {
  app.get(
    '/:guildId/integrations',
    { schema: { params: guildIdParamSchema }, preHandler: requireGuildAccess() },
    async (request): Promise<IntegrationConnectionDetailDto[]> => {
      const rows = await app.prisma.integrationConnection.findMany({
        where: { guildId: request.guildId!, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toIntegrationConnectionDetailDto);
    },
  );

  app.post(
    '/:guildId/integrations/:provider/connect',
    { schema: { params: providerParamSchema }, preHandler: requireGuildAccess() },
    async (request) => {
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
          data: {
            guildId,
            provider: PROVIDER_ENUM_MAP[provider],
            status: 'CONNECTED',
            config: {},
            connectedBy: session.userId,
          },
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
            data: {
              guildId,
              direction: 'INBOUND',
              provider,
              name: `${provider} webhook`,
              secretEnc: encryptSecret(secret),
              events: [],
            },
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
        return {
          connection: toIntegrationConnectionDto(connection),
          endpoint: endpointDto,
          webhookUrl,
          secret,
        };
      }

      throw new ValidationError('Unknown integration provider.');
    },
  );

  app.post(
    '/:guildId/integrations/:connectionId/disconnect',
    { schema: { params: connectionParamSchema }, preHandler: requireGuildAccess() },
    async (request) => {
      const guildId = request.guildId!;
      const session = request.session!;
      const { connectionId } = request.params as { connectionId: string };
      const existing = await app.prisma.integrationConnection.findFirst({
        where: { id: connectionId, guildId, deletedAt: null },
      });
      if (!existing) throw new NotFoundError('Integration connection not found.');

      await app.prisma.integrationConnection.update({
        where: { id: connectionId },
        data: { status: 'DISCONNECTED' },
      });
      await app.prisma.oAuthToken.deleteMany({ where: { connectionId } });

      await writeDashboardAudit(app.prisma, {
        guildId,
        actorId: session.userId,
        action: AuditAction.IntegrationDisconnect,
        targetType: 'integration_connection',
        targetId: connectionId,
      });

      return { ok: true };
    },
  );

  app.get(
    '/:guildId/integrations/:connectionId/status',
    { schema: { params: connectionParamSchema }, preHandler: requireGuildAccess() },
    async (request) => {
      const guildId = request.guildId!;
      const { connectionId } = request.params as { connectionId: string };
      const row = await app.prisma.integrationConnection.findFirst({ where: { id: connectionId, guildId } });
      if (!row) throw new NotFoundError('Integration connection not found.');
      return toIntegrationConnectionDetailDto(row);
    },
  );

  // Inbound endpoints only — outbound endpoints have their own `/integrations/outbound` list below, so the
  // dashboard's Webhooks tab can show "inbound" and "outbound" as separate, non-overlapping lists.
  app.get(
    '/:guildId/integrations/webhooks',
    { schema: { params: guildIdParamSchema }, preHandler: requireGuildAccess() },
    async (request): Promise<WebhookEndpointDetailDto[]> => {
      const rows = await app.prisma.webhookEndpoint.findMany({
        where: { guildId: request.guildId!, direction: 'INBOUND', deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toWebhookEndpointDetailDto);
    },
  );

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
      return {
        ...toWebhookEndpointDto(row),
        secret,
        url: `${env.API_BASE_URL ?? ''}/webhooks/generic/${row.id}`,
      };
    },
  );

  app.delete(
    '/:guildId/integrations/webhooks/:endpointId',
    { schema: { params: endpointParamSchema }, preHandler: requireGuildAccess() },
    async (request, reply) => {
      const guildId = request.guildId!;
      const session = request.session!;
      const { endpointId } = request.params as { endpointId: string };
      const existing = await app.prisma.webhookEndpoint.findFirst({
        where: { id: endpointId, guildId, deletedAt: null },
      });
      if (!existing) throw new NotFoundError('Webhook endpoint not found.');

      await app.prisma.webhookEndpoint.update({
        where: { id: endpointId },
        data: { deletedAt: new Date(), enabled: false },
      });
      await writeDashboardAudit(app.prisma, {
        guildId,
        actorId: session.userId,
        action: AuditAction.IntegrationWebhookDelete,
        targetType: 'webhook_endpoint',
        targetId: endpointId,
      });
      reply.status(204);
      return null;
    },
  );

  // ---------------------------------------------------------------------------------------------------------
  // Provider availability (dashboard setup hints)
  // ---------------------------------------------------------------------------------------------------------

  app.get(
    '/:guildId/integrations/providers',
    { schema: { params: guildIdParamSchema }, preHandler: requireGuildAccess() },
    async (): Promise<IntegrationProviderInfoDto[]> => {
      return listProviderAvailability();
    },
  );

  // ---------------------------------------------------------------------------------------------------------
  // Alert watches (Twitch/YouTube/Reddit/Steam) — one `IntegrationConnection` row per watched target.
  // ---------------------------------------------------------------------------------------------------------

  app.get(
    '/:guildId/integrations/alerts',
    {
      schema: { params: guildIdParamSchema, querystring: alertsListQuerySchema },
      preHandler: requireGuildAccess(),
    },
    async (request): Promise<IntegrationConnectionDetailDto[]> => {
      const guildId = request.guildId!;
      const { provider } = request.query;
      const where = {
        guildId,
        deletedAt: null,
        provider: provider
          ? CANONICAL_PROVIDER_ENUM_MAP[provider]
          : { in: ALERT_PROVIDER_IDS.map((id) => CANONICAL_PROVIDER_ENUM_MAP[id]) },
      };
      const rows = await app.prisma.integrationConnection.findMany({ where, orderBy: { createdAt: 'desc' } });
      return rows.map(toIntegrationConnectionDetailDto);
    },
  );

  app.post(
    '/:guildId/integrations/alerts',
    { schema: { params: guildIdParamSchema, body: alertCreateSchema }, preHandler: requireGuildAccess() },
    async (request, reply): Promise<IntegrationConnectionDetailDto> => {
      const guildId = request.guildId!;
      const session = request.session!;
      const { provider, target, channelId, roleId, template } = request.body;

      const missingEnv = listProviderAvailability().find((p) => p.id === provider)?.missingEnv ?? [];
      const config = { target, channelId, roleId: roleId ?? null, template: template ?? null };

      const connection = await app.prisma.integrationConnection.create({
        data: {
          guildId,
          provider: CANONICAL_PROVIDER_ENUM_MAP[provider],
          label: target,
          status: missingEnv.length === 0 ? 'CONNECTED' : 'ERROR',
          config,
          connectedBy: session.userId,
          lastError:
            missingEnv.length > 0 ? `Missing environment variable(s): ${missingEnv.join(', ')}.` : null,
        },
      });

      await writeDashboardAudit(app.prisma, {
        guildId,
        actorId: session.userId,
        action: AuditAction.IntegrationConnect,
        targetType: 'integration_connection',
        targetId: connection.id,
        after: { provider, target, channelId },
      });

      reply.status(201);
      return toIntegrationConnectionDetailDto(connection);
    },
  );

  app.delete(
    '/:guildId/integrations/alerts/:connectionId',
    { schema: { params: connectionParamSchema }, preHandler: requireGuildAccess() },
    async (request, reply) => {
      const guildId = request.guildId!;
      const session = request.session!;
      const { connectionId } = request.params as { connectionId: string };
      const existing = await app.prisma.integrationConnection.findFirst({
        where: { id: connectionId, guildId, deletedAt: null },
      });
      if (!existing) throw new NotFoundError('Alert connection not found.');

      await app.prisma.integrationConnection.update({
        where: { id: connectionId },
        data: { status: 'DISCONNECTED', deletedAt: new Date() },
      });
      await writeDashboardAudit(app.prisma, {
        guildId,
        actorId: session.userId,
        action: AuditAction.IntegrationDisconnect,
        targetType: 'integration_connection',
        targetId: connectionId,
      });

      reply.status(204);
      return null;
    },
  );

  // ---------------------------------------------------------------------------------------------------------
  // Outbound webhooks
  // ---------------------------------------------------------------------------------------------------------

  app.get(
    '/:guildId/integrations/outbound',
    { schema: { params: guildIdParamSchema }, preHandler: requireGuildAccess() },
    async (request): Promise<WebhookEndpointDetailDto[]> => {
      const rows = await app.prisma.webhookEndpoint.findMany({
        where: { guildId: request.guildId!, direction: 'OUTBOUND', deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toWebhookEndpointDetailDto);
    },
  );

  app.post(
    '/:guildId/integrations/outbound',
    { schema: { params: guildIdParamSchema, body: outboundCreateSchema }, preHandler: requireGuildAccess() },
    async (request, reply) => {
      const guildId = request.guildId!;
      const session = request.session!;
      const { name, url, events } = request.body;

      try {
        await assertPublicHttpUrl(url); // validated at creation AND again before every send (apps/bot's delivery.ts)
      } catch (err) {
        throw new ValidationError(err instanceof Error ? err.message : 'That URL was rejected.');
      }

      const secret = randomBytes(32).toString('hex');
      const endpoint = await app.prisma.webhookEndpoint.create({
        data: {
          guildId,
          direction: 'OUTBOUND',
          provider: 'generic',
          name,
          url,
          events,
          secretEnc: encryptSecret(secret),
        },
      });

      await writeDashboardAudit(app.prisma, {
        guildId,
        actorId: session.userId,
        action: AuditAction.IntegrationWebhookCreate,
        targetType: 'webhook_endpoint',
        targetId: endpoint.id,
        after: { name, events, direction: 'outbound' },
      });

      reply.status(201);
      return { ...toWebhookEndpointDetailDto(endpoint), secret };
    },
  );

  app.delete(
    '/:guildId/integrations/outbound/:endpointId',
    { schema: { params: endpointParamSchema }, preHandler: requireGuildAccess() },
    async (request, reply) => {
      const guildId = request.guildId!;
      const session = request.session!;
      const { endpointId } = request.params as { endpointId: string };
      const existing = await app.prisma.webhookEndpoint.findFirst({
        where: { id: endpointId, guildId, direction: 'OUTBOUND', deletedAt: null },
      });
      if (!existing) throw new NotFoundError('Outbound webhook not found.');

      await app.prisma.webhookEndpoint.update({
        where: { id: endpointId },
        data: { deletedAt: new Date(), enabled: false },
      });
      await writeDashboardAudit(app.prisma, {
        guildId,
        actorId: session.userId,
        action: AuditAction.IntegrationWebhookDelete,
        targetType: 'webhook_endpoint',
        targetId: endpointId,
      });

      reply.status(204);
      return null;
    },
  );

  app.post(
    '/:guildId/integrations/outbound/:endpointId/test',
    { schema: { params: endpointParamSchema }, preHandler: requireGuildAccess() },
    async (request) => {
      const guildId = request.guildId!;
      const session = request.session!;
      const { endpointId } = request.params as { endpointId: string };
      const existing = await app.prisma.webhookEndpoint.findFirst({
        where: { id: endpointId, guildId, direction: 'OUTBOUND', deletedAt: null },
      });
      if (!existing) throw new NotFoundError('Outbound webhook not found.');

      await app.queues.botActions().add('integrations.testWebhook', {
        type: 'integrations.testWebhook',
        guildId,
        payload: { endpointId },
        requestedBy: session.userId,
      });

      return { queued: true };
    },
  );

  app.get(
    '/:guildId/integrations/outbound/:endpointId/deliveries',
    {
      schema: { params: endpointParamSchema, querystring: deliveriesQuerySchema },
      preHandler: requireGuildAccess(),
    },
    async (request): Promise<{ items: WebhookDeliveryDto[]; nextCursor: string | null }> => {
      const guildId = request.guildId!;
      const { endpointId } = request.params as { endpointId: string };
      const { cursor, limit = 25 } = request.query;

      const endpoint = await app.prisma.webhookEndpoint.findFirst({
        where: { id: endpointId, guildId, direction: 'OUTBOUND' },
      });
      if (!endpoint) throw new NotFoundError('Outbound webhook not found.');

      const rows = await app.prisma.webhookDelivery.findMany({
        where: { endpointId },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      return {
        items: items.map(toWebhookDeliveryDto),
        nextCursor: hasMore ? items[items.length - 1]!.id : null,
      };
    },
  );
}
