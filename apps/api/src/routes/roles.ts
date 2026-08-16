import type { ZodFastifyInstance } from '../lib/http';
import { z } from 'zod';
import { AuditAction, NotFoundError, buildPaginated, paginate } from '@entrophy/core';
import type { Paginated, RolePanelDto } from '@entrophy/types';
import { writeDashboardAudit } from '../lib/audit';
import { toRolePanelDto } from '../lib/dto';
import { requireGuildAccess } from '../lib/guild-access';
import { guildIdParamSchema, paginationQuerySchema } from '../lib/schemas';

const ROLES_PLUGIN_ID = 'roles' as const;

const panelOptionSchema = z.object({
  roleId: z.string().min(1),
  label: z.string().trim().min(1).max(100),
  emoji: z.string().max(64).nullable().optional(),
  description: z.string().trim().max(200).nullable().optional(),
  position: z.number().int().min(0).default(0),
});

const panelBodySchema = z.object({
  channelId: z.string().min(1),
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).nullable().optional(),
  style: z.enum(['BUTTONS', 'SELECT', 'REACTIONS']),
  groupId: z.string().nullable().optional(),
  maxSelections: z.number().int().positive().nullable().optional(),
  options: z.array(panelOptionSchema).min(1).max(25),
});
const panelUpdateSchema = panelBodySchema.partial();
const panelParamSchema = guildIdParamSchema.extend({ panelId: z.string().min(1) });

const verificationParamSchema = guildIdParamSchema.extend({ requestId: z.string().min(1) });
const verificationDecisionSchema = z.object({ note: z.string().trim().max(1000).optional() });

