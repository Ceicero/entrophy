import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance, RawServerDefault } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Logger } from 'pino';

/**
 * The exact `FastifyInstance` shape `buildApp()` produces (`Fastify({ loggerInstance: <pino Logger> }).withTypeProvider<ZodTypeProvider>()`).
 * Route-registration functions must type their `app` parameter as this — not the bare `FastifyInstance` default
 * — or Fastify's zod type provider can't infer `request.body`/`query`/`params` from each route's `schema`,
 * and `app.register(...)` back in `app.ts` fails to typecheck against the real (pino-logger, zod-provider) instance.
 */
export type ZodFastifyInstance = FastifyInstance<
  RawServerDefault,
  IncomingMessage,
  ServerResponse<IncomingMessage>,
  Logger,
  ZodTypeProvider
>;
