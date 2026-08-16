import type { ZodFastifyInstance } from '../lib/http';
import { z } from 'zod';
import { NotFoundError, buildPaginated, paginate } from '@entrophy/core';
import { writeDashboardAudit } from '../lib/audit';
import { requireGuildAccess } from '../lib/guild-access';
import { guildIdParamSchema, paginationQuerySchema } from '../lib/schemas';

const suggestionParamSchema = guildIdParamSchema.extend({ suggestionId: z.string().min(1) });
const suggestionStatusSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'DENIED', 'IMPLEMENTED', 'CONSIDERING']),
  staffNote: z.string().trim().max(1000).optional(),
});

/** `/guilds/:guildId/community` — giveaways/polls/suggestions overview + suggestion status workflow (ARCHITECTURE.md §10). */
export default async function communityRoutes(app: ZodFastifyInstance): Promise<void> {
  app.get(
    '/:guildId/community/giveaways',
    { schema: { params: guildIdParamSchema, querystring: paginationQuerySchema }, preHandler: requireGuildAccess() },
    async (request) => {
      const guildId = request.guildId!;
      const { cursor, limit: rawLimit } = request.query;
      const { limit, offset } = paginate({ cursor, limit: rawLimit });
      const rows = await app.prisma.giveaway.findMany({ where: { guildId }, orderBy: { endsAt: 'desc' }, skip: offset, take: limit + 1 });
      return buildPaginated(rows, limit, offset);
    },
  );

  app.get(
    '/:guildId/community/polls',
    { schema: { params: guildIdParamSchema, querystring: paginationQuerySchema }, preHandler: requireGuildAccess() },
    async (request) => {
      const guildId = request.guildId!;
      const { cursor, limit: rawLimit } = request.query;
      const { limit, offset } = paginate({ cursor, limit: rawLimit });
      const rows = await app.prisma.poll.findMany({
        where: { guildId },
        orderBy: { createdAt: 'desc' },
        include: { options: true },
        skip: offset,
        take: limit + 1,
      });
      return buildPaginated(rows, limit, offset);
    },
  );

  app.get(
    '/:guildId/community/suggestions',
    {
      schema: {
        params: guildIdParamSchema,
        querystring: paginationQuerySchema.extend({ status: z.enum(['PENDING', 'APPROVED', 'DENIED', 'IMPLEMENTED', 'CONSIDERING']).optional() }),
      },
      preHandler: requireGuildAccess(),
    },
    async (request) => {
      const guildId = request.guildId!;
      const { cursor, limit: rawLimit, status } = request.query;
      const { limit, offset } = paginate({ cursor, limit: rawLimit });
      const rows = await app.prisma.suggestion.findMany({
        where: { guildId, deletedAt: null, ...(status ? { status } : {}) },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit + 1,
      });
      return buildPaginated(rows, limit, offset);
    },
  );

  app.patch(
    '/:guildId/community/suggestions/:suggestionId',
    { schema: { params: suggestionParamSchema, body: suggestionStatusSchema }, preHandler: requireGuildAccess() },
    async (request) => {
      const guildId = request.guildId!;
      const session = request.session!;
      const { suggestionId } = request.params as { suggestionId: string };
      const existing = await app.prisma.suggestion.findFirst({ where: { id: suggestionId, guildId, deletedAt: null } });
      if (!existing) throw new NotFoundError('Suggestion not found.');

      const updated = await app.prisma.suggestion.update({
        where: { id: suggestionId },
        data: { status: request.body.status, staffNote: request.body.staffNote },
      });

      await writeDashboardAudit(app.prisma, {
        guildId,
        actorId: session.userId,
        action: 'community.suggestion.status',
        targetType: 'suggestion',
        targetId: suggestionId,
        before: { status: existing.status },
        after: { status: updated.status },
      });

      return updated;
    },
  );
}
