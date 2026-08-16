import { ExternalServiceError, env } from '@entrophy/core';
import type { IntegrationProvider } from '@entrophy/database';

export type OAuthProviderId = 'twitch' | 'google' | 'microsoft' | 'notion' | 'reddit';
/** Providers that connect via an inbound webhook endpoint (a secret + URL) rather than OAuth. */
export type WebhookProviderId = 'github' | 'stripe' | 'generic_webhook';
export type IntegrationProviderId = OAuthProviderId | WebhookProviderId;

export const OAUTH_PROVIDER_IDS: readonly OAuthProviderId[] = ['twitch', 'google', 'microsoft', 'notion', 'reddit'];
export const WEBHOOK_PROVIDER_IDS: readonly WebhookProviderId[] = ['github', 'stripe', 'generic_webhook'];

interface EnvKeys {
  clientId: 'TWITCH_CLIENT_ID' | 'GOOGLE_CLIENT_ID' | 'MICROSOFT_CLIENT_ID' | 'NOTION_CLIENT_ID' | 'REDDIT_CLIENT_ID';
  clientSecret: 'TWITCH_CLIENT_SECRET' | 'GOOGLE_CLIENT_SECRET' | 'MICROSOFT_CLIENT_SECRET' | 'NOTION_CLIENT_SECRET' | 'REDDIT_CLIENT_SECRET';
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

/** Builds the provider's OAuth2 authorize URL with the given anti-CSRF `state`. */
export function buildProviderAuthorizeUrl(providerId: OAuthProviderId, state: string, redirectUri: string): string {
  const cfg = OAUTH_PROVIDERS[providerId];
  const clientId = env[cfg.envKeys.clientId];
  if (!clientId) {
    throw new ExternalServiceError(`${cfg.label} is not configured on this server.`);
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
    ...(cfg.scope ? { scope: cfg.scope } : {}),
    ...cfg.extraAuthorizeParams,
  });
  return `${cfg.authorizeUrl}?${params.toString()}`;
}

export interface ExchangedProviderToken {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
  scope?: string;
}

interface RawTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

/** Exchanges an OAuth `code` for tokens with the provider's token endpoint. */
export async function exchangeProviderCode(providerId: OAuthProviderId, code: string, redirectUri: string): Promise<ExchangedProviderToken> {
  const cfg = OAUTH_PROVIDERS[providerId];
  const clientId = env[cfg.envKeys.clientId];
  const clientSecret = env[cfg.envKeys.clientSecret];
  if (!clientId || !clientSecret) {
    throw new ExternalServiceError(`${cfg.label} is not configured on this server.`);
  }

  const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };

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
    scope: json.scope,
  };
}
