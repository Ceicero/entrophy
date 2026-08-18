import type { ZodFastifyInstance } from '../lib/http';
import { z } from 'zod';
import { AppError, AuditAction, NotFoundError, buildPaginated, paginate } from '@entrophy/core';
import { Prisma } from '@entrophy/database';
import type { Paginated } from '@entrophy/types';
import type {
  AnnouncementDto,
  CommunityEventDto,
  EconomySettingsDto,
  GiveawayDto,
  PollDto,
  PollResultsDto,
  SuggestionDto,
  TagDto,
} from '@entrophy/types/community';
import {
  toAnnouncementDto,
  toCommunityEventDto,
  toGiveawayDto,
  toPollDto,
  toPollResultsDto,
  toSuggestionDto,
  toTagDto,
} from '../lib/community/dto';
import { cancelAnnouncementJob } from '../lib/community/queue';
import { tagBodySchema, tagTriggersCacheKey, type TagBody } from '../lib/community/tag-schemas';
import { writeDashboardAudit } from '../lib/audit';
import { requireGuildAccess } from '../lib/guild-access';
import { guildIdParamSchema, paginationQuerySchema } from '../lib/schemas';

const ECONOMY_PLUGIN_ID = 'economy' as const;
const COMMUNITY_PLUGIN_ID = 'community' as const;
/** Mirrors the plugin config default (`tags.maxTags`) as a hard fallback if the config store is unavailable. */
const DEFAULT_MAX_TAGS = 200;

const tagParamSchema = guildIdParamSchema.extend({ tagId: z.string().min(1) });
const tagListQuerySchema = paginationQuerySchema.extend({ q: z.string().trim().max(32).optional() });

/** 409 — a tag with that name already exists in the guild. */
function tagExistsError(name: string): AppError {
  return new AppError('tag_exists', `A tag named "${name}" already exists.`, { status: 409, expose: true });
}

/** Maps the validated body to Prisma column values (`embed` → `Prisma.DbNull` when absent so an edit can clear it). */
function tagDataFromBody(body: TagBody) {
  return {
    name: body.name,
    content: body.content ?? null,
    embed: body.embed ? (body.embed as Prisma.InputJsonValue) : Prisma.DbNull,
    triggerMode: body.triggerMode,
    trigger: body.triggerMode === 'NONE' ? null : (body.trigger ?? null),
    triggerChannelIds: body.triggerMode === 'NONE' ? [] : body.triggerChannelIds,
    staffOnly: body.staffOnly,
  };
}

function tagAuditSnapshot(body: {
  name: string;
  triggerMode: string;
  trigger: string | null | undefined;
  triggerChannelIds: string[];
  staffOnly: boolean;
  content: string | null | undefined;
  embed: unknown;
}) {
  return {
    name: body.name,
    triggerMode: body.triggerMode,
    trigger: body.trigger ?? null,
    triggerChannelIds: body.triggerChannelIds,
    staffOnly: body.staffOnly,
    hasContent: Boolean(body.content),
    hasEmbed: Boolean(body.embed),
  };
}

const suggestionParamSchema = guildIdParamSchema.extend({ suggestionId: z.string().min(1) });
const suggestionStatusSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'DENIED', 'IMPLEMENTED', 'CONSIDERING']),
  staffNote: z.string().trim().max(1000).optional(),
});

const pollParamSchema = guildIdParamSchema.extend({ pollId: z.string().min(1) });
const announcementParamSchema = guildIdParamSchema.extend({ announcementId: z.string().min(1) });

const economySettingsBodySchema = z
  .object({
    currencyName: z.string().trim().min(1).max(32).optional(),
    currencySymbol: z.string().trim().min(1).max(8).optional(),
    dailyMinAmount: z.number().int().min(0).max(1_000_000).optional(),
    dailyMaxAmount: z.number().int().min(0).max(1_000_000).optional(),
    streakBonusPerDay: z.number().int().min(0).max(10_000).optional(),
    streakBonusMax: z.number().int().min(0).max(1_000_000).optional(),
    giveMinAmount: z.number().int().min(1).max(1_000_000_000).optional(),
    giveMaxAmount: z.number().int().min(1).max(1_000_000_000).optional(),
  })
  .strict();

