import type { AlertEmbedData } from './types';

const REDDIT_ORANGE = 0xff4500;

export interface RedditPost {
  id: string;
  title: string;
  author: string;
  subreddit: string;
  permalink: string;
  selftext?: string;
  over18?: boolean;
  thumbnail?: string;
  createdUtc?: number;
}

export interface FormatRedditOptions {
  template?: string;
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match);
}

/** Builds the "new post" alert embed for a subreddit's `/new` feed (SPEC.md §J). */
export function formatRedditPostEmbed(post: RedditPost, options: FormatRedditOptions = {}): AlertEmbedData {
  const vars = { subreddit: post.subreddit, author: post.author, title: post.title };
  const description = fillTemplate(options.template ?? 'New post in **r/{subreddit}** by u/{author}', vars);
  const thumb = post.thumbnail && post.thumbnail.startsWith('http') ? post.thumbnail : undefined;

  return {
    title: post.title,
    url: `https://reddit.com${post.permalink}`,
    description,
    color: REDDIT_ORANGE,
    thumbnailUrl: thumb,
    authorName: `r/${post.subreddit}`,
    footer: 'Reddit',
  };
}

/** True if `post` should be suppressed under a "hide NSFW" filter. */
export function isRedditPostNsfw(post: RedditPost): boolean {
  return post.over18 === true;
}
