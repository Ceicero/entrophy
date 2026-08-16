import type { ZodFastifyInstance } from '../lib/http';
import { z } from 'zod';
import type { GuildConfigDto, GuildSummary } from '@entrophy/types';
import { decryptAccessToken } from '../lib/session';
import { getCachedUserGuilds, hasManageAccess } from '../lib/discord';
import { requireAuth, requireGuildAccess } from '../lib/guild-access';
import { guildIdParamSchema } from '../lib/schemas';

function toGuildConfigDto(
  guildId: string,
  data: Awaited<ReturnType<ZodFastifyInstance['configStore']['getGuildConfig']>>,
): GuildConfigDto {
  return {
    guildId,
    locale: data.locale,
    timezone: data.timezone,
    adminRoleIds: data.adminRoleIds,
    modRoleIds: data.modRoleIds,
    helperRoleIds: data.helperRoleIds,
    modLogChannelId: data.modLogChannelId,
    staffChannelId: data.staffChannelId,
    fastActions: data.fastActions,
    dataCollectionEnabled: data.dataCollectionEnabled,
    logMessageContent: data.logMessageContent,
    dmOnModeration: data.dmOnModeration,
  };
}

const configPatchSchema = z.object({
  locale: z.string().min(2).max(10).optional(),
  timezone: z.string().min(1).max(64).optional(),
  adminRoleIds: z.array(z.string()).optional(),
  modRoleIds: z.array(z.string()).optional(),
  helperRoleIds: z.array(z.string()).optional(),
  modLogChannelId: z.string().nullable().optional(),
  staffChannelId: z.string().nullable().optional(),
  fastActions: z.boolean().optional(),
  dataCollectionEnabled: z.boolean().optional(),
  logMessageContent: z.boolean().optional(),
  dmOnModeration: z.boolean().optional(),
});

/** `/guilds` — guild selector list, per-guild overview, and core `GuildConfig` get/patch (ARCHITECTURE.md §10). */
export default async function guildsRoutes(app: ZodFastifyInstance): Promise<void> {
  app.get('/', { preHandler: requireAuth }, async (request): Promise<GuildSummary[]> => {
    const session = request.session!;
    const accessToken = decryptAccessToken(session);
    const discordGuilds = await getCachedUserGuilds(app.redis, session.userId, accessToken);
    const manageable = discordGuilds.filter((g) => hasManageAccess(g.permissions, g.owner));

    if (manageable.length === 0) return [];

    const knownGuilds = await app.prisma.guild.findMany({
      where: { id: { in: manageable.map((g) => g.id) }, botPresent: true },
      select: { id: true, iconHash: true },
    });
    const botPresentIds = new Set(knownGuilds.map((g) => g.id));

    return manageable.map((g): GuildSummary => ({
      id: g.id,
      name: g.name,
      iconUrl: g.icon
        ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.${g.icon.startsWith('a_') ? 'gif' : 'png'}`
        : null,
      botPresent: botPresentIds.has(g.id),
      canManage: true,
      owner: g.owner,
    }));
  });

  app.get(
    '/:guildId',
    { schema: { params: guildIdParamSchema }, preHandler: requireGuildAccess() },
    async (request) => {
      const guildId = request.guildId!;
      const [guild, config, manifests, pluginStateRows] = await Promise.all([
        app.prisma.guild.findUnique({ where: { id: guildId } }),
        app.configStore.getGuildConfig(guildId),
        Promise.resolve(app.registry.listManifests()),
        app.prisma.pluginState.findMany({ where: { guildId } }),
      ]);

      const enabledByPlugin = new Map(pluginStateRows.map((row) => [row.pluginId, row.enabled]));
      const enabledCount = manifests.filter(
        (m) => m.alwaysEnabled || (enabledByPlugin.get(m.id) ?? m.defaultEnabled),
      ).length;

      return {
        guild: guild
          ? {
              id: guild.id,
              name: guild.name,
              memberCount: guild.memberCount,
              ownerId: guild.ownerId,
              joinedAt: guild.joinedAt.toISOString(),
            }
          : null,
        config: toGuildConfigDto(guildId, config),
        pluginCount: manifests.length,
        pluginsEnabled: enabledCount,
      };
    },
  );

  app.get(
    '/:guildId/config',
    { schema: { params: guildIdParamSchema }, preHandler: requireGuildAccess() },
    async (request): Promise<GuildConfigDto> => {
      const guildId = request.guildId!;
      const config = await app.configStore.getGuildConfig(guildId);
      return toGuildConfigDto(guildId, config);
    },
  );

  app.patch(
    '/:guildId/config',
    { schema: { params: guildIdParamSchema, body: configPatchSchema }, preHandler: requireGuildAccess() },
    async (request): Promise<GuildConfigDto> => {
      const guildId = request.guildId!;
      const session = request.session!;
      // `configStore.updateGuildConfig` writes its own audit entry (before/after, source 'dashboard').
      const after = await app.configStore.updateGuildConfig(guildId, request.body, {
        id: session.userId,
        source: 'dashboard',
      });
      return toGuildConfigDto(guildId, after);
    },
  );
}
