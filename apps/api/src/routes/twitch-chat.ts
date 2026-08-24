import { randomBytes } from 'node:crypto';
import type { ZodFastifyInstance } from '../lib/http';
import { z } from 'zod';
import { AppError, ExternalServiceError, NotFoundError, env, redisKey } from '@entrophy/core';
import { Prisma, type TwitchChatLevel as PrismaTwitchChatLevel } from '@entrophy/database';
import type {
  TwitchChatChannelDto,
  TwitchChatCommandDto,
  TwitchChatLevelId,
  TwitchChatStatusDto,
  TwitchChatTimerDto,
} from '@entrophy/types/integrations';
import { writeDashboardAudit } from '../lib/audit';
import { requireGuildAccess } from '../lib/guild-access';
import {
  toTwitchChatChannelDto,
  toTwitchChatCommandDto,
  toTwitchChatTimerDto,
} from '../lib/integrations/dto';
import { buildProviderAuthorizeUrl, isOAuthProviderConfigured } from '../lib/integrations/providers';
import { nudgeTwitchChatReconcile } from '../lib/integrations/twitch-chat-reconcile';
import {
  TWITCH_CHAT_MAX_COMMANDS_PER_CHANNEL,
  TWITCH_CHAT_MAX_TIMERS_PER_CHANNEL,
  createTwitchChatCommandSchema,
  createTwitchChatTimerSchema,
  updateTwitchChatChannelSchema,
  updateTwitchChatCommandSchema,
  updateTwitchChatTimerSchema,
} from '../lib/integrations/twitch-chat-schemas';
import { guildIdParamSchema } from '../lib/schemas';

const channelParamSchema = guildIdParamSchema.extend({ channelId: z.string().min(1) });
const commandParamSchema = guildIdParamSchema.extend({ commandId: z.string().min(1) });
const timerParamSchema = guildIdParamSchema.extend({ timerId: z.string().min(1) });

/** Reverse of `TWITCH_CHAT_LEVEL_MAP` (lib/integrations/dto.ts) — input level id -> Prisma enum, for writes. */
const TWITCH_CHAT_LEVEL_ENUM_MAP: Record<TwitchChatLevelId, PrismaTwitchChatLevel> = {
  everyone: 'EVERYONE',
  subscriber: 'SUBSCRIBER',
  vip: 'VIP',
  moderator: 'MODERATOR',
  broadcaster: 'BROADCASTER',
};

/** True for Prisma's unique-constraint-violation error (P2002) — same check as `community.ts`'s `isUniqueViolation`. */
function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

function commandExistsError(name: string): AppError {
  return new AppError(
    'twitch_chat_command_exists',
    `A command named "${name}" already exists for this channel.`,
    { status: 409, expose: true },
  );
}

function timerExistsError(name: string): AppError {
  return new AppError(
    'twitch_chat_timer_exists',
    `A timer named "${name}" already exists for this channel.`,
    { status: 409, expose: true },
  );
}

/**
 * `/guilds/:guildId/integrations/twitch-chat` — Entrophy joining a streamer's Twitch chat (ARCHITECTURE.md
 * §J/§19). Lives inside the `integrations` plugin rather than as its own plugin. All chat reads/sends run on
 * the global `TwitchBotIdentity` token (owner-only, see `routes/twitch-bot.ts`) — this file only manages the
 * per-guild channel link, its custom commands, and its timers. No chat message content is ever stored here.
 */
