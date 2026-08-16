import type { ActionSource, ModerationCase, ModerationCaseType } from '@entrophy/database';
import type { PluginId } from '@entrophy/types';
import type { GuildConfigData, GuildConfigPatch } from './config-store';
import type { PluginAvailability } from './registry';
import type { PluginHealth, PluginManifest } from './types';

/** Input to `moderation.createCase` (ARCHITECTURE.md §7.5). */
export interface CreateModerationCaseInput {
  guildId: string;
  type: ModerationCaseType;
  targetId: string;
  moderatorId: string;
  reason?: string;
  evidenceUrls?: string[];
  durationMs?: number;
  source: ActionSource;
  metadata?: Record<string, unknown>;
  /** Whether to attempt a DM to the target explaining the action; failures are swallowed (see `safeDm`). */
  dmUser?: boolean;
}

export interface WarnInput {
  guildId: string;
  targetId: string;
  moderatorId: string;
  reason?: string;
  source: ActionSource;
  dmUser?: boolean;
}

export interface TimeoutInput {
  guildId: string;
  targetId: string;
  moderatorId: string;
  durationMs: number;
  reason?: string;
  source: ActionSource;
  dmUser?: boolean;
}

export interface ListCasesInput {
  guildId: string;
  targetId?: string;
  moderatorId?: string;
  type?: ModerationCaseType;
  cursor?: string | null;
  limit?: number;
}

export interface ListCasesResult {
  items: ModerationCase[];
  nextCursor: string | null;
}

/** Cross-plugin moderation actions, registered by the `moderation` plugin in `onLoad`. */
export interface ModerationService {
  createCase(input: CreateModerationCaseInput): Promise<ModerationCase>;
  warn(input: WarnInput): Promise<ModerationCase>;
  timeout(input: TimeoutInput): Promise<ModerationCase>;
  getCase(guildId: string, caseNumber: number): Promise<ModerationCase | null>;
  listCases(input: ListCasesInput): Promise<ListCasesResult>;
}

/** Log event kinds the `logging` plugin routes to configured channels (ARCHITECTURE.md §7.5). */
export type LogKind =
  | 'member.join'
  | 'member.leave'
  | 'message.edit'
  | 'message.delete'
  | 'role.update'
  | 'channel.update'
  | 'guild.update'
  | 'moderation.action'
  | 'voice.join'
  | 'voice.leave'
  | 'invite.use'
  | 'bot.error'
  | 'webhook.failure'
  | 'automod.trigger'
  | 'ticket.event'
  | 'verification.event';

export interface LogEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface LogPayload {
  actorId?: string;
  targetId?: string;
  channelId?: string;
  messageId?: string;
  title?: string;
  description?: string;
  fields?: LogEmbedField[];
  color?: number;
  /** Only populated when the guild has opted into message-content logging (`GuildConfig.logMessageContent`). */
  contentBefore?: string;
  contentAfter?: string;
  attachments?: string[];
}

/** Routes structured log events to configured log channels, registered by the `logging` plugin. */
export interface LoggingService {
  log(guildId: string, kind: LogKind, payload: LogPayload): Promise<void>;
}

/** Registered by the `automod` plugin so other plugins can trigger a quarantine without depending on it directly. */
export interface AutomodService {
  quarantine(guildId: string, userId: string, reason: string): Promise<void>;
}

export interface CreateTicketInput {
  guildId: string;
  openerId: string;
  channelId?: string;
  subject?: string;
  intake?: Record<string, unknown>;
}

/** Registered by the `tickets` plugin. */
export interface TicketsService {
  createTicket(input: CreateTicketInput): Promise<{ id: string; number: number }>;
  closeTicket(guildId: string, ticketId: string, closedBy: string, reason?: string): Promise<void>;
}

export interface AssignRolesInput {
  guildId: string;
  userId: string;
  addRoleIds?: string[];
  removeRoleIds?: string[];
  reason?: string;
}

export interface VerifyMemberInput {
  guildId: string;
  userId: string;
  method: string;
}

/** Registered by the `roles` plugin. */
export interface RolesService {
  assignRoles(input: AssignRolesInput): Promise<void>;
  verifyMember(input: VerifyMemberInput): Promise<void>;
}

/** Registered by the `integrations` plugin. */
export interface IntegrationsService {
  sendOutbound(guildId: string, endpointId: string, payload: unknown): Promise<{ delivered: boolean; error?: string }>;
}

