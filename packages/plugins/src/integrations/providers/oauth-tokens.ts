import type { IntegrationConnection, OAuthToken } from '@entrophy/database';
import { decryptSecret, encryptSecret } from '@entrophy/core';
import type { PluginContext } from '../../sdk';

/** Token endpoint + client-credential env var names for the three providers whose bot-side jobs need to refresh
 * a user-authorized OAuth token (google_calendar, microsoft_calendar, notion — twitch/reddit poll with an
 * app-level client-credentials token instead, see `twitch.ts`/`reddit.ts`, so they aren't here). */
export interface OAuthRefreshMeta {
  tokenUrl: string;
  clientIdEnv: 'GOOGLE_CLIENT_ID' | 'MICROSOFT_CLIENT_ID' | 'NOTION_CLIENT_ID';
  clientSecretEnv: 'GOOGLE_CLIENT_SECRET' | 'MICROSOFT_CLIENT_SECRET' | 'NOTION_CLIENT_SECRET';
  /** Notion's token endpoint expects Basic auth with the client credentials rather than form fields. */
  authStyle: 'body' | 'basic';
}

export const OAUTH_REFRESH_META: Record<
  'google_calendar' | 'microsoft_calendar' | 'notion',
  OAuthRefreshMeta
> = {
  google_calendar: {
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
    authStyle: 'body',
  },
  microsoft_calendar: {
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    clientIdEnv: 'MICROSOFT_CLIENT_ID',
    clientSecretEnv: 'MICROSOFT_CLIENT_SECRET',
    authStyle: 'body',
  },
  notion: {
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    clientIdEnv: 'NOTION_CLIENT_ID',
    clientSecretEnv: 'NOTION_CLIENT_SECRET',
    authStyle: 'basic',
  },
};

interface RawTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

/** Refreshes one `OAuthToken` row in place using its provider's refresh_token grant. Returns the new plaintext
 * access token, or `null` if there's no refresh token to use or the refresh request failed. */
export async function refreshOAuthToken(
  ctx: PluginContext,
  providerId: 'google_calendar' | 'microsoft_calendar' | 'notion',
  token: OAuthToken,
): Promise<string | null> {
  if (!token.refreshTokenEnc) return null;
  const meta = OAUTH_REFRESH_META[providerId];
  const clientId = ctx.env[meta.clientIdEnv];
  const clientSecret = ctx.env[meta.clientSecretEnv];
  if (!clientId || !clientSecret) return null;

  const refreshToken = decryptSecret(token.refreshTokenEnc);
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken });
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };

  if (meta.authStyle === 'basic') {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  } else {
    body.set('client_id', clientId);
    body.set('client_secret', clientSecret);
  }

  try {
    const res = await fetch(meta.tokenUrl, { method: 'POST', headers, body });
    if (!res.ok) {
      ctx.logger.warn({ status: res.status, provider: providerId }, 'integrations: token refresh failed');
      return null;
    }
    const json = (await res.json()) as RawTokenResponse;

    await ctx.prisma.oAuthToken.update({
      where: { id: token.id },
      data: {
        accessTokenEnc: encryptSecret(json.access_token),
        refreshTokenEnc: json.refresh_token ? encryptSecret(json.refresh_token) : undefined,
        expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null,
        rotatedAt: new Date(),
      },
    });

    return json.access_token;
  } catch (err) {
    ctx.logger.warn({ err, provider: providerId }, 'integrations: token refresh request threw');
    return null;
  }
}

/** Returns a valid (refreshing first if it's expired or expiring within `skewMs`) decrypted access token for
 * `connection`, or `null` if there's no token row, no refresh token, or the refresh failed. */
export async function getValidAccessToken(
  ctx: PluginContext,
  providerId: 'google_calendar' | 'microsoft_calendar' | 'notion',
  connection: IntegrationConnection,
  skewMs = 60_000,
): Promise<string | null> {
  const token = await ctx.prisma.oAuthToken.findUnique({ where: { connectionId: connection.id } });
  if (!token) return null;

  const expiringSoon = token.expiresAt ? token.expiresAt.getTime() - Date.now() < skewMs : false;
  if (!expiringSoon) {
    return decryptSecret(token.accessTokenEnc);
  }
  return refreshOAuthToken(ctx, providerId, token);
}
