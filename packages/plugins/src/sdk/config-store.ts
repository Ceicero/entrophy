import type Redis from 'ioredis';
import { AuditAction, redisKey, type PlatformEvents } from '@entrophy/core';
import {
  writeAudit,
  redactForAudit,
  type GuildConfig,
  type Prisma,
  type PrismaClient,
} from '@entrophy/database';
import type { PluginId } from '@entrophy/types';
import type { PluginRegistry } from './registry';

const CACHE_TTL_SECONDS = 300;

export interface ConfigActor {
  id: string;
  source: 'bot' | 'dashboard' | 'system';
}

/** Per-guild core config (ARCHITECTURE.md §8's `GuildConfig` model, minus id/relation/timestamps). */
export interface GuildConfigData {
  guildId: string;
  locale: string;
  timezone: string;
  adminRoleIds: string[];
  modRoleIds: string[];
  helperRoleIds: string[];
  modLogChannelId: string | null;
  staffChannelId: string | null;
  appealsChannelId: string | null;
  fastActions: boolean;
  dataCollectionEnabled: boolean;
  logMessageContent: boolean;
  dmOnModeration: boolean;
  /** ISO 8601 timestamp, or null if `/setup wizard` has not been completed. */
  setupCompletedAt: string | null;
}

export type GuildConfigPatch = Partial<Omit<GuildConfigData, 'guildId'>>;

/** Platform defaults for every `GuildConfig` field (used by callers implementing "reset to default", e.g. `admin`'s `/config reset`). */
export const DEFAULT_GUILD_CONFIG: Omit<GuildConfigData, 'guildId'> = {
  locale: 'en',
  timezone: 'UTC',
  adminRoleIds: [],
  modRoleIds: [],
  helperRoleIds: [],
  modLogChannelId: null,
  staffChannelId: null,
  appealsChannelId: null,
  fastActions: false,
  dataCollectionEnabled: false,
  logMessageContent: false,
  dmOnModeration: true,
  setupCompletedAt: null,
};

function toGuildConfigData(guildId: string, row: GuildConfig | null): GuildConfigData {
  if (!row) return { guildId, ...DEFAULT_GUILD_CONFIG };
  return {
    guildId: row.guildId,
    locale: row.locale,
    timezone: row.timezone,
    adminRoleIds: row.adminRoleIds,
    modRoleIds: row.modRoleIds,
    helperRoleIds: row.helperRoleIds,
    modLogChannelId: row.modLogChannelId,
    staffChannelId: row.staffChannelId,
    appealsChannelId: row.appealsChannelId,
    fastActions: row.fastActions,
    dataCollectionEnabled: row.dataCollectionEnabled,
    logMessageContent: row.logMessageContent,
    dmOnModeration: row.dmOnModeration,
    setupCompletedAt: row.setupCompletedAt ? row.setupCompletedAt.toISOString() : null,
  };
}

function actorTypeFor(actor: ConfigActor): 'user' | 'system' {
  return actor.source === 'system' ? 'system' : 'user';
}

/**
 * Reads/writes per-guild plugin config (`PluginConfig`) and enablement (`PluginState`), plus core per-guild
 * config (`GuildConfig`) — with a shared Redis cache layer (ARCHITECTURE.md §7.4). Used by both the bot host
 * and the API so dashboard writes are visible to the bot after cache invalidation.
 */