export interface AiCompleteInput {
  guildId: string;
  userId: string;
  command: string;
  prompt: string;
  system?: string;
  maxTokens?: number;
}

export interface AiCompleteResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
  model: string;
  provider: string;
}

/** Registered by the `ai` plugin. */
export interface AiService {
  complete(input: AiCompleteInput): Promise<AiCompleteResult>;
}

export interface HostEnableActor {
  id: string;
  source: 'bot' | 'dashboard' | 'system';
}

export interface HostBotStats {
  wsPingMs: number;
  uptimeSec: number;
  guildCount: number;
  memoryMb: number;
}

/**
 * Registered by the bot/api host process itself (not a feature plugin). The `admin` plugin is the one place
 * that needs cross-plugin, host-level operations (arbitrary plugin enablement/config, core `GuildConfig`,
 * bot-wide stats) that a normal `PluginContext` deliberately doesn't expose to every plugin — this is that
 * seam, so `admin`'s `/setup`, `/config`, `/plugin`, `/permissions`, and `/health` commands can reach them
 * without importing the bot host or holding their own `PluginRegistry`/`GuildConfigStore` instance.
 */
export interface HostService {
  /** Enables `pluginId` for `guildId` and runs its `onGuildEnable` hook, if any. Refuses always-enabled plugins. */
  enable(guildId: string, pluginId: PluginId, actor: HostEnableActor): Promise<void>;
  /** Disables `pluginId` for `guildId` and runs its `onGuildDisable` hook, if any. Refuses always-enabled plugins. */
  disable(guildId: string, pluginId: PluginId, actor: HostEnableActor): Promise<void>;
  isPluginEnabled(guildId: string, pluginId: PluginId): Promise<boolean>;
  /** Every loaded plugin's manifest, in registration order (ARCHITECTURE.md §7.1). */
  listManifests(): PluginManifest[];
  getManifest(pluginId: PluginId): PluginManifest | undefined;
  /** Availability (env/intents) for every loaded plugin, as computed by `PluginRegistry.availability`. */
  getPluginAvailability(): Map<PluginId, PluginAvailability>;
  /** Result of `plugin.health(ctx)` for a loaded plugin that declares one; `undefined` if it doesn't or isn't loaded. */
  getPluginHealth(pluginId: PluginId): Promise<PluginHealth | undefined>;
  getPluginConfig<T = unknown>(guildId: string, pluginId: PluginId): Promise<T>;
  setPluginConfig<T = unknown>(guildId: string, pluginId: PluginId, patch: Partial<T>, actor: HostEnableActor): Promise<T>;
  getGuildConfig(guildId: string): Promise<GuildConfigData>;
  updateGuildConfig(guildId: string, patch: GuildConfigPatch, actor: HostEnableActor): Promise<GuildConfigData>;
  getBotStats(): HostBotStats;
}

/** Typed map of cross-plugin service keys to their implementation shape (ARCHITECTURE.md §7.5). */
export interface ServiceMap {
  moderation: ModerationService;
  logging: LoggingService;
  automod: AutomodService;
  tickets: TicketsService;
  roles: RolesService;
  integrations: IntegrationsService;
  ai: AiService;
  host: HostService;
}

/** Registry of cross-plugin services. Consumers call `.get(key)` and no-op gracefully when the provider isn't loaded. */
export class ServiceRegistry {
  private readonly services = new Map<keyof ServiceMap, ServiceMap[keyof ServiceMap]>();

  /** Registers (overwriting any existing) implementation for `key`. */
  register<K extends keyof ServiceMap>(key: K, impl: ServiceMap[K]): void {
    this.services.set(key, impl);
  }

  /** Returns the implementation for `key`, or `undefined` if no plugin has registered it (e.g. it's disabled/unavailable). */
  get<K extends keyof ServiceMap>(key: K): ServiceMap[K] | undefined {
    return this.services.get(key) as ServiceMap[K] | undefined;
  }

  /** Like `get`, but throws a descriptive error if the service isn't registered. */
  require<K extends keyof ServiceMap>(key: K): ServiceMap[K] {
    const impl = this.get(key);
    if (!impl) {
      throw new Error(`Service "${key}" is not registered (its owning plugin may be disabled or unavailable).`);
    }
    return impl;
  }

  /** True if `key` currently has a registered implementation. */
  has(key: keyof ServiceMap): boolean {
    return this.services.has(key);
  }
}
