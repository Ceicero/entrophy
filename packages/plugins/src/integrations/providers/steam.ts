import { z } from 'zod';
import { formatSteamNewsEmbed, type SteamNewsItem } from '../formatters/steam';
import { claimAlertOnce, markConnectionError, markConnectionSynced, readAlertConfig, sendConnectionAlert } from './util';
import type { IntegrationProviderDef } from './types';

const API_BASE = 'https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002';

export const steamConfigSchema = z.object({
  target: z.string().trim().regex(/^\d+$/, 'Must be a numeric Steam app id.'),
  channelId: z.string().regex(/^\d{17,20}$/),
  roleId: z.string().regex(/^\d{17,20}$/).nullable().optional(),
  template: z.string().max(300).nullable().optional(),
  appName: z.string().max(100).nullable().optional(),
});

interface SteamNewsResponse {
  appnews?: { appid: number; newsitems: SteamNewsItem[] };
}

export const steamProvider: IntegrationProviderDef = {
  id: 'steam',
  name: 'Steam',
  kind: 'public',
  requiredEnv: ['STEAM_API_KEY'],
  pollIntervalSeconds: 1800,
  configSchema: steamConfigSchema,
  async poll(ctx, connection) {
    const apiKey = ctx.env.STEAM_API_KEY;
    if (!apiKey) {
      await markConnectionError(ctx, connection.id, 'STEAM_API_KEY is not configured on this server.');
      return;
    }

    const config = readAlertConfig(connection);
    if (!config.target) return;
    const raw = (connection.config as Record<string, unknown> | null) ?? {};
    const appName = typeof raw.appName === 'string' ? raw.appName : undefined;

    const params = new URLSearchParams({ appid: config.target, count: '5', maxlength: '400', format: 'json', key: apiKey });
    const res = await fetch(`${API_BASE}/?${params.toString()}`);
    if (!res.ok) {
      await markConnectionError(ctx, connection.id, `Steam news request failed (${res.status}).`);
      return;
    }
    const json = (await res.json()) as SteamNewsResponse;
    const items = json.appnews?.newsitems ?? [];

    for (const item of [...items].reverse()) {
      const isNew = await claimAlertOnce(ctx, 'steam', connection.id, item.gid);
      if (!isNew) continue;
      const embed = formatSteamNewsEmbed(item, appName);
      await sendConnectionAlert(ctx, connection, embed);
    }

    await markConnectionSynced(ctx, connection.id);
  },
};
