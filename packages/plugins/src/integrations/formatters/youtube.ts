import type { AlertEmbedData } from './types';

const YOUTUBE_RED = 0xff0000;

export interface YoutubeVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  publishedAt: string;
  description?: string;
  thumbnailUrl?: string;
}

export interface FormatYoutubeOptions {
  template?: string;
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match);
}

/** Builds the "new upload" alert embed for a YouTube video (SPEC.md §J). */
export function formatYoutubeUploadEmbed(video: YoutubeVideo, options: FormatYoutubeOptions = {}): AlertEmbedData {
  const vars = { channel: video.channelTitle, title: video.title };
  const description = fillTemplate(options.template ?? '**{channel}** just uploaded a new video!', vars);

  return {
    title: video.title,
    url: `https://www.youtube.com/watch?v=${video.videoId}`,
    description,
    color: YOUTUBE_RED,
    imageUrl: video.thumbnailUrl,
    authorName: `${video.channelTitle} on YouTube`,
    footer: 'YouTube',
  };
}