export class GuildConfigStore {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
    private readonly registry: PluginRegistry,
    private readonly events?: PlatformEvents,
  ) {}

  private requirePlugin(pluginId: PluginId) {
    const plugin = this.registry.get(pluginId);
    if (!plugin) {
      throw new Error(`GuildConfigStore: plugin "${pluginId}" is not loaded in the registry.`);
    }
    return plugin;
  }

  private configCacheKey(guildId: string, pluginId: PluginId): string {
    return redisKey('cfg', guildId, pluginId);
  }

  private stateCacheKey(guildId: string, pluginId: PluginId): string {
    return redisKey('plugin', guildId, pluginId);
  }

  private guildConfigCacheKey(guildId: string): string {
    return redisKey('guildcfg', guildId);
  }

  /** Returns this plugin's guild config, merging the stored `PluginConfig` row (if any) over `manifest.defaultConfig`. */
  async getConfig<T = unknown>(guildId: string, pluginId: PluginId): Promise<T> {
    const plugin = this.requirePlugin(pluginId);
    const cacheKey = this.configCacheKey(guildId, pluginId);

    const cached = await this.redis.get(cacheKey);
    if (cached !== null) {
      return JSON.parse(cached) as T;
    }

    const row = await this.prisma.pluginConfig.findUnique({
      where: { guildId_pluginId: { guildId, pluginId } },
    });
    const stored = (row?.config as Record<string, unknown> | undefined) ?? {};
    const effective = plugin.manifest.configSchema.parse({
      ...(plugin.manifest.defaultConfig as Record<string, unknown>),
      ...stored,
    }) as T;

    await this.redis.set(cacheKey, JSON.stringify(effective), 'EX', CACHE_TTL_SECONDS);
    return effective;
  }

  /**
   * Shallow-merges `patch` over the currently stored raw config, validates the result against the plugin's
   * `configSchema`, persists it, invalidates the cache, writes an audit entry (before/after redacted), and
   * emits `guild.configChanged` if an event bus was provided.
   */
  async setConfig<T = unknown>(
    guildId: string,
    pluginId: PluginId,
    patch: Partial<T>,
    actor: ConfigActor,
  ): Promise<T> {
    const plugin = this.requirePlugin(pluginId);
    const defaults = plugin.manifest.defaultConfig as Record<string, unknown>;

    const existingRow = await this.prisma.pluginConfig.findUnique({
      where: { guildId_pluginId: { guildId, pluginId } },
    });
    const beforeRaw = (existingRow?.config as Record<string, unknown> | undefined) ?? {};
    const beforeEffective = plugin.manifest.configSchema.parse({ ...defaults, ...beforeRaw });

    const mergedRaw = { ...beforeRaw, ...(patch as Record<string, unknown>) };
    const afterEffective = plugin.manifest.configSchema.parse({ ...defaults, ...mergedRaw }) as T;

    await this.prisma.pluginConfig.upsert({
      where: { guildId_pluginId: { guildId, pluginId } },
      create: { guildId, pluginId, config: mergedRaw as Prisma.InputJsonValue, version: 1 },
      update: { config: mergedRaw as Prisma.InputJsonValue, version: { increment: 1 } },
    });

    await this.invalidate(guildId, pluginId);

    await writeAudit(this.prisma, {
      guildId,
      actorId: actor.id,
      actorType: actorTypeFor(actor),
      action: AuditAction.PluginConfigUpdate,
      targetType: 'plugin_config',
      targetId: pluginId,
      before: redactForAudit(beforeEffective),
      after: redactForAudit(afterEffective),
      source: actor.source,
    });

    this.events?.emit('guild.configChanged', { guildId, pluginId, actorId: actor.id, source: actor.source });

    return afterEffective;
  }

  /** True if `pluginId` is enabled for `guildId`. Always-enabled plugins (per manifest) short-circuit to true. */
  async isEnabled(guildId: string, pluginId: PluginId): Promise<boolean> {
    const plugin = this.requirePlugin(pluginId);
    if (plugin.manifest.alwaysEnabled) return true;

    const cacheKey = this.stateCacheKey(guildId, pluginId);
    const cached = await this.redis.get(cacheKey);
    if (cached !== null) return cached === '1';

    const row = await this.prisma.pluginState.findUnique({
      where: { guildId_pluginId: { guildId, pluginId } },
    });
    const enabled = row ? row.enabled : plugin.manifest.defaultEnabled;

    await this.redis.set(cacheKey, enabled ? '1' : '0', 'EX', CACHE_TTL_SECONDS);
    return enabled;
  }

  /** Sets a plugin's enablement for a guild; refuses always-enabled plugins. Writes `PluginState`, audit, and emits `plugin.enabled`/`plugin.disabled`. */
  async setEnabled(guildId: string, pluginId: PluginId, enabled: boolean, actor: ConfigActor): Promise<void> {
    const plugin = this.requirePlugin(pluginId);
    if (plugin.manifest.alwaysEnabled) {
      throw new Error(`Plugin "${pluginId}" is always enabled and cannot be disabled.`);
    }

    await this.prisma.pluginState.upsert({
      where: { guildId_pluginId: { guildId, pluginId } },
      create: { guildId, pluginId, enabled, updatedBy: actor.id },
      update: { enabled, updatedBy: actor.id },
    });

    await this.invalidate(guildId, pluginId);

    await writeAudit(this.prisma, {
      guildId,
      actorId: actor.id,
      actorType: actorTypeFor(actor),
      action: enabled ? AuditAction.PluginEnable : AuditAction.PluginDisable,
      targetType: 'plugin',
      targetId: pluginId,
      source: actor.source,
    });

    this.events?.emit(enabled ? 'plugin.enabled' : 'plugin.disabled', {
      guildId,
      pluginId,
      actorId: actor.id,
    });
  }

  /** Deletes cached entries for one plugin in a guild, or (when `pluginId` is omitted) every plugin + the core guild config cache. */
  async invalidate(guildId: string, pluginId?: PluginId): Promise<void> {
    if (pluginId) {
      await this.redis.del(this.configCacheKey(guildId, pluginId), this.stateCacheKey(guildId, pluginId));
      return;
    }

    const keys = [this.guildConfigCacheKey(guildId)];
    for (const plugin of this.registry.list()) {
      keys.push(
        this.configCacheKey(guildId, plugin.manifest.id),
        this.stateCacheKey(guildId, plugin.manifest.id),
      );
    }
    await this.redis.del(...keys);
  }

  /** Returns the guild's core config (`GuildConfig`), or platform defaults if no row exists yet (no write performed). */
  async getGuildConfig(guildId: string): Promise<GuildConfigData> {
    const cacheKey = this.guildConfigCacheKey(guildId);
    const cached = await this.redis.get(cacheKey);
    if (cached !== null) {
      return JSON.parse(cached) as GuildConfigData;
    }

    const row = await this.prisma.guildConfig.findUnique({ where: { guildId } });
    const data = toGuildConfigData(guildId, row);
    await this.redis.set(cacheKey, JSON.stringify(data), 'EX', CACHE_TTL_SECONDS);
    return data;
  }

  /** Upserts `GuildConfig` with `patch`, invalidates the cache, and writes an audit entry. */
  async updateGuildConfig(
    guildId: string,
    patch: GuildConfigPatch,
    actor: ConfigActor,
  ): Promise<GuildConfigData> {
    const before = await this.getGuildConfig(guildId);

    const scalarData: Prisma.GuildConfigUncheckedUpdateInput = {};
    if (patch.locale !== undefined) scalarData.locale = patch.locale;
    if (patch.timezone !== undefined) scalarData.timezone = patch.timezone;
    if (patch.adminRoleIds !== undefined) scalarData.adminRoleIds = patch.adminRoleIds;
    if (patch.modRoleIds !== undefined) scalarData.modRoleIds = patch.modRoleIds;
    if (patch.helperRoleIds !== undefined) scalarData.helperRoleIds = patch.helperRoleIds;
    if (patch.modLogChannelId !== undefined) scalarData.modLogChannelId = patch.modLogChannelId;
    if (patch.staffChannelId !== undefined) scalarData.staffChannelId = patch.staffChannelId;
    if (patch.appealsChannelId !== undefined) scalarData.appealsChannelId = patch.appealsChannelId;
    if (patch.fastActions !== undefined) scalarData.fastActions = patch.fastActions;
    if (patch.dataCollectionEnabled !== undefined)
      scalarData.dataCollectionEnabled = patch.dataCollectionEnabled;
    if (patch.logMessageContent !== undefined) scalarData.logMessageContent = patch.logMessageContent;
    if (patch.dmOnModeration !== undefined) scalarData.dmOnModeration = patch.dmOnModeration;
    if (patch.setupCompletedAt !== undefined) {
      scalarData.setupCompletedAt = patch.setupCompletedAt ? new Date(patch.setupCompletedAt) : null;
    }

    const row = await this.prisma.guildConfig.upsert({
      where: { guildId },
      // scalarData only ever holds plain scalar values (never the wrapped `{ set: ... }` operation form), so it
      // structurally satisfies the unchecked create input too; its declared type is just the (wider) update-input shape.
      create: { guildId, ...scalarData } as Prisma.GuildConfigUncheckedCreateInput,
      update: scalarData,
    });

    await this.redis.del(this.guildConfigCacheKey(guildId));
    const after = toGuildConfigData(guildId, row);

    await writeAudit(this.prisma, {
      guildId,
      actorId: actor.id,
      actorType: actorTypeFor(actor),
      action: AuditAction.ConfigUpdate,
      targetType: 'guild_config',
      targetId: guildId,
      before: redactForAudit(before),
      after: redactForAudit(after),
      source: actor.source,
    });

    // 'admin' owns core GuildConfig; there's no plugin-specific pluginId for this change.
    this.events?.emit('guild.configChanged', {
      guildId,
      pluginId: 'admin',
      actorId: actor.id,
      source: actor.source,
    });

    return after;
  }
}
