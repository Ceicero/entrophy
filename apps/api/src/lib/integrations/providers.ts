import { ExternalServiceError, env } from '@entrophy/core';
import type { IntegrationProvider } from '@entrophy/database';
import {
  INTEGRATION_PROVIDER_IDS,
  type IntegrationProviderId as CanonicalProviderId,
  type IntegrationProviderInfoDto,
  type IntegrationProviderKind,
} from '@entrophy/types/integrations';

export type OAuthProviderId = 'twitch' | 'google' | 'microsoft' | 'notion' | 'reddit';
/** Providers that connect via an inbound webhook endpoint (a secret + URL) rather than OAuth. */
export type WebhookProviderId = 'github' | 'stripe' | 'generic_webhook';
export type IntegrationProviderId = OAuthProviderId | WebhookProviderId;

export const OAUTH_PROVIDER_IDS: readonly OAuthProviderId[] = [
  'twitch',
  'google',
  'microsoft',
  'notion',
  'reddit',
];
export const WEBHOOK_PROVIDER_IDS: readonly WebhookProviderId[] = ['github', 'stripe', 'generic_webhook'];

interface EnvKeys {
  clientId:
    'TWITCH_CLIENT_ID' | 'GOOGLE_CLIENT_ID' | 'MICROSOFT_CLIENT_ID' | 'NOTION_CLIENT_ID' | 'REDDIT_CLIENT_ID';
  clientSecret:
    | 'TWITCH_CLIENT_SECRET'
    | 'GOOGLE_CLIENT_SECRET'
    | 'MICROSOFT_CLIENT_SECRET'
    | 'NOTION_CLIENT_SECRET'
    | 'REDDIT_CLIENT_SECRET';
}

export interface OAuthProviderConfig {
  id: OAuthProviderId;
  label: string;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  envKeys: EnvKeys;
  extraAuthorizeParams?: Record<string, string>;
  /** 'basic' = client credentials sent as an HTTP Basic Authorization header (Reddit requires this); 'body' = sent as form fields. */
  tokenAuthStyle: 'body' | 'basic';
}

export const OAUTH_PROVIDERS: Record<OAuthProviderId, OAuthProviderConfig> = {
  twitch: {
    id: 'twitch',
    label: 'Twitch',
    authorizeUrl: 'https://id.twitch.tv/oauth2/authorize',
    tokenUrl: 'https://id.twitch.tv/oauth2/token',
    scope: '',
    envKeys: { clientId: 'TWITCH_CLIENT_ID', clientSecret: 'TWITCH_CLIENT_SECRET' },
    tokenAuthStyle: 'body',
  },
  google: {
    id: 'google',
    label: 'Google Calendar',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    envKeys: { clientId: 'GOOGLE_CLIENT_ID', clientSecret: 'GOOGLE_CLIENT_SECRET' },
    extraAuthorizeParams: { access_type: 'offline', prompt: 'consent' },
    tokenAuthStyle: 'body',
  },
  microsoft: {
    id: 'microsoft',
    label: 'Microsoft 365 Calendar',
    authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scope: 'offline_access Calendars.Read',
    envKeys: { clientId: 'MICROSOFT_CLIENT_ID', clientSecret: 'MICROSOFT_CLIENT_SECRET' },
    tokenAuthStyle: 'body',
  },
  notion: {
    id: 'notion',
    label: 'Notion',
    authorizeUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    scope: '',
    envKeys: { clientId: 'NOTION_CLIENT_ID', clientSecret: 'NOTION_CLIENT_SECRET' },
    extraAuthorizeParams: { owner: 'user' },
    tokenAuthStyle: 'basic',
  },
  reddit: {
    id: 'reddit',
    label: 'Reddit',
    authorizeUrl: 'https://www.reddit.com/api/v1/authorize',
    tokenUrl: 'https://www.reddit.com/api/v1/access_token',
    scope: 'identity read',
    envKeys: { clientId: 'REDDIT_CLIENT_ID', clientSecret: 'REDDIT_CLIENT_SECRET' },
    extraAuthorizeParams: { duration: 'permanent' },
    tokenAuthStyle: 'basic',
  },
};

/** Maps our lowercase provider ids to Prisma's `IntegrationProvider` enum values. */
export const PROVIDER_ENUM_MAP: Record<IntegrationProviderId, IntegrationProvider> = {
  twitch: 'TWITCH',
  google: 'GOOGLE_CALENDAR',
  microsoft: 'MICROSOFT_CALENDAR',
  notion: 'NOTION',
  reddit: 'REDDIT',
  github: 'GITHUB',
  stripe: 'STRIPE',
  generic_webhook: 'GENERIC_WEBHOOK',
};