export default async function twitchChatRoutes(app: ZodFastifyInstance): Promise<void> {
  app.get(
    '/:guildId/integrations/twitch-chat',
    { schema: { params: guildIdParamSchema }, preHandler: requireGuildAccess() },
    async (request): Promise<TwitchChatStatusDto> => {
      const guildId = request.guildId!;
      const [botIdentity, channels] = await Promise.all([
        app.prisma.twitchBotIdentity.findFirst(),
        app.prisma.twitchChatChannel.findMany({ where: { guildId }, orderBy: { createdAt: 'desc' } }),
      ]);

      return {
        botConfigured: Boolean(botIdentity),
        botLogin: botIdentity?.botLogin ?? null,
        envConfigured: isOAuthProviderConfigured('twitch'),
        channels: channels.map(toTwitchChatChannelDto),
      };
    },
  );

  app.post(
    '/:guildId/integrations/twitch-chat/connect',
    { schema: { params: guildIdParamSchema }, preHandler: requireGuildAccess() },
    async (request): Promise<{ url: string }> => {
      const guildId = request.guildId!;
      const session = request.session!;

      if (!isOAuthProviderConfigured('twitch')) {
        throw new ExternalServiceError('Twitch is not configured on this server.');
      }

      const state = randomBytes(24).toString('hex');
      await app.redis.set(
        redisKey('oauthstate', 'integration', state),
        JSON.stringify({ guildId, provider: 'twitch', userId: session.userId, kind: 'twitch_chat' }),
        'EX',
        600,
      );

      const redirectUri = `${env.API_BASE_URL ?? ''}/integrations/twitch/callback`;
      return { url: buildProviderAuthorizeUrl('twitch', state, redirectUri, 'channel:bot') };
    },
  );

  app.patch(
    '/:guildId/integrations/twitch-chat/channels/:channelId',
    {
      schema: { params: channelParamSchema, body: updateTwitchChatChannelSchema },
      preHandler: requireGuildAccess(),
    },
    async (request): Promise<TwitchChatChannelDto> => {
      const guildId = request.guildId!;
      const session = request.session!;
      const { channelId } = request.params as { channelId: string };
      const body = request.body;

      const existing = await app.prisma.twitchChatChannel.findFirst({ where: { id: channelId, guildId } });
      if (!existing) throw new NotFoundError('Twitch chat channel not found.');

      const updated = await app.prisma.twitchChatChannel.update({
        where: { id: channelId },
        data: {
          ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
          ...(body.commandPrefix !== undefined ? { commandPrefix: body.commandPrefix } : {}),
        },
      });

      await writeDashboardAudit(app.prisma, {
        guildId,
        actorId: session.userId,
        action: 'integration.twitch_chat.channel.update',
        targetType: 'twitch_chat_channel',
        targetId: channelId,
        before: { enabled: existing.enabled, commandPrefix: existing.commandPrefix },
        after: { enabled: updated.enabled, commandPrefix: updated.commandPrefix },
      });

      nudgeTwitchChatReconcile(app, guildId);

      return toTwitchChatChannelDto(updated);
    },
  );

  app.delete(
    '/:guildId/integrations/twitch-chat/channels/:channelId',
    { schema: { params: channelParamSchema }, preHandler: requireGuildAccess() },
    async (request, reply) => {
      const guildId = request.guildId!;
      const session = request.session!;
      const { channelId } = request.params as { channelId: string };

      const existing = await app.prisma.twitchChatChannel.findFirst({ where: { id: channelId, guildId } });
      if (!existing) throw new NotFoundError('Twitch chat channel not found.');

      // Mirrors `routes/integrations.ts`'s plain disconnect flow (POST `/:connectionId/disconnect`): mark the
      // linked connection disconnected and drop its tokens, rather than soft-deleting the connection outright.
      if (existing.connectionId) {
        await app.prisma.integrationConnection.update({
          where: { id: existing.connectionId },
          data: { status: 'DISCONNECTED' },
        });
        await app.prisma.oAuthToken.deleteMany({ where: { connectionId: existing.connectionId } });
      }

      // Cascades TwitchChatCommand/TwitchChatTimer rows (schema: onDelete: Cascade).
      await app.prisma.twitchChatChannel.delete({ where: { id: channelId } });

      await writeDashboardAudit(app.prisma, {
        guildId,
        actorId: session.userId,
        action: 'integration.twitch_chat.channel.delete',
        targetType: 'twitch_chat_channel',
        targetId: channelId,
        before: { broadcasterLogin: existing.broadcasterLogin },
      });

      nudgeTwitchChatReconcile(app, guildId);

      reply.status(204);
      return null;
    },
  );

  // ---------------------------------------------------------------------------------------------------------
  // Commands
  // ---------------------------------------------------------------------------------------------------------

  app.get(
    '/:guildId/integrations/twitch-chat/channels/:channelId/commands',
    { schema: { params: channelParamSchema }, preHandler: requireGuildAccess() },
    async (request): Promise<TwitchChatCommandDto[]> => {
      const guildId = request.guildId!;
      const { channelId } = request.params as { channelId: string };

      const channel = await app.prisma.twitchChatChannel.findFirst({ where: { id: channelId, guildId } });
      if (!channel) throw new NotFoundError('Twitch chat channel not found.');

      const rows = await app.prisma.twitchChatCommand.findMany({
        where: { channelId },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map(toTwitchChatCommandDto);
    },
  );

  app.post(
    '/:guildId/integrations/twitch-chat/channels/:channelId/commands',
    {
      schema: { params: channelParamSchema, body: createTwitchChatCommandSchema },
      preHandler: requireGuildAccess(),
    },
    async (request, reply): Promise<TwitchChatCommandDto> => {
      const guildId = request.guildId!;
      const session = request.session!;
      const { channelId } = request.params as { channelId: string };
      const body = request.body;

      const channel = await app.prisma.twitchChatChannel.findFirst({ where: { id: channelId, guildId } });
      if (!channel) throw new NotFoundError('Twitch chat channel not found.');

      const clash = await app.prisma.twitchChatCommand.findUnique({
        where: { channelId_name: { channelId, name: body.name } },
      });
      if (clash) throw commandExistsError(body.name);

      const count = await app.prisma.twitchChatCommand.count({ where: { channelId } });
      if (count >= TWITCH_CHAT_MAX_COMMANDS_PER_CHANNEL) {
        throw new AppError(
          'twitch_chat_command_limit',
          `This channel has reached its limit of ${TWITCH_CHAT_MAX_COMMANDS_PER_CHANNEL} commands.`,
          { status: 400, expose: true },
        );
      }

      // The checks above are a friendly fast path, not the real guarantee — the DB's unique constraint
      // (`@@unique([channelId, name])`) is the actual guard against a concurrent create for the same name
      // (precedent: `routes/community.ts`'s tag create).
      let row;
      try {
        row = await app.prisma.twitchChatCommand.create({
          data: {
            channelId,
            guildId,
            name: body.name,
            response: body.response,
            cooldownSeconds: body.cooldownSeconds ?? 5,
            minLevel: TWITCH_CHAT_LEVEL_ENUM_MAP[body.minLevel ?? 'everyone'],
            createdBy: session.userId,
          },
        });
      } catch (err) {
        if (isUniqueViolation(err)) throw commandExistsError(body.name);
        throw err;
      }

      await writeDashboardAudit(app.prisma, {
        guildId,
        actorId: session.userId,
        action: 'integration.twitch_chat.command.create',
        targetType: 'twitch_chat_command',
        targetId: row.id,
        after: { channelId, name: row.name },
      });

      nudgeTwitchChatReconcile(app, guildId);

      reply.status(201);
      return toTwitchChatCommandDto(row);
    },
  );

  app.patch(
    '/:guildId/integrations/twitch-chat/commands/:commandId',
    {
      schema: { params: commandParamSchema, body: updateTwitchChatCommandSchema },
      preHandler: requireGuildAccess(),
    },
    async (request): Promise<TwitchChatCommandDto> => {
      const guildId = request.guildId!;
      const session = request.session!;
      const { commandId } = request.params as { commandId: string };
      const body = request.body;

      const existing = await app.prisma.twitchChatCommand.findFirst({ where: { id: commandId, guildId } });
      if (!existing) throw new NotFoundError('Twitch chat command not found.');

      if (body.name !== undefined && body.name !== existing.name) {
        const clash = await app.prisma.twitchChatCommand.findUnique({
          where: { channelId_name: { channelId: existing.channelId, name: body.name } },
        });
        if (clash && clash.id !== existing.id) throw commandExistsError(body.name);
      }

      let updated;
      try {
        updated = await app.prisma.twitchChatCommand.update({
          where: { id: commandId },
          data: {
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.response !== undefined ? { response: body.response } : {}),
            ...(body.cooldownSeconds !== undefined ? { cooldownSeconds: body.cooldownSeconds } : {}),
            ...(body.minLevel !== undefined ? { minLevel: TWITCH_CHAT_LEVEL_ENUM_MAP[body.minLevel] } : {}),
            ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
          },
        });
      } catch (err) {
        if (isUniqueViolation(err)) throw commandExistsError(body.name ?? existing.name);
        throw err;
      }

      await writeDashboardAudit(app.prisma, {
        guildId,
        actorId: session.userId,
        action: 'integration.twitch_chat.command.update',
        targetType: 'twitch_chat_command',
        targetId: commandId,
        before: {
          name: existing.name,
          response: existing.response,
          cooldownSeconds: existing.cooldownSeconds,
          minLevel: existing.minLevel,
          enabled: existing.enabled,
        },
        after: {
          name: updated.name,
          response: updated.response,
          cooldownSeconds: updated.cooldownSeconds,
          minLevel: updated.minLevel,
          enabled: updated.enabled,
        },
      });

      nudgeTwitchChatReconcile(app, guildId);

      return toTwitchChatCommandDto(updated);
    },
  );

  app.delete(
    '/:guildId/integrations/twitch-chat/commands/:commandId',
    { schema: { params: commandParamSchema }, preHandler: requireGuildAccess() },
    async (request, reply) => {
      const guildId = request.guildId!;
      const session = request.session!;
      const { commandId } = request.params as { commandId: string };

      const existing = await app.prisma.twitchChatCommand.findFirst({ where: { id: commandId, guildId } });
      if (!existing) throw new NotFoundError('Twitch chat command not found.');

      await app.prisma.twitchChatCommand.delete({ where: { id: commandId } });

      await writeDashboardAudit(app.prisma, {
        guildId,
        actorId: session.userId,
        action: 'integration.twitch_chat.command.delete',
        targetType: 'twitch_chat_command',
        targetId: commandId,
        before: { name: existing.name },
      });

      nudgeTwitchChatReconcile(app, guildId);

      reply.status(204);
      return null;
    },
  );

  // ---------------------------------------------------------------------------------------------------------
  // Timers
  // ---------------------------------------------------------------------------------------------------------

  app.get(
    '/:guildId/integrations/twitch-chat/channels/:channelId/timers',
    { schema: { params: channelParamSchema }, preHandler: requireGuildAccess() },
    async (request): Promise<TwitchChatTimerDto[]> => {
      const guildId = request.guildId!;
      const { channelId } = request.params as { channelId: string };

      const channel = await app.prisma.twitchChatChannel.findFirst({ where: { id: channelId, guildId } });
      if (!channel) throw new NotFoundError('Twitch chat channel not found.');

      const rows = await app.prisma.twitchChatTimer.findMany({
        where: { channelId },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map(toTwitchChatTimerDto);
    },
  );

  app.post(
    '/:guildId/integrations/twitch-chat/channels/:channelId/timers',
    {
      schema: { params: channelParamSchema, body: createTwitchChatTimerSchema },
      preHandler: requireGuildAccess(),
    },
    async (request, reply): Promise<TwitchChatTimerDto> => {
      const guildId = request.guildId!;
      const session = request.session!;
      const { channelId } = request.params as { channelId: string };
      const body = request.body;

      const channel = await app.prisma.twitchChatChannel.findFirst({ where: { id: channelId, guildId } });
      if (!channel) throw new NotFoundError('Twitch chat channel not found.');

      const clash = await app.prisma.twitchChatTimer.findUnique({
        where: { channelId_name: { channelId, name: body.name } },
      });
      if (clash) throw timerExistsError(body.name);

      const count = await app.prisma.twitchChatTimer.count({ where: { channelId } });
      if (count >= TWITCH_CHAT_MAX_TIMERS_PER_CHANNEL) {
        throw new AppError(
          'twitch_chat_timer_limit',
          `This channel has reached its limit of ${TWITCH_CHAT_MAX_TIMERS_PER_CHANNEL} timers.`,
          { status: 400, expose: true },
        );
      }

      let row;
      try {
        row = await app.prisma.twitchChatTimer.create({
          data: {
            channelId,
            guildId,
            name: body.name,
            message: body.message,
            intervalMinutes: body.intervalMinutes,
            createdBy: session.userId,
          },
        });
      } catch (err) {
        if (isUniqueViolation(err)) throw timerExistsError(body.name);
        throw err;
      }

      await writeDashboardAudit(app.prisma, {
        guildId,
        actorId: session.userId,
        action: 'integration.twitch_chat.timer.create',
        targetType: 'twitch_chat_timer',
        targetId: row.id,
        after: { channelId, name: row.name },
      });

      nudgeTwitchChatReconcile(app, guildId);

      reply.status(201);
      return toTwitchChatTimerDto(row);
    },
  );

  app.patch(
    '/:guildId/integrations/twitch-chat/timers/:timerId',
    {
      schema: { params: timerParamSchema, body: updateTwitchChatTimerSchema },
      preHandler: requireGuildAccess(),
    },
    async (request): Promise<TwitchChatTimerDto> => {
      const guildId = request.guildId!;
      const session = request.session!;
      const { timerId } = request.params as { timerId: string };
      const body = request.body;

      const existing = await app.prisma.twitchChatTimer.findFirst({ where: { id: timerId, guildId } });
      if (!existing) throw new NotFoundError('Twitch chat timer not found.');

      if (body.name !== undefined && body.name !== existing.name) {
        const clash = await app.prisma.twitchChatTimer.findUnique({
          where: { channelId_name: { channelId: existing.channelId, name: body.name } },
        });
        if (clash && clash.id !== existing.id) throw timerExistsError(body.name);
      }

      let updated;
      try {
        updated = await app.prisma.twitchChatTimer.update({
          where: { id: timerId },
          data: {
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.message !== undefined ? { message: body.message } : {}),
            ...(body.intervalMinutes !== undefined ? { intervalMinutes: body.intervalMinutes } : {}),
            ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
          },
        });
      } catch (err) {
        if (isUniqueViolation(err)) throw timerExistsError(body.name ?? existing.name);
        throw err;
      }

      await writeDashboardAudit(app.prisma, {
        guildId,
        actorId: session.userId,
        action: 'integration.twitch_chat.timer.update',
        targetType: 'twitch_chat_timer',
        targetId: timerId,
        before: {
          name: existing.name,
          message: existing.message,
          intervalMinutes: existing.intervalMinutes,
          enabled: existing.enabled,
        },
        after: {
          name: updated.name,
          message: updated.message,
          intervalMinutes: updated.intervalMinutes,
          enabled: updated.enabled,
        },
      });

      nudgeTwitchChatReconcile(app, guildId);

      return toTwitchChatTimerDto(updated);
    },
  );

  app.delete(
    '/:guildId/integrations/twitch-chat/timers/:timerId',
    { schema: { params: timerParamSchema }, preHandler: requireGuildAccess() },
    async (request, reply) => {
      const guildId = request.guildId!;
      const session = request.session!;
      const { timerId } = request.params as { timerId: string };

      const existing = await app.prisma.twitchChatTimer.findFirst({ where: { id: timerId, guildId } });
      if (!existing) throw new NotFoundError('Twitch chat timer not found.');

      await app.prisma.twitchChatTimer.delete({ where: { id: timerId } });

      await writeDashboardAudit(app.prisma, {
        guildId,
        actorId: session.userId,
        action: 'integration.twitch_chat.timer.delete',
        targetType: 'twitch_chat_timer',
        targetId: timerId,
        before: { name: existing.name },
      });

      nudgeTwitchChatReconcile(app, guildId);

      reply.status(204);
      return null;
    },
  );
}
