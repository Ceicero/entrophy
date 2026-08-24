// DTOs owned by the `integrations` build stage (ARCHITECTURE.md §7.1 row 'integrations', §10, SPEC.md §J).
// Imported via the subpath '@entrophy/types/integrations' (packages/types exports "./*") so this file can be
// added without touching the shared index.ts barrel (owned by the wiring stage).
import type { IntegrationConnectionDto, WebhookEndpointDto } from './api';

/** Every connector the `integrations` plugin knows about, matching (lowercased) `IntegrationProvider` Prisma enum values. */
export const INTEGRATION_PROVIDER_IDS = [
  'twitch',
  'youtube',
  'github',
  'reddit',
  'steam',
  'google_calendar',
  'microsoft_calendar',
  'notion',
  'stripe',
  'generic_webhook',
] as const;

export type IntegrationProviderId = (typeof INTEGRATION_PROVIDER_IDS)[number];

/** How a connection to this provider is established. */
export type IntegrationProviderKind = 'oauth' | 'apikey' | 'webhook' | 'public';

/** Providers that support `/integration alerts add|remove|list` watch-target connections. */
export const ALERT_PROVIDER_IDS = ['twitch', 'youtube', 'reddit', 'steam'] as const;
export type AlertProviderId = (typeof ALERT_PROVIDER_IDS)[number];

/** `GET /guilds/:guildId/integrations/providers` — per-provider availability, for the dashboard's setup hints. */
export interface IntegrationProviderInfoDto {
  id: IntegrationProviderId;
  name: string;
  kind: IntegrationProviderKind;
  available: boolean;
  missingEnv: string[];
  supportsAlerts: boolean;
}

/** An alert-watch connection (`/integration alerts add`): one `IntegrationConnection` row per watched target. */
export interface IntegrationConnectionDetailDto extends IntegrationConnectionDto {
  label: string | null;
  target: string | null;
  channelId: string | null;
  roleId: string | null;
  template: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
}

export interface WebhookEndpointDetailDto extends WebhookEndpointDto {
  name: string;
  events: string[];
  channelId: string | null;
  failureCount: number;
  lastDeliveryAt: string | null;
}

export interface WebhookDeliveryDto {
  id: string;
  endpointId: string;
  direction: 'inbound' | 'outbound';
  status: number | null;
  success: boolean;
  attempt: number;
  error: string | null;
  createdAt: string;
}

export interface CreateAlertConnectionInput {
  provider: AlertProviderId;
  target: string;
  channelId: string;
  roleId?: string | null;
  template?: string | null;
}

export interface UpdateAlertConnectionInput {
  channelId?: string;
  roleId?: string | null;
  template?: string | null;
}

export interface CreateOutboundEndpointInput {
  name: string;
  url: string;
  events: string[];
}

export interface CreateInboundWebhookInput {
  name: string;
  provider?: string;
  channelId?: string | null;
  events?: string[];
}

/** Returned exactly once, at creation time, for both inbound (HMAC secret) and future secret-rotation flows. */
export interface WebhookSecretRevealDto {
  secret: string;
  url: string;
}

export interface StripeRewardRule {
  priceId: string;
  roleId: string;
}

export interface ConnectOAuthResponseDto {
  url: string;
}

/** Platform events an outbound webhook can subscribe to. Single source of truth for this list — the `integrations`
 * plugin (packages/plugins/src/integrations/service.ts), the API's validation schema
 * (apps/api/src/lib/integrations/outbound-events.ts), and the dashboard's create-webhook form all reference this
 * instead of duplicating the literal (ARCHITECTURE.md §11: the dashboard never imports `@entrophy/plugins`, so this
 * lives in the one package both sides already depend on). */
export const OUTBOUND_PLATFORM_EVENTS = [
  'moderation.caseCreated',
  'ticket.opened',
  'ticket.closed',
  'member.verified',
  'level.up',
  'automod.triggered',
  'enforcer.decided',
] as const;

export type OutboundPlatformEvent = (typeof OUTBOUND_PLATFORM_EVENTS)[number];

// ---------------------------------------------------------------------------
// Twitch chat bot — Entrophy joins a streamer's Twitch chat; lives inside the `integrations` plugin
// rather than as its own 15th plugin. Runtime lives in packages/plugins/src/integrations/twitch-chat/;
// API routes in apps/api/src/routes/twitch-chat.ts.
// ---------------------------------------------------------------------------

/** Chat-privilege ladder for custom commands, matching (lowercased) the `TwitchChatLevel` Prisma enum. */
export const TWITCH_CHAT_LEVELS = ['everyone', 'subscriber', 'vip', 'moderator', 'broadcaster'] as const;

export type TwitchChatLevelId = (typeof TWITCH_CHAT_LEVELS)[number];

/** Built-in command names every channel already answers; custom commands may not reuse them. */
export const TWITCH_CHAT_RESERVED_COMMAND_NAMES = ['commands', 'uptime', 'title'] as const;

/** One linked Twitch channel's chat-bot config, as returned to the dashboard/bot. */
export interface TwitchChatChannelDto {
  id: string;
  broadcasterLogin: string;
  broadcasterUserId: string;
  enabled: boolean;
  status: 'connected' | 'disconnected' | 'error' | 'pending';
  lastError: string | null;
  commandPrefix: string;
  createdAt: string;
}

/** `GET /guilds/:guildId/integrations/twitch-chat` — overall chat-bot availability + this guild's channels. */
export interface TwitchChatStatusDto {
  /** Whether Entrophy's own Twitch bot account (`TwitchBotIdentity`) has been authorized by the bot owner. */
  botConfigured: boolean;
  botLogin: string | null;
  /** Whether TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET are set on this deployment at all. */
  envConfigured: boolean;
  channels: TwitchChatChannelDto[];
}

export interface TwitchChatCommandDto {
  id: string;
  name: string;
  response: string;
  cooldownSeconds: number;
  minLevel: TwitchChatLevelId;
  enabled: boolean;
  createdAt: string;
}

export interface TwitchChatTimerDto {
  id: string;
  name: string;
  message: string;
  intervalMinutes: number;
  enabled: boolean;
  lastFiredAt: string | null;
  createdAt: string;
}

export interface UpdateTwitchChatChannelInput {
  enabled?: boolean;
  /** Exactly one printable, non-space, non-`/` character. */
  commandPrefix?: string;
}

export interface CreateTwitchChatCommandInput {
  name: string;
  response: string;
  cooldownSeconds?: number;
  minLevel?: TwitchChatLevelId;
}

export interface UpdateTwitchChatCommandInput {
  name?: string;
  response?: string;
  cooldownSeconds?: number;
  minLevel?: TwitchChatLevelId;
  enabled?: boolean;
}

export interface CreateTwitchChatTimerInput {
  name: string;
  message: string;
  intervalMinutes: number;
}

export interface UpdateTwitchChatTimerInput {
  name?: string;
  message?: string;
  intervalMinutes?: number;
  enabled?: boolean;
}

/** Owner-only (`/owner/twitch-bot`): Entrophy's own Twitch bot account status. */
export interface TwitchBotIdentityDto {
  botLogin: string;
  botUserId: string;
  status: 'connected' | 'disconnected' | 'error' | 'pending';
  lastError: string | null;
  scopes: string[];
  connectedAt: string;
}
