import type { PluginId } from './plugins';

/**
 * Typed in-process platform event bus payloads (ARCHITECTURE.md §7.6).
 * Deliberately has no index signature so `keyof` yields exactly the known event names.
 */
export interface PlatformEventMap {
  'guild.configChanged': {
    guildId: string;
    pluginId: PluginId;
    actorId: string;
    source: 'bot' | 'dashboard' | 'system';
  };
  'plugin.enabled': { guildId: string; pluginId: PluginId; actorId: string };
  'plugin.disabled': { guildId: string; pluginId: PluginId; actorId: string };
  'moderation.caseCreated': {
    guildId: string;
    caseId: string;
    caseNumber: number;
    type: string;
    targetId: string;
    moderatorId: string;
    reason?: string;
  };
  'moderation.caseUpdated': {
    guildId: string;
    caseId: string;
    caseNumber: number;
    type: string;
    targetId: string;
    moderatorId: string;
    reason?: string;
  };
  'automod.triggered': {
    guildId: string;
    ruleId: string;
    ruleType: string;
    userId: string;
    channelId: string;
    action: string;
    dryRun: boolean;
  };
  'ticket.opened': { guildId: string; ticketId: string; userId: string };
  'ticket.closed': { guildId: string; ticketId: string; userId: string };
  'member.verified': { guildId: string; userId: string; method: string };
  'level.up': { guildId: string; userId: string; level: number };
  'plugin.error': { pluginId: PluginId; guildId?: string; error: string; context?: unknown };
  'webhook.deliveryFailed': { guildId: string; endpointId: string; status?: number; error: string };
  'moderation.appealOpened': {
    guildId: string;
    appealId: string;
    caseId: string;
    caseNumber: number;
    userId: string;
  };
  'moderation.appealDecided': {
    guildId: string;
    appealId: string;
    caseId: string;
    caseNumber: number;
    userId: string;
    accepted: boolean;
    reviewerId: string;
  };
  'enforcer.flagged': {
    guildId: string;
    recordId: string;
    recordNumber: number;
    userId: string;
    policyId?: string;
    source: string;
  };
  'enforcer.decided': {
    guildId: string;
    recordId: string;
    recordNumber: number;
    userId: string;
    decision: string;
    moderatorId: string;
    caseId?: string;
  };
}

/** Union of all platform event names. */
export type PlatformEventName = keyof PlatformEventMap;
