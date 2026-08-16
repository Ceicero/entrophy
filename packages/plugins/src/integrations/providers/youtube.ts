import { z } from 'zod';
import { formatYoutubeUploadEmbed } from '../formatters/youtube';
import { claimAlertOnce, markConnectionError, markConnectionSynced, readAlertConfig, sendConnectionAlert } from './util';
import type { IntegrationProviderDef } from './types';

const API_BASE = 'https://www.googleapis.com/youtube/v3';

export const youtubeConfigSchema = z.object({
  target: z.string().trim().min(1).max(100), // YouTube channel id (UC...)
  channelId: z.string().regex(/^\d{17,20}$/),
  roleId: z.string().regex(/^\d{17,20}$/).nullable().optional(),
  template: z.string().max(300).nullable().optional(),
  /** Cached to avoid spending API quota re-resolving the uploads playlist id every poll. */
  uploadsPlaylistId: z.string().nullable().optional(),
});

interface YoutubeChannelsResponse {
  items: { contentDetails?: { relatedPlaylists?: { uploads?: string } } }[];
}
interface YoutubePlaylistItemsResponse {
  items: { snippet: { title: string; channelTitle: string; publishedAt: string; description?: string; resourceId: { videoId: string }; thumbnails?: { medium?: { url?: string } } } }[];
}

async function resolveUploadsPlaylistId(apiKey: string, channelId: string): Promise<string | null> {
  const res = await fetch(`${API_BASE}/channels?part=contentDetails&id=${encodeURIComponent(channelId)}&key=${apiKey}`);
  if (!res.ok) return null;
  const json = (await res.json()) as YoutubeChannelsResponse;
  return json.items[0]?.contentDetails?.relatedPlaylists?.uploads ?? null;
}

export const youtubeProvider: IntegrationProviderDef = {
  id: 'youtube',
  name: 'YouTube',
  kind: 'apikey',
  requiredEnv: ['YOUTUBE_API_KEY'],
  pollIntervalSeconds: 600,
  configSchema: youtubeConfigSchema,
  async poll(ctx, connection) {
    const apiKey = ctx.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      await markConnectionError(ctx, connection.id, 'YOUTUBE_API_KEY is not configured on this server.');
      return;
    }

    const config = readAlertConfig(connection);
    if (!config.target) return;

    const raw = (connection.config as Record<string, unknown> | null) ?? {};
    let uploadsPlaylistId = typeof raw.uploadsPlaylistId === 'string' ? raw.uploadsPlaylistId : null;

    if (!uploadsPlaylistId) {
      uploadsPlaylistId = await resolveUploadsPlaylistId(apiKey, config.target);
      if (!uploadsPlaylistId) {
        await markConnectionError(ctx, connection.id, `Could not resolve a YouTube channel for id "${config.target}".`);
        return;
      }
      await ctx.prisma.integrationConnection.update({ where: { id: connection.id }, data: { config: { ...raw, uploadsPlaylistId } } });
    }

    // playlistItems quota cost is 1 unit/call (vs 100 for search.list) — this is the quota-conscious way to poll uploads.
    const res = await fetch(`${API_BASE}/playlistItems?part=snippet&maxResults=5&playlistId=${encodeURIComponent(uploadsPlaylistId)}&key=${apiKey}`);
    if (!res.ok) {
      await markConnectionError(ctx, connection.id, `YouTube playlistItems request failed (${res.status}).`);
      return;
    }
    const json = (await res.json()) as YoutubePlaylistItemsResponse;

    for (const item of [...json.items].reverse()) {
      const videoId = item.snippet.resourceId.videoId;
      const isNew = await claimAlertOnce(ctx, 'youtube', connection.id, videoId);
      if (!isNew) continue;
      const embed = formatYoutubeUploadEmbed(
        {
          videoId,
          title: item.snippet.title,
          channelTitle: item.snippet.channelTitle,
          publishedAt: item.snippet.publishedAt,
          thumbnailUrl: item.snippet.thumbnails?.medium?.url,
        },
        { template: config.template ?? undefined },
      );
      await sendConnectionAlert(ctx, connection, embed);
    }

    await markConnectionSynced(ctx, connection.id);
  },
};
