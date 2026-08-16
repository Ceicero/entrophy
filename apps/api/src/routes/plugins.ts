import type { ZodFastifyInstance } from '../lib/http';
import { z } from 'zod';
import { NotFoundError, env as coreEnv } from '@entrophy/core';
import { PLUGIN_IDS, type PluginId, type PluginSummary } from '@entrophy/types';
import { requireGuildAccess } from '../lib/guild-access';
import { guildIdParamSchema } from '../lib/schemas';
import { zodToJsonSchema } from '../lib/zod-json-schema';

const pluginIdParamSchema = guildIdParamSchema.extend({ pluginId: z.enum(PLUGIN_IDS as [PluginId, ...PluginId[]]) });
const configBodySchema = z.record(z.string(), z.unknown());

function intentsEnabled() {
  return {
    messageContent: coreEnv.ENABLE_MESSAGE_CONTENT_INTENT,
    guildMembers: coreEnv.ENABLE_GUILD_MEMBERS_INTENT,
    guildPresences: coreEnv.ENABLE_GUILD_PRESENCES_INTENT,
  };
}

/** `/guilds/:guildId/plugins` — plugin marketplace list, enable/disable, and per-plugin config (ARCHITECTURE.md §10). */
export default async function pluginsRoutes(app: ZodFastifyInstance): Promise<void> {
  app.get('/:guildId/plugins', { schema: { params: guildIdParamSchema }, preHandler: requireGuildAccess() }, async (request): Promise<PluginSummary[]> => {
    const guildId = request.guildId!;
    const manifests = app.registry.listManifests();
    const availability = app.registry.availability(coreEnv as unknown as Record<string, unknown>, intentsEnabled());
    const stateRows = await app.prisma.pluginState.findMany({ where: { guildId } });
    const enabledMap = new Map(stateRows.map((row) => [row.pluginId, row.enabled]));

    return manifests.map((manifest): PluginSummary => {
      const avail = availability.get(manifest.id) ?? { available: false };
      return {
        id: manifest.id,
        name: manifest.name,
        description: manifest.description,
        category: manifest.category,
        version: manifest.version,
        enabled: manifest.alwaysEnabled ? true : (enabledMap.get(manifest.id) ?? manifest.defaultEnabled),
        defaultEnabled: manifest.defaultEnabled,
        alwaysEnabled: Boolean(manifest.alwaysEnabled),
        available: avail.available,
        availabilityReason: avail.reason,
        dashboardPath: manifest.dashboard?.path,
        privacyNotes: manifest.privacyNotes ?? [],
        permissions: manifest.permissions.map((p) => ({
          permission: String(p.permission),
          feature: p.feature,
          optional: p.optional,
          fallback: p.fallback,
        })),
        privilegedIntents: manifest.privilegedIntents ?? [],
      };
    });
  });

  app.post(
    '/:guildId/plugins/:pluginId/enable',
    { schema: { params: pluginIdParamSchema }, preHandler: requireGuildAccess() },
    async (request) => {
      const { guildId, pluginId } = request.params as { guildId: string; pluginId: PluginId };
      const session = request.session!;
      await app.configStore.setEnabled(guildId, pluginId, true, { id: session.userId, source: 'dashboard' });
      return { ok: true };
    },
  );

  app.post(
    '/:guildId/plugins/:pluginId/disable',
    { schema: { params: pluginIdParamSchema }, preHandler: requireGuildAccess() },
    async (request) => {
      const { guildId, pluginId } = request.params as { guildId: string; pluginId: PluginId };
      const session = request.session!;
      await app.configStore.setEnabled(guildId, pluginId, false, { id: session.userId, source: 'dashboard' });
      return { ok: true };
    },
  );

  // Both handlers below respond with `{ config, schema }` (config value + this plugin's JSON-Schema-shaped
  // configSchema), matching what apps/dashboard's `usePluginConfig`/`useUpdatePluginConfig` expect
  // (ARCHITECTURE.md §11: "config drawer (auto-form from JSON schema of configSchema)") — the drawer needs
  // both on every load/save round trip, not just via the separate `/config-schema` endpoint below.
  app.get(
    '/:guildId/plugins/:pluginId/config',
    { schema: { params: pluginIdParamSchema }, preHandler: requireGuildAccess() },
    async (request) => {
      const { guildId, pluginId } = request.params as { guildId: string; pluginId: PluginId };
      const manifest = app.registry.get(pluginId)?.manifest;
      if (!manifest) throw new NotFoundError(`Unknown plugin "${pluginId}".`);
      const config = await app.configStore.getConfig(guildId, pluginId);
      return { config, schema: zodToJsonSchema(manifest.configSchema) };
    },
  );

  app.put(
    '/:guildId/plugins/:pluginId/config',
    { schema: { params: pluginIdParamSchema, body: configBodySchema }, preHandler: requireGuildAccess() },
    async (request) => {
      const { guildId, pluginId } = request.params as { guildId: string; pluginId: PluginId };
      const session = request.session!;
      const manifest = app.registry.get(pluginId)?.manifest;
      if (!manifest) throw new NotFoundError(`Unknown plugin "${pluginId}".`);
      // configStore.setConfig validates `request.body` against the plugin's own configSchema, throwing a
      // ZodError (-> 400 validation_error via toPublicError) on a bad shape.
      const config = await app.configStore.setConfig(guildId, pluginId, request.body, { id: session.userId, source: 'dashboard' });
      return { config, schema: zodToJsonSchema(manifest.configSchema) };
    },
  );

  app.get(
    '/:guildId/plugins/:pluginId/config-schema',
    { schema: { params: pluginIdParamSchema }, preHandler: requireGuildAccess() },
    async (request) => {
      const { pluginId } = request.params as { guildId: string; pluginId: PluginId };
      const manifest = app.registry.get(pluginId)?.manifest;
      if (!manifest) throw new NotFoundError(`Unknown plugin "${pluginId}".`);
      return zodToJsonSchema(manifest.configSchema);
    },
  );
}
