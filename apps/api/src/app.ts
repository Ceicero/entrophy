import { randomUUID } from 'node:crypto';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type Redis from 'ioredis';
import type { Logger } from 'pino';
import {
  ConfigError,
  createLogger,
  createPlatformEvents,
  createRedis,
  env,
  isProduction,
  toPublicError,
} from '@entrophy/core';
import { prisma as sharedPrisma, type PrismaClient } from '@entrophy/database';
import { createGuildConfigStore } from './lib/config-store';
import { csrfProtection } from './lib/csrf';
import type { ZodFastifyInstance } from './lib/http';
import { QueueRegistry, type QueueRegistryLike } from './lib/queues';
import { getSession, SESSION_COOKIE_NAME } from './lib/session';

import authRoutes from './routes/auth';
import guildsRoutes from './routes/guilds';
import pluginsRoutes from './routes/plugins';
import auditRoutes from './routes/audit';
import moderationRoutes from './routes/moderation';
import automodRoutes from './routes/automod';
import loggingRoutes from './routes/logging';
import ticketsRoutes from './routes/tickets';
import rolesRoutes from './routes/roles';
import engagementRoutes from './routes/engagement';
import communityRoutes from './routes/community';
import integrationsRoutes from './routes/integrations';
import oauthIntegrationsRoutes from './routes/oauth-integrations';
import aiRoutes from './routes/ai';
import analyticsRoutes from './routes/analytics';
import privacyRoutes from './routes/privacy';
import discordRoutes from './routes/discord';
import webhooksRoutes from './routes/webhooks';
import enforcerRoutes from './routes/enforcer';
import donationsRoutes from './routes/donations';
import verifyRoutes from './routes/verify';

export interface BuildAppDeps {
  prisma?: PrismaClient;
  redis?: Redis;
  queues?: QueueRegistryLike;
  /** Defaults to `createLogger('api')`. Tests inject a silent logger to avoid pino-pretty's worker-thread transport startup cost. */
  logger?: Logger;
}

/**
 * Builds (but does not start listening on) the Fastify API app. Accepts injected `prisma`/`redis`/`queues`
 * so tests can pass a fake Prisma client and `ioredis-mock` instead of touching real infrastructure
 * (ARCHITECTURE.md §10).
 */
/**
 * Cross-site cookies (`SESSION_COOKIE_SAMESITE=none`) require the session cookie to be `Secure`, which browsers
 * only honor over https — so refuse to start rather than silently issue a cookie the browser will drop
 * (ARCHITECTURE.md §21). A bare hostname (no scheme, e.g. local testing shorthand) is treated as non-https.
 */
function assertSameSiteNoneIsServeable(): void {
  if (env.SESSION_COOKIE_SAMESITE !== 'none') return;
  if (!env.API_BASE_URL || !env.API_BASE_URL.startsWith('https://')) {
    throw new ConfigError(
      'SESSION_COOKIE_SAMESITE=none requires API_BASE_URL to be an https:// URL (cross-site cookies must be Secure). ' +
        `Got API_BASE_URL=${env.API_BASE_URL ?? '(unset)'}.`,
    );
  }
}

