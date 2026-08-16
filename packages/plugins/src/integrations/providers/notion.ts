import { z } from 'zod';
import { EMBED_LIMITS, truncate } from '@entrophy/core';
import { getValidAccessToken } from './oauth-tokens';
import { claimAlertOnce, markConnectionError, markConnectionSynced, sendConnectionAlert } from './util';
import type { IntegrationProviderDef } from './types';
import type { AlertEmbedData } from '../formatters/types';

const NOTION_BLACK = 0x000000;
const NOTION_VERSION = '2022-06-28';

export const notionConfigSchema = z.object({
  target: z.string().trim().min(1).max(100), // Notion database id
  channelId: z.string().regex(/^\d{17,20}$/),
  roleId: z.string().regex(/^\d{17,20}$/).nullable().optional(),
  template: z.string().max(300).nullable().optional(),
});

interface NotionTitleProperty {
  type: 'title';
  title: { plain_text: string }[];
}
interface NotionPage {
  id: string;
  url: string;
  created_time: string;
  properties: Record<string, unknown>;
}
interface NotionQueryResponse {
  results: NotionPage[];
}

function pageTitle(page: NotionPage): string {
  for (const value of Object.values(page.properties)) {
    const prop = value as NotionTitleProperty;
    if (prop?.type === 'title') {
      return prop.title.map((t) => t.plain_text).join('') || '(untitled)';
    }
  }
  return '(untitled)';
}

function pageEmbed(page: NotionPage): AlertEmbedData {
  return {
    title: truncate(pageTitle(page), EMBED_LIMITS.title),
    url: page.url,
    color: NOTION_BLACK,
    footer: 'Notion',
  };
}

export const notionProvider: IntegrationProviderDef = {
  id: 'notion',
  name: 'Notion',
  kind: 'oauth',
  requiredEnv: ['NOTION_CLIENT_ID', 'NOTION_CLIENT_SECRET'],
  pollIntervalSeconds: 600,
  configSchema: notionConfigSchema,
  async poll(ctx, connection) {
    const accessToken = await getValidAccessToken(ctx, 'notion', connection);
    if (!accessToken) {
      await markConnectionError(ctx, connection.id, 'Notion is not authorized (connect again from the dashboard).');
      return;
    }

    const raw = (connection.config as Record<string, unknown> | null) ?? {};
    const databaseId = typeof raw.target === 'string' ? raw.target : '';
    if (!databaseId) return;

    const res = await fetch(`https://api.notion.com/v1/databases/${encodeURIComponent(databaseId)}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sorts: [{ timestamp: 'created_time', direction: 'descending' }], page_size: 5 }),
    });
    if (!res.ok) {
      await markConnectionError(ctx, connection.id, `Notion query failed (${res.status}).`);
      return;
    }
    const json = (await res.json()) as NotionQueryResponse;

    for (const page of [...json.results].reverse()) {
      const isNew = await claimAlertOnce(ctx, 'notion', connection.id, page.id);
      if (!isNew) continue;
      await sendConnectionAlert(ctx, connection, pageEmbed(page));
    }

    await markConnectionSynced(ctx, connection.id);
  },
};