/** `/guilds/:guildId/community` — giveaways/polls/suggestions/announcements/events overview + suggestion status workflow, plus `/guilds/:guildId/economy/config` (ARCHITECTURE.md §10). */
export default async function communityRoutes(app: ZodFastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // Giveaways
  // -------------------------------------------------------------------------

  app.get(
    '/:guildId/community/giveaways',
    {
      schema: { params: guildIdParamSchema, querystring: paginationQuerySchema },
      preHandler: requireGuildAccess(),
    },
    async (request): Promise<Paginated<GiveawayDto>> => {
      const guildId = request.guildId!;
      const { cursor, limit: rawLimit } = request.query;
      const { limit, offset } = paginate({ cursor, limit: rawLimit });
      const rows = await app.prisma.giveaway.findMany({
        where: { guildId },
        orderBy: { endsAt: 'desc' },
        include: { _count: { select: { entries: true } } },
        skip: offset,
        take: limit + 1,
      });
      const dtos = rows.map((row) => toGiveawayDto({ ...row, entryCount: row._count.entries }));
      return buildPaginated(dtos, limit, offset);
    },
  );

  // -------------------------------------------------------------------------
  // Polls
  // -------------------------------------------------------------------------

  app.get(
    '/:guildId/community/polls',
    {
      schema: { params: guildIdParamSchema, querystring: paginationQuerySchema },
      preHandler: requireGuildAccess(),
    },
    async (request): Promise<Paginated<PollDto>> => {
      const guildId = request.guildId!;
      const { cursor, limit: rawLimit } = request.query;
      const { limit, offset } = paginate({ cursor, limit: rawLimit });
      const rows = await app.prisma.poll.findMany({
        where: { guildId },
        orderBy: { createdAt: 'desc' },
        include: { options: true, votes: true },
        skip: offset,
        take: limit + 1,
      });
      return buildPaginated(rows.map(toPollDto), limit, offset);
    },
  );

  app.get(
    '/:guildId/community/polls/:pollId/results',
    { schema: { params: pollParamSchema }, preHandler: requireGuildAccess() },
    async (request): Promise<PollResultsDto> => {
      const guildId = request.guildId!;
      const { pollId } = request.params as { pollId: string };
      const poll = await app.prisma.poll.findFirst({ where: { id: pollId, guildId } });
      if (!poll) throw new NotFoundError('Poll not found.');
      const [options, votes] = await Promise.all([
        app.prisma.pollOption.findMany({ where: { pollId } }),
        app.prisma.pollVote.findMany({ where: { pollId } }),
      ]);
      return toPollResultsDto(poll, options, votes);
    },
  );

  // -------------------------------------------------------------------------
  // Suggestions
  // -------------------------------------------------------------------------

  app.get(
    '/:guildId/community/suggestions',
    {
      schema: {
        params: guildIdParamSchema,
        querystring: paginationQuerySchema.extend({
          status: z.enum(['PENDING', 'APPROVED', 'DENIED', 'IMPLEMENTED', 'CONSIDERING']).optional(),
        }),
      },
      preHandler: requireGuildAccess(),
    },
    async (request): Promise<Paginated<SuggestionDto>> => {
      const guildId = request.guildId!;
      const { cursor, limit: rawLimit, status } = request.query;
      const { limit, offset } = paginate({ cursor, limit: rawLimit });
      const rows = await app.prisma.suggestion.findMany({
        where: { guildId, deletedAt: null, ...(status ? { status } : {}) },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit + 1,
      });
      return buildPaginated(rows.map(toSuggestionDto), limit, offset);
    },
  );

  app.patch(
    '/:guildId/community/suggestions/:suggestionId',
    {
      schema: { params: suggestionParamSchema, body: suggestionStatusSchema },
      preHandler: requireGuildAccess(),
    },
    async (request): Promise<SuggestionDto> => {
      const guildId = request.guildId!;
      const session = request.session!;
      const { suggestionId } = request.params as { suggestionId: string };
      const existing = await app.prisma.suggestion.findFirst({
        where: { id: suggestionId, guildId, deletedAt: null },
      });
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

      // The bot's `community:suggestion-sync` job (runs every minute) picks this DB change up and reflects it
      // into the posted Discord embed — the dashboard never talks to Discord directly.
      return toSuggestionDto(updated);
    },
  );

  // -------------------------------------------------------------------------
  // Announcements
  // -------------------------------------------------------------------------

  app.get(
    '/:guildId/community/announcements',
    {
      schema: { params: guildIdParamSchema, querystring: paginationQuerySchema },
      preHandler: requireGuildAccess(),
    },
    async (request): Promise<Paginated<AnnouncementDto>> => {
      const guildId = request.guildId!;
      const { cursor, limit: rawLimit } = request.query;
      const { limit, offset } = paginate({ cursor, limit: rawLimit });
      const rows = await app.prisma.scheduledAnnouncement.findMany({
        where: { guildId },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit + 1,
      });
      return buildPaginated(rows.map(toAnnouncementDto), limit, offset);
    },
  );

  app.post(
    '/:guildId/community/announcements/:announcementId/cancel',
    { schema: { params: announcementParamSchema }, preHandler: requireGuildAccess() },
    async (request): Promise<AnnouncementDto> => {
      const guildId = request.guildId!;
      const session = request.session!;
      const { announcementId } = request.params as { announcementId: string };
      const existing = await app.prisma.scheduledAnnouncement.findFirst({
        where: { id: announcementId, guildId },
      });
      if (!existing) throw new NotFoundError('Scheduled announcement not found.');

      const updated = await app.prisma.scheduledAnnouncement.update({
        where: { id: announcementId },
        data: { enabled: false },
      });
      await cancelAnnouncementJob(app.redis, announcementId, existing.cron);

      await writeDashboardAudit(app.prisma, {
        guildId,
        actorId: session.userId,
        action: 'community.announcement.cancel',
        targetType: 'scheduled_announcement',
        targetId: announcementId,
      });

      return toAnnouncementDto(updated);
    },
  );

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  app.get(
    '/:guildId/community/events',
    {
      schema: { params: guildIdParamSchema, querystring: paginationQuerySchema },
      preHandler: requireGuildAccess(),
    },
    async (request): Promise<Paginated<CommunityEventDto>> => {
      const guildId = request.guildId!;
      const { cursor, limit: rawLimit } = request.query;
      const { limit, offset } = paginate({ cursor, limit: rawLimit });
      const rows = await app.prisma.communityEvent.findMany({
        where: { guildId },
        orderBy: { startsAt: 'desc' },
        include: { rsvps: true },
        skip: offset,
        take: limit + 1,
      });
      const dtos = rows.map((row) => toCommunityEventDto(row, row.rsvps));
      return buildPaginated(dtos, limit, offset);
    },
  );

  // -------------------------------------------------------------------------
  // Tags (custom commands + auto-responders, spec CG-02). Every write audits and DELs the bot's Redis-cached
  // trigger list for the guild so the auto-responder picks the change up on the next message.
  // -------------------------------------------------------------------------

  app.get(
    '/:guildId/community/tags',
    {
      schema: { params: guildIdParamSchema, querystring: tagListQuerySchema },
      preHandler: requireGuildAccess(),
    },
    async (request): Promise<Paginated<TagDto>> => {
      const guildId = request.guildId!;
      const { cursor, limit: rawLimit, q } = request.query;
      const { limit, offset } = paginate({ cursor, limit: rawLimit });
      const prefix = q ? q.toLowerCase() : undefined;
      const rows = await app.prisma.tag.findMany({
        where: { guildId, ...(prefix ? { name: { startsWith: prefix } } : {}) },
        orderBy: { name: 'asc' },
        skip: offset,
        take: limit + 1,
      });
      return buildPaginated(rows.map(toTagDto), limit, offset);
    },
  );

  app.post(
    '/:guildId/community/tags',
    { schema: { params: guildIdParamSchema, body: tagBodySchema }, preHandler: requireGuildAccess() },
    async (request, reply): Promise<TagDto> => {
      const guildId = request.guildId!;
      const session = request.session!;
      const body = request.body;

      const existing = await app.prisma.tag.findUnique({
        where: { guildId_name: { guildId, name: body.name } },
        select: { id: true },
      });
      if (existing) throw tagExistsError(body.name);

      const config = await app.configStore.getConfig<{ tags?: { maxTags?: number } }>(
        guildId,
        COMMUNITY_PLUGIN_ID,
      );
      const maxTags = config?.tags?.maxTags ?? DEFAULT_MAX_TAGS;
      const count = await app.prisma.tag.count({ where: { guildId } });
      if (count >= maxTags) {
        throw new AppError('tag_limit', `This server has reached its limit of ${maxTags} tags.`, {
          status: 400,
          expose: true,
        });
      }

      const row = await app.prisma.tag.create({
        data: { guildId, ...tagDataFromBody(body), createdBy: session.userId },
      });

      await writeDashboardAudit(app.prisma, {
        guildId,
        actorId: session.userId,
        action: AuditAction.CommunityTagCreate,
        targetType: 'tag',
        targetId: row.id,
        after: tagAuditSnapshot(row),
      });
      await app.redis.del(tagTriggersCacheKey(guildId));

      reply.status(201);
      return toTagDto(row);
    },
  );

  app.put(
    '/:guildId/community/tags/:tagId',
    { schema: { params: tagParamSchema, body: tagBodySchema }, preHandler: requireGuildAccess() },
    async (request): Promise<TagDto> => {
      const guildId = request.guildId!;
      const session = request.session!;
      const { tagId } = request.params as { tagId: string };
      const body = request.body;

      const existing = await app.prisma.tag.findFirst({ where: { id: tagId, guildId } });
      if (!existing) throw new NotFoundError('Tag not found.');

      if (body.name !== existing.name) {
        const clash = await app.prisma.tag.findUnique({
          where: { guildId_name: { guildId, name: body.name } },
          select: { id: true },
        });
        if (clash && clash.id !== existing.id) throw tagExistsError(body.name);
      }

      const updated = await app.prisma.tag.update({
        where: { id: existing.id },
        data: { ...tagDataFromBody(body), updatedBy: session.userId },
      });

      await writeDashboardAudit(app.prisma, {
        guildId,
        actorId: session.userId,
        action: AuditAction.CommunityTagUpdate,
        targetType: 'tag',
        targetId: existing.id,
        before: tagAuditSnapshot(existing),
        after: tagAuditSnapshot(updated),
      });
      await app.redis.del(tagTriggersCacheKey(guildId));

      return toTagDto(updated);
    },
  );

  app.delete(
    '/:guildId/community/tags/:tagId',
    { schema: { params: tagParamSchema }, preHandler: requireGuildAccess() },
    async (request, reply) => {
      const guildId = request.guildId!;
      const session = request.session!;
      const { tagId } = request.params as { tagId: string };

      const existing = await app.prisma.tag.findFirst({ where: { id: tagId, guildId } });
      if (!existing) throw new NotFoundError('Tag not found.');

      await app.prisma.tag.delete({ where: { id: existing.id } });

      await writeDashboardAudit(app.prisma, {
        guildId,
        actorId: session.userId,
        action: AuditAction.CommunityTagDelete,
        targetType: 'tag',
        targetId: existing.id,
        before: { ...tagAuditSnapshot(existing), uses: existing.uses },
      });
      await app.redis.del(tagTriggersCacheKey(guildId));

      reply.status(204);
      return null;
    },
  );

  // -------------------------------------------------------------------------
  // Economy settings (economy has no dashboard page of its own — this backs its plugin-config-drawer entry
  // and any other client that wants a typed view instead of the generic plugin-config JSON-schema endpoint)
  // -------------------------------------------------------------------------

  app.get(
    '/:guildId/economy/config',
    { schema: { params: guildIdParamSchema }, preHandler: requireGuildAccess() },
    async (request): Promise<EconomySettingsDto> => {
      return app.configStore.getConfig<EconomySettingsDto>(request.guildId!, ECONOMY_PLUGIN_ID);
    },
  );

  app.put(
    '/:guildId/economy/config',
    {
      schema: { params: guildIdParamSchema, body: economySettingsBodySchema },
      preHandler: requireGuildAccess(),
    },
    async (request): Promise<EconomySettingsDto> => {
      const session = request.session!;
      return app.configStore.setConfig<EconomySettingsDto>(
        request.guildId!,
        ECONOMY_PLUGIN_ID,
        request.body,
        {
          id: session.userId,
          source: 'dashboard',
        },
      );
    },
  );
}