export function isOAuthProvider(id: string): id is OAuthProviderId {
  return (OAUTH_PROVIDER_IDS as readonly string[]).includes(id);
}

export function isWebhookProvider(id: string): id is WebhookProviderId {
  return (WEBHOOK_PROVIDER_IDS as readonly string[]).includes(id);
}

/** True if both the client id and secret env vars are set for `providerId`. */
export function isOAuthProviderConfigured(providerId: OAuthProviderId): boolean {
  const cfg = OAUTH_PROVIDERS[providerId];
  return Boolean(env[cfg.envKeys.clientId] && env[cfg.envKeys.clientSecret]);
}

/**
 * Builds the provider's OAuth2 authorize URL with the given anti-CSRF `state`.
 *
 * `scopeOverride` lets a caller request a different scope than the provider's default `cfg.scope` for this one
 * authorize URL, without touching that default — used by the Twitch chat-bot flows (`routes/twitch-chat.ts`'s
 * per-guild `channel:bot` connect, `routes/twitch-bot.ts`'s owner-only `user:read:chat user:write:chat user:bot`
 * connect) so the existing generic Twitch integration's consent screen (`cfg.scope === ''`) never changes.
 */
export function buildProviderAuthorizeUrl(
  providerId: OAuthProviderId,
  state: string,
  redirectUri: string,
  scopeOverride?: string,
): string {
  const cfg = OAUTH_PROVIDERS[providerId];
  const clientId = env[cfg.envKeys.clientId];
  if (!clientId) {
    throw new ExternalServiceError(`${cfg.label} is not configured on this server.`);
  }
  const scope = scopeOverride ?? cfg.scope;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
    ...(scope ? { scope } : {}),
    ...cfg.extraAuthorizeParams,
  });
  return `${cfg.authorizeUrl}?${params.toString()}`;
}

export interface ExchangedProviderToken {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
  /** Normalized to a string array regardless of how the provider sent it — see `normalizeScope`. */
  scopes: string[];
}

interface RawTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  /** Most providers send a space-delimited string, but Twitch's `POST /oauth2/token` sends a JSON array of
   * strings instead (e.g. `["user:read:chat","user:write:chat","user:bot"]`). Typed as either shape so callers
   * can't reach for a bare `.split()` that only works for one of them — always go through `normalizeScope`. */
  scope?: string | string[];
}

/** Normalizes a provider's token-response `scope` — a space-delimited string for most providers, a JSON array
 * for Twitch (see `RawTokenResponse.scope`) — into a single consistent `string[]` shape for callers. */
function normalizeScope(scope: string | string[] | undefined): string[] {
  if (!scope) return [];
  if (Array.isArray(scope)) return scope.filter(Boolean);
  return scope.split(' ').filter(Boolean);
}

/** Exchanges an OAuth `code` for tokens with the provider's token endpoint. */
export async function exchangeProviderCode(
  providerId: OAuthProviderId,
  code: string,
  redirectUri: string,
): Promise<ExchangedProviderToken> {
  const cfg = OAUTH_PROVIDERS[providerId];
  const clientId = env[cfg.envKeys.clientId];
  const clientSecret = env[cfg.envKeys.clientSecret];
  if (!clientId || !clientSecret) {
    throw new ExternalServiceError(`${cfg.label} is not configured on this server.`);
  }

  const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };

  if (cfg.tokenAuthStyle === 'basic') {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  } else {
    body.set('client_id', clientId);
    body.set('client_secret', clientSecret);
  }

  const res = await fetch(cfg.tokenUrl, { method: 'POST', headers, body });
  if (!res.ok) {
    throw new ExternalServiceError(`${cfg.label} token exchange failed (${res.status}).`);
  }
  const json = (await res.json()) as RawTokenResponse;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in,
    tokenType: json.token_type,
    scopes: normalizeScope(json.scope),
  };
}

export interface TwitchHelixUser {
  id: string;
  login: string;
  displayName: string;
}

interface RawTwitchUsersResponse {
  data?: { id: string; login: string; display_name: string }[];
}

/**
 * Identifies the Twitch user behind a freshly-exchanged user access token via Helix `GET /users`. Shared by
 * both Twitch chat-bot connect flows (`routes/oauth-integrations.ts`'s `twitch_chat` branch identifies the
 * broadcaster; its `twitch_bot` branch identifies Entrophy's own bot account) — same call, different purpose.
 */
