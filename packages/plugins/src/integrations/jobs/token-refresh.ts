import type { PluginJob } from '../../sdk';
import { providerIdFromEnum } from '../providers';
import { OAUTH_REFRESH_META, refreshOAuthToken } from '../providers/oauth-tokens';

const WINDOW_MS = 30 * 60 * 1000; // refresh anything expiring within the next 30 minutes

function isRefreshableProvider(id: string | undefined): id is keyof typeof OAUTH_REFRESH_META {
  return id === 'google_calendar' || id === 'microsoft_calendar' || id === 'notion';
}

/** Every `OAuthToken` row expiring within `WINDOW_MS`, joined to its `IntegrationConnection` for the provider tag. */
export function selectTokensDueForRefresh<T extends { expiresAt: Date | null }>(
  tokens: T[],
  now: Date,
  windowMs = WINDOW_MS,
): T[] {
  return tokens.filter((t) => t.expiresAt !== null && t.expiresAt.getTime() - now.getTime() < windowMs);
}

/** Proactively refreshes OAuth tokens expiring soon (ARCHITECTURE.md's integrations connector spec: "refresh
 * job 'integrations:token-refresh' every 10 min for tokens expiring within 30 min"). Runs across every guild. */
export const tokenRefreshJob: PluginJob = {
  name: 'token-refresh',
  repeat: { pattern: '*/10 * * * *' },
  concurrency: 1,
  async processor(ctx) {
    const now = new Date();
    const candidates = await ctx.prisma.oAuthToken.findMany({
      where: {
        expiresAt: { not: null, lt: new Date(now.getTime() + WINDOW_MS) },
        connection: { deletedAt: null, status: { not: 'DISCONNECTED' } },
      },
      include: { connection: true },
    });

    const due = selectTokensDueForRefresh(candidates, now);

    for (const token of due) {
      const providerId = providerIdFromEnum(token.connection.provider);
      if (!isRefreshableProvider(providerId)) continue;

      const refreshed = await refreshOAuthToken(ctx, providerId, token);
      if (!refreshed) {
        await ctx.prisma.integrationConnection
          .update({
            where: { id: token.connectionId },
            data: {
              status: 'ERROR',
              lastError: 'Token refresh failed — reconnect this integration from the dashboard.',
            },
          })
          .catch(() => undefined);
        ctx.logger.warn(
          { connectionId: token.connectionId, provider: providerId },
          'integrations: token refresh failed',
        );
      }
    }
  },
};