/** `/guilds/:guildId/roles` — role panel builder, welcome/goodbye config, and verification queue (ARCHITECTURE.md §10). */
export default async function rolesRoutes(app: ZodFastifyInstance): Promise<void> {
  app.get('/:guildId/roles/panels', { schema: { params: guildIdParamSchema }, preHandler: requireGuildAccess() }, async (request): Promise<RolePanelDto[]> => {
    const rows = await app.prisma.rolePanel.findMany({
      where: { guildId: request.guildId!, deletedAt: null },
      include: { options: { orderBy: { position: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRolePanelDto);
  });

  app.post(
    '/:guildId/roles/panels',
    { schema: { params: guildIdParamSchema, body: panelBodySchema }, preHandler: requireGuildAccess() },
    async (request, reply): Promise<RolePanelDto> => {
      const guildId = request.guildId!;
      const session = request.session!;
      const { options, ...panelFields } = request.body;

      const row = await app.prisma.rolePanel.create({
        data: {
          guildId,
          ...panelFields,
          options: { create: options.map((opt, index) => ({ ...opt, position: opt.position ?? index })) },
        },
        include: { options: { orderBy: { position: 'asc' } } },
      });

      await writeDashboardAudit(app.prisma, { guildId, actorId: session.userId, action: AuditAction.RolesPanelCreate, targetType: 'role_panel', targetId: row.id, after: { title: row.title } });
      reply.status(201);
      return toRolePanelDto(row);
    },
  );

  app.put(
    '/:guildId/roles/panels/:panelId',
    { schema: { params: panelParamSchema, body: panelUpdateSchema }, preHandler: requireGuildAccess() },
    async (request): Promise<RolePanelDto> => {
      const guildId = request.guildId!;
      const session = request.session!;
      const { panelId } = request.params as { panelId: string };
      const existing = await app.prisma.rolePanel.findFirst({ where: { id: panelId, guildId, deletedAt: null } });
      if (!existing) throw new NotFoundError('Role panel not found.');

      const { options, ...panelFields } = request.body;
      if (options) {
        await app.prisma.rolePanelOption.deleteMany({ where: { panelId } });
      }

      const updated = await app.prisma.rolePanel.update({
        where: { id: panelId },
        data: {
          ...panelFields,
          ...(options ? { options: { create: options.map((opt, index) => ({ ...opt, position: opt.position ?? index })) } } : {}),
        },
        include: { options: { orderBy: { position: 'asc' } } },
      });

      await writeDashboardAudit(app.prisma, { guildId, actorId: session.userId, action: AuditAction.RolesPanelUpdate, targetType: 'role_panel', targetId: panelId });
      return toRolePanelDto(updated);
    },
  );

  app.delete('/:guildId/roles/panels/:panelId', { schema: { params: panelParamSchema }, preHandler: requireGuildAccess() }, async (request, reply) => {
    const guildId = request.guildId!;
    const session = request.session!;
    const { panelId } = request.params as { panelId: string };
    const existing = await app.prisma.rolePanel.findFirst({ where: { id: panelId, guildId, deletedAt: null } });
    if (!existing) throw new NotFoundError('Role panel not found.');

    await app.prisma.rolePanel.update({ where: { id: panelId }, data: { deletedAt: new Date() } });
    await writeDashboardAudit(app.prisma, { guildId, actorId: session.userId, action: AuditAction.RolesPanelDelete, targetType: 'role_panel', targetId: panelId });
    reply.status(204);
    return null;
  });

  app.post('/:guildId/roles/panels/:panelId/post', { schema: { params: panelParamSchema }, preHandler: requireGuildAccess() }, async (request) => {
    const guildId = request.guildId!;
    const session = request.session!;
    const { panelId } = request.params as { panelId: string };
    const existing = await app.prisma.rolePanel.findFirst({ where: { id: panelId, guildId, deletedAt: null } });
    if (!existing) throw new NotFoundError('Role panel not found.');

    await app.queues.botActions().add('roles.postPanel', { guildId, panelId, requestedBy: session.userId });
    await writeDashboardAudit(app.prisma, { guildId, actorId: session.userId, action: 'roles.panel.post', targetType: 'role_panel', targetId: panelId });
    return { ok: true, queued: true };
  });

  app.get('/:guildId/roles/welcome', { schema: { params: guildIdParamSchema }, preHandler: requireGuildAccess() }, async (request) => {
    return app.configStore.getConfig(request.guildId!, ROLES_PLUGIN_ID);
  });

  app.put(
    '/:guildId/roles/welcome',
    { schema: { params: guildIdParamSchema, body: z.record(z.string(), z.unknown()) }, preHandler: requireGuildAccess() },
    async (request) => {
      const guildId = request.guildId!;
      const session = request.session!;
      const updated = await app.configStore.setConfig(guildId, ROLES_PLUGIN_ID, request.body, { id: session.userId, source: 'dashboard' });
      await writeDashboardAudit(app.prisma, { guildId, actorId: session.userId, action: AuditAction.RolesWelcomeUpdate, targetType: 'plugin_config', targetId: ROLES_PLUGIN_ID });
      return updated;
    },
  );

  app.get(
    '/:guildId/roles/verification',
    { schema: { params: guildIdParamSchema, querystring: paginationQuerySchema }, preHandler: requireGuildAccess() },
    async (request): Promise<Paginated<Record<string, unknown>>> => {
      const guildId = request.guildId!;
      const { cursor, limit: rawLimit } = request.query;
      const { limit, offset } = paginate({ cursor, limit: rawLimit });
      const rows = await app.prisma.verificationRequest.findMany({
        where: { guildId, status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        skip: offset,
        take: limit + 1,
      });
      return buildPaginated(
        rows.map((row) => ({
          id: row.id,
          guildId: row.guildId,
          userId: row.userId,
          method: row.method,
          status: row.status,
          answers: row.answers,
          createdAt: row.createdAt.toISOString(),
        })),
        limit,
        offset,
      );
    },
  );

  app.post(
    '/:guildId/roles/verification/:requestId/approve',
    { schema: { params: verificationParamSchema, body: verificationDecisionSchema }, preHandler: requireGuildAccess() },
    async (request) => {
      const guildId = request.guildId!;
      const session = request.session!;
      const { requestId } = request.params as { requestId: string };
      const existing = await app.prisma.verificationRequest.findFirst({ where: { id: requestId, guildId } });
      if (!existing) throw new NotFoundError('Verification request not found.');

      await app.prisma.verificationRequest.update({ where: { id: requestId }, data: { status: 'APPROVED', reviewedBy: session.userId, reviewedAt: new Date() } });
      await app.queues.botActions().add('roles.verificationDecision', { guildId, requestId, userId: existing.userId, decision: 'approve', decidedBy: session.userId, note: request.body.note });
      await writeDashboardAudit(app.prisma, { guildId, actorId: session.userId, action: AuditAction.VerificationApprove, targetType: 'verification_request', targetId: requestId });
      return { ok: true };
    },
  );

  app.post(
    '/:guildId/roles/verification/:requestId/deny',
    { schema: { params: verificationParamSchema, body: verificationDecisionSchema }, preHandler: requireGuildAccess() },
    async (request) => {
      const guildId = request.guildId!;
      const session = request.session!;
      const { requestId } = request.params as { requestId: string };
      const existing = await app.prisma.verificationRequest.findFirst({ where: { id: requestId, guildId } });
      if (!existing) throw new NotFoundError('Verification request not found.');

      await app.prisma.verificationRequest.update({ where: { id: requestId }, data: { status: 'DENIED', reviewedBy: session.userId, reviewedAt: new Date() } });
      await app.queues.botActions().add('roles.verificationDecision', { guildId, requestId, userId: existing.userId, decision: 'deny', decidedBy: session.userId, note: request.body.note });
      await writeDashboardAudit(app.prisma, { guildId, actorId: session.userId, action: AuditAction.VerificationDeny, targetType: 'verification_request', targetId: requestId });
      return { ok: true };
    },
  );
}