export async function identifyTwitchUser(accessToken: string): Promise<TwitchHelixUser> {
  const clientId = env.TWITCH_CLIENT_ID;
  if (!clientId) {
    throw new ExternalServiceError('Twitch is not configured on this server.');
  }
  const res = await fetch('https://api.twitch.tv/helix/users', {
    headers: { Authorization: `Bearer ${accessToken}`, 'Client-Id': clientId },
  });
  if (!res.ok) {
    throw new ExternalServiceError(`Twitch user lookup failed (${res.status}).`);
  }
  const json = (await res.json()) as RawTwitchUsersResponse;
  const user = json.data?.[0];
  if (!user) {
    throw new ExternalServiceError('Twitch user lookup returned no user.');
  }
  return { id: user.id, login: user.login, displayName: user.display_name };
}

// ---------------------------------------------------------------------------
// Setup-page provider availability (ARCHITECTURE.md's integrations connector spec: "GET /guilds/:id/integrations
// returns availability per provider"). This uses the canonical 10-provider-id set from `@entrophy/types/integrations`
// (matching what `/integration connect`/`alerts add` accept and the `IntegrationProvider` Prisma enum, lowercased)
// rather than this file's own 8-id `IntegrationProviderId` (which only covers the oauth/webhook connect flow above
// and predates youtube/steam being addressable at all — they connect only via `POST .../integrations/alerts`).
// -----------------------------------------------------------------------------

interface ProviderMeta {
  id: CanonicalProviderId;
  name: string;
  kind: IntegrationProviderKind;
  requiredEnv: string[];
}

const PROVIDER_META: Record<CanonicalProviderId, ProviderMeta> = {
  twitch: {
    id: 'twitch',
    name: 'Twitch',
    kind: 'oauth',
    requiredEnv: ['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET'],
  },
  youtube: { id: 'youtube', name: 'YouTube', kind: 'apikey', requiredEnv: ['YOUTUBE_API_KEY'] },
  github: { id: 'github', name: 'GitHub', kind: 'webhook', requiredEnv: [] },
  reddit: {
    id: 'reddit',
    name: 'Reddit',
    kind: 'apikey',
    requiredEnv: ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET', 'REDDIT_USER_AGENT'],
  },
  steam: { id: 'steam', name: 'Steam', kind: 'public', requiredEnv: ['STEAM_API_KEY'] },
  google_calendar: {
    id: 'google_calendar',
    name: 'Google Calendar',
    kind: 'oauth',
    requiredEnv: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
  },
  microsoft_calendar: {
    id: 'microsoft_calendar',
    name: 'Microsoft 365 Calendar',
    kind: 'oauth',
    requiredEnv: ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET'],
  },
  notion: {
    id: 'notion',
    name: 'Notion',
    kind: 'oauth',
    requiredEnv: ['NOTION_CLIENT_ID', 'NOTION_CLIENT_SECRET'],
  },
  stripe: {
    id: 'stripe',
    name: 'Stripe',
    kind: 'webhook',
    requiredEnv: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
  },
  generic_webhook: { id: 'generic_webhook', name: 'Generic webhook', kind: 'webhook', requiredEnv: [] },
};

const ALERT_CAPABLE: ReadonlySet<CanonicalProviderId> = new Set(['twitch', 'youtube', 'reddit', 'steam']);
export type AlertProviderId = 'twitch' | 'youtube' | 'reddit' | 'steam';
export const ALERT_PROVIDER_IDS: readonly AlertProviderId[] = ['twitch', 'youtube', 'reddit', 'steam'];

/** Canonical-id (`@entrophy/types/integrations`) -> Prisma `IntegrationProvider` enum, covering all 10 providers
 * (unlike `PROVIDER_ENUM_MAP` above, which only covers the 8 ids the oauth/webhook connect flow uses). */
export const CANONICAL_PROVIDER_ENUM_MAP: Record<CanonicalProviderId, IntegrationProvider> = {
  twitch: 'TWITCH',
  youtube: 'YOUTUBE',
  github: 'GITHUB',
  reddit: 'REDDIT',
  steam: 'STEAM',
  google_calendar: 'GOOGLE_CALENDAR',
  microsoft_calendar: 'MICROSOFT_CALENDAR',
  notion: 'NOTION',
  stripe: 'STRIPE',
  generic_webhook: 'GENERIC_WEBHOOK',
};

/** Per-provider availability for the dashboard's setup hints (which env vars the operator must still set). */
export function listProviderAvailability(): IntegrationProviderInfoDto[] {
  return INTEGRATION_PROVIDER_IDS.map((id) => {
    const meta = PROVIDER_META[id];
    const missingEnv = meta.requiredEnv.filter((key) => !env[key as keyof typeof env]);
    return {
      id: meta.id,
      name: meta.name,
      kind: meta.kind,
      available: missingEnv.length === 0,
      missingEnv,
      supportsAlerts: ALERT_CAPABLE.has(id),
    };
  });
}
