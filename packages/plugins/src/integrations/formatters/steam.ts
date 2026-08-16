import type { AlertEmbedData } from './types';

const STEAM_BLUE = 0x1b2838;
const HTML_TAG_PATTERN = /<[^>]+>/g;

export interface SteamNewsItem {
  gid: string;
  title: string;
  url: string;
  author?: string;
  contents?: string;
  appid: number;
  date?: number;
}

/** Strips the light HTML/BBCode Steam's news API embeds in `contents`, for a plain-text embed description. */
function stripMarkup(text: string): string {
  return text.replace(HTML_TAG_PATTERN, '').replace(/\[.*?\]/g, '').trim();
}

/** Builds the "news post" alert embed for a Steam app's news feed (SPEC.md §J). */
export function formatSteamNewsEmbed(item: SteamNewsItem, appName?: string): AlertEmbedData {
  const description = item.contents ? stripMarkup(item.contents).slice(0, 400) : undefined;

  return {
    title: item.title,
    url: item.url,
    description,
    color: STEAM_BLUE,
    authorName: appName ? `${appName} on Steam` : 'Steam news',
    footer: 'Steam',
  };
}