export async function buildApp(deps: BuildAppDeps = {}): Promise<ZodFastifyInstance> {
  assertSameSiteNoneIsServeable();

  const prisma = deps.prisma ?? sharedPrisma;
  const redis = deps.redis ?? createRedis(env.REDIS_URL ?? 'redis://localhost:6379');
  const queues = deps.queues ?? new QueueRegistry(redis);

  const app = Fastify({
    loggerInstance: deps.logger ?? createLogger('api'),
    genReqId: () => randomUUID(),
    trustProxy: env.TRUST_PROXY,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const events = createPlatformEvents();
  const { store: configStore, registry } = createGuildConfigStore(prisma, redis, events);

  app.decorate('prisma', prisma);
  app.decorate('redis', redis);
  app.decorate('queues', queues);
  app.decorate('configStore', configStore);
  app.decorate('registry', registry);
  app.decorateRequest('session', null);

  await app.register(helmet, {
    contentSecurityPolicy: false, // this process only ever serves JSON + the swagger UI at /docs
  });

  const corsAllowlist = [env.DASHBOARD_URL, env.WEB_URL].filter((url): url is string => Boolean(url));
  await app.register(cors, {
    origin: corsAllowlist.length > 0 ? corsAllowlist : false,
    credentials: true,
  });

  await app.register(cookie, {
    secret: env.SESSION_SECRET,
    hook: 'onRequest',
  });

  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    // per-route overrides (auth routes: 20/min) are set via each route's `config.rateLimit`.
  });

  await app.register(sensible);

  await app.register(swagger, {
    openapi: {
      info: { title: 'Entrophy API', version: '0.1.0' },
      servers: [{ url: env.API_BASE_URL ?? 'http://localhost:3001' }],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  // Resolves the session for every request (used by requireAuth/requireGuildAccess/csrfProtection downstream).
  app.addHook('onRequest', async (request) => {
    const raw = request.cookies[SESSION_COOKIE_NAME];
    if (!raw) {
      request.session = null;
      return;
    }
    const unsigned = request.unsignCookie(raw);
    if (!unsigned.valid || !unsigned.value) {
      request.session = null;
      return;
    }
    request.session = await getSession(redis, unsigned.value);
  });

  app.addHook('preHandler', csrfProtection);

  // Fastify snapshots each route's error/not-found handler into its compiled context at `register()` time,
  // per Fastify's plugin encapsulation model — so these MUST be set before any route plugin (`app.register(authRoutes, ...)`
  // etc, below) is registered, or those routes keep using Fastify's built-in defaults regardless of what's
  // set here afterwards.
  app.setNotFoundHandler((request, reply) => {
    reply
      .status(404)
      .send({ error: { code: 'not_found', message: `Route ${request.method} ${request.url} not found.` } });
  });

  app.setErrorHandler((err, request, reply) => {
    // fastify-type-provider-zod's validatorCompiler doesn't throw a raw ZodError (which `toPublicError`
    // knows how to shape) — Fastify wraps its per-issue output into a standard `FST_ERR_VALIDATION` error
    // with an `err.validation` array instead. Normalize that into the same `validation_error` 400 shape.
    const validation = (
      err as {
        validation?: {
          message: string;
          instancePath: string;
          params?: { issue?: { path?: (string | number)[] } };
        }[];
      }
    ).validation;
    if (Array.isArray(validation)) {
      const body = {
        error: {
          code: 'validation_error',
          message: 'Validation failed.',
          details: {
            issues: validation.map((v) => ({
              path: v.params?.issue?.path?.join('.') ?? v.instancePath.replace(/^\//, '').replace(/\//g, '.'),
              message: v.message,
            })),
          },
        },
      };
      request.log.info({ code: body.error.code }, 'Request validation error');
      reply.status(400).send(body);
      return;
    }

    const { status, body } = toPublicError(err);
    if (status >= 500) {
      request.log.error({ err }, 'Unhandled API error');
    } else {
      request.log.info({ code: body.error.code }, 'Request error');
    }
    reply.status(status).send(body);
  });

  app.get('/health', { config: { rateLimit: false } }, async (_request, reply) => {
    const checks = { db: false, redis: false };
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.db = true;
    } catch {
      checks.db = false;
    }
    try {
      checks.redis = (await redis.ping()) === 'PONG';
    } catch {
      checks.redis = false;
    }
    const healthy = checks.db && checks.redis;
    reply.status(healthy ? 200 : 503);
    return { status: healthy ? 'ok' : 'degraded', checks };
  });

  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(guildsRoutes, { prefix: '/guilds' });
  await app.register(pluginsRoutes, { prefix: '/guilds' });
  await app.register(auditRoutes, { prefix: '/guilds' });
  await app.register(moderationRoutes, { prefix: '/guilds' });
  await app.register(automodRoutes, { prefix: '/guilds' });
  await app.register(loggingRoutes, { prefix: '/guilds' });
  await app.register(ticketsRoutes, { prefix: '/guilds' });
  await app.register(rolesRoutes, { prefix: '/guilds' });
  await app.register(engagementRoutes, { prefix: '/guilds' });
  await app.register(communityRoutes, { prefix: '/guilds' });
  await app.register(integrationsRoutes, { prefix: '/guilds' });
  await app.register(aiRoutes, { prefix: '/guilds' });
  await app.register(analyticsRoutes, { prefix: '/guilds' });
  await app.register(privacyRoutes, { prefix: '/guilds' });
  await app.register(discordRoutes, { prefix: '/guilds' });
  await app.register(enforcerRoutes, { prefix: '/guilds' });
  await app.register(oauthIntegrationsRoutes, { prefix: '/integrations' });
  await app.register(donationsRoutes, { prefix: '/donations' });
  await app.register(webhooksRoutes, { prefix: '/webhooks', bodyLimit: 5 * 1024 * 1024 });
  await app.register(verifyRoutes, { prefix: '/verify' });

  app.addHook('onClose', async () => {
    if (!deps.queues) {
      await (queues as QueueRegistry).closeAll?.();
    }
  });

  return app;
}

export { isProduction };
