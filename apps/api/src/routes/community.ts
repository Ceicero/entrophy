import type { ZodFastifyInstance } from '../lib/http';
import { z } from 'zod';
import { AuditAction, NotFoundError, buildPaginated, paginate } from '@entrophy/core';
import type { Paginated } from '@entrophy/types';
import type {
  AnnouncementDto,
  BirthdayConfigDto,
  BirthdaySummaryDto,
  CommunityEventDto,
  EconomySettingsDto,
  GiveawayDto,
  PollDto,
  PollResultsDto,
  SuggestionDto,
} from '@entrophy/types/community';
import {
  toAnnouncementDto,
  toCommunityEventDto,
  toGiveawayDto,
  toPollDto,
  toPollResultsDto,
  toSuggestionDto,
} from '../lib/community/dto';
import { cancelAnnouncementJob } from '../lib/community/queue';
import { writeDashboardAudit } from '../lib/audit';
import { requireGuildAccess } from '../lib/guild-access';
import { guildIdParamSchema, paginationQuerySchema, snowflakeSchema } from '../lib/schemas';
import type { CommunityConfig } from '@entrophy/plugins/community/manifest';
import { findUnknownMessageTokens, localNow, upcomingSorted } from '@entrophy/plugins/community/birthdays';

const ECONOMY_PLUGIN_ID = 'economy' as const;
const COMMUNITY_PLUGIN_ID = 'community' as const;
const BIRTHDAY_NEXT_LIMIT = 10;

const birthdayUserParamSchema = guildIdParamSchema.extend({ userId: snowflakeSchema });
/** Mirrors `configSchema.shape.birthdays` in the community manifest (every field optional for a PUT patch). */
const birthdayConfigBodySchema = z
  .object({
    enabled: z.boolean().optional(),
    channelId: snowflakeSchema.nullable().optional(),
    message: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .refine((value) => findUnknownMessageTokens(value).length === 0, {
        message: 'Unknown message token; supported tokens are {mention}, {user}, {server}.',
      })
      .optional(),
    announceHour: z.number().int().min(0).max(23).optional(),
    roleId: snowflakeSchema.nullable().optional(),
    publicList: z.boolean().optional(),
  })
  .strict();

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
  // Birthdays (spec CG-06) — a summary only, never a paginated table of every member's entry
  // -------------------------------------------------------------------------

  app.get(
    '/:guildId/community/birthdays/summary',
    { schema: { params: guildIdParamSchema }, preHandler: requireGuildAccess() },
    async (request): Promise<BirthdaySummaryDto> => {
      const guildId = request.guildId!;
      const [config, guildConfig, count, rows] = await Promise.all([
        app.configStore.getConfig<CommunityConfig>(guildId, COMMUNITY_PLUGIN_ID),
        app.configStore.getGuildConfig(guildId),
        app.prisma.birthday.count({ where: { guildId } }),
        app.prisma.birthday.findMany({
          where: { guildId },
          select: { userId: true, month: true, day: true },
        }),
      ]);
      const today = localNow(guildConfig.timezone);
      const b = config.birthdays;
      return {
        enabled: b.enabled,
        channelId: b.channelId,
        message: b.message,
        announceHour: b.announceHour,
        roleId: b.roleId,
        publicList: b.publicList,
        count,
        next: upcomingSorted(rows, today, BIRTHDAY_NEXT_LIMIT),
      };
    },
  );

  app.put(
    '/:guildId/community/birthdays/config',
    {
      schema: { params: guildIdParamSchema, body: birthdayConfigBodySchema },
      preHandler: requireGuildAccess(),
    },
    async (request): Promise<BirthdayConfigDto> => {
      const guildId = request.guildId!;
      const session = request.session!;
      const before = await app.configStore.getConfig<CommunityConfig>(guildId, COMMUNITY_PLUGIN_ID);
      const updated = await app.configStore.setConfig<CommunityConfig>(
        guildId,
        COMMUNITY_PLUGIN_ID,
        { birthdays: { ...before.birthdays, ...request.body } },
        { id: session.userId, source: 'dashboard' },
      );
      await writeDashboardAudit(app.prisma, {
        guildId,
        actorId: session.userId,
        action: AuditAction.CommunityBirthdayConfigUpdate,
        targetType: 'plugin_config',
        targetId: COMMUNITY_PLUGIN_ID,
        before: before.birthdays,
        after: updated.birthdays,
      });
      return updated.birthdays;
    },
  );

  app.delete(
    '/:guildId/community/birthdays/:userId',
    { schema: { params: birthdayUserParamSchema }, preHandler: requireGuildAccess() },
    async (request, reply): Promise<void> => {
      const guildId = request.guildId!;
      const session = request.session!;
      const { userId } = request.params as { userId: string };
      const result = await app.prisma.birthday.deleteMany({ where: { guildId, userId } });
      if (result.count === 0) throw new NotFoundError('No birthday is set for that member.');
      // Audited with the target user id only — never the date itself.
      await writeDashboardAudit(app.prisma, {
        guildId,
        actorId: session.userId,
        action: AuditAction.CommunityBirthdayRemove,
        targetType: 'birthday',
        targetId: userId,
      });
      reply.status(204);
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
