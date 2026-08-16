import type { ZodFastifyInstance } from '../lib/http';
import { z } from 'zod';
import { NotFoundError, buildPaginated, paginate } from '@entrophy/core';
import { requireGuildAccess } from '../lib/guild-access';
import { guildIdParamSchema, paginationQuerySchema } from '../lib/schemas';
import { writeDashboardAudit } from '../lib/audit';

const ENGAGEMENT_PLUGIN_ID = 'engagement' as const;

const rewardBodySchema = z.object({ level: z.number().int().min(1).max(1000), roleId: z.string().min(1) });
const rewardParamSchema = guildIdParamSchema.extend({ rewardId: z.string().min(1) });

/** `/guilds/:guildId/engagement` — leveling settings, leaderboard, and level-role rewards CRUD (ARCHITECTURE.md §10). */
export default async function engagementRoutes(app: ZodFastifyInstance): Promise<void> {
  app.get('/:guildId/engagement/config', { schema: { params: guildIdParamSchema }, preHandler: requireGuildAccess() }, async (request) => {
    return app.configStore.getConfig(request.guildId!, ENGAGEMENT_PLUGIN_ID);
  });

  app.put(
    '/:guildId/engagement/config',
    { schema: { params: guildIdParamSchema, body: z.record(z.string(), z.unknown()) }, preHandler: requireGuildAccess() },
    async (request) => {
      const session = request.session!;
      return app.configStore.setConfig(request.guildId!, ENGAGEMENT_PLUGIN_ID, request.body, { id: session.userId, source: 'dashboard' });
    },
  );

  app.get(
    '/:guildId/engagement/leaderboard',
    { schema: { params: guildIdParamSchema, querystring: paginationQuerySchema }, preHandler: requireGuildAccess() },
    async (request) => {
      const guildId = request.guildId!;
      const { cursor, limit: rawLimit } = request.query;
      const { limit, offset } = paginate({ cursor, limit: rawLimit });
      const rows = await app.prisma.levelProfile.findMany({
        where: { guildId },
        orderBy: [{ xp: 'desc' }],
        skip: offset,
        take: limit + 1,
      });
      return buildPaginated(
        rows.map((row) => ({ userId: row.userId, xp: row.xp, level: row.level, messages: row.messages, voiceMinutes: row.voiceMinutes })),
        limit,
        offset,
      );
    },
  );

  app.get('/:guildId/engagement/rewards', { schema: { params: guildIdParamSchema }, preHandler: requireGuildAccess() }, async (request) => {
    return app.prisma.levelReward.findMany({ where: { guildId: request.guildId! }, orderBy: { level: 'asc' } });
  });

  app.post(
    '/:guildId/engagement/rewards',
    { schema: { params: guildIdParamSchema, body: rewardBodySchema }, preHandler: requireGuildAccess() },
    async (request, reply) => {
      const guildId = request.guildId!;
      const session = request.session!;
      const row = await app.prisma.levelReward.create({ data: { guildId, ...request.body } });
      await writeDashboardAudit(app.prisma, { guildId, actorId: session.userId, action: 'engagement.reward.create', targetType: 'level_reward', targetId: row.id, after: { level: row.level, roleId: row.roleId } });
      reply.status(201);
      return row;
    },
  );

  app.delete(
    '/:guildId/engagement/rewards/:rewardId',
    { schema: { params: rewardParamSchema }, preHandler: requireGuildAccess() },
    async (request, reply) => {
      const guildId = request.guildId!;
      const session = request.session!;
      const { rewardId } = request.params as { rewardId: string };
      const existing = await app.prisma.levelReward.findFirst({ where: { id: rewardId, guildId } });
      if (!existing) throw new NotFoundError('Level reward not found.');

      await app.prisma.levelReward.delete({ where: { id: rewardId } });
      await writeDashboardAudit(app.prisma, { guildId, actorId: session.userId, action: 'engagement.reward.delete', targetType: 'level_reward', targetId: rewardId });
      reply.status(204);
      return null;
    },
  );
}
