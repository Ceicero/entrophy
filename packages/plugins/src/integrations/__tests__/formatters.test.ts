import { describe, expect, it } from 'vitest';
import { formatTwitchStreamEmbed } from '../formatters/twitch';
import { formatYoutubeUploadEmbed } from '../formatters/youtube';
import { formatGithubEventEmbed } from '../formatters/github';
import { formatRedditPostEmbed, isRedditPostNsfw } from '../formatters/reddit';
import { formatSteamNewsEmbed } from '../formatters/steam';

describe('formatTwitchStreamEmbed', () => {
  it('builds a live alert with the default template', () => {
    const embed = formatTwitchStreamEmbed({
      id: '1',
      user_id: '10',
      user_login: 'shroud',
      user_name: 'shroud',
      game_name: 'Valorant',
      title: 'ranked grind',
    });
    expect(embed.title).toBe('ranked grind');
    expect(embed.url).toBe('https://twitch.tv/shroud');
    expect(embed.description).toContain('shroud');
    expect(embed.description).toContain('Valorant');
    expect(embed.fields?.[0]).toMatchObject({ name: 'Playing', value: 'Valorant' });
  });

  it('fills a custom template', () => {
    const embed = formatTwitchStreamEmbed(
      { id: '1', user_id: '10', user_login: 'x', user_name: 'X', title: 't' },
      { template: '{streamer} is live: {title}' },
    );
    expect(embed.description).toBe('X is live: t');
  });
});

describe('formatYoutubeUploadEmbed', () => {
  it('builds an upload alert', () => {
    const embed = formatYoutubeUploadEmbed({
      videoId: 'abc123',
      title: 'New video',
      channelTitle: 'MyChannel',
      publishedAt: '2026-01-01T00:00:00Z',
    });
    expect(embed.url).toBe('https://www.youtube.com/watch?v=abc123');
    expect(embed.title).toBe('New video');
    expect(embed.description).toContain('MyChannel');
  });
});

describe('formatGithubEventEmbed', () => {
  it('formats a push event with commits', () => {
    const embed = formatGithubEventEmbed('push', {
      ref: 'refs/heads/main',
      repository: { full_name: 'acme/repo', html_url: 'https://github.com/acme/repo' },
      compare: 'https://github.com/acme/repo/compare/a...b',
      commits: [{ id: 'abcdef1234567', message: 'fix bug\nmore detail', url: '#', author: { name: 'dev' } }],
    });
    expect(embed).not.toBeNull();
    expect(embed?.title).toContain('main');
    expect(embed?.description).toContain('fix bug');
  });

  it('returns null for a push event with no commits', () => {
    expect(formatGithubEventEmbed('push', { ref: 'refs/heads/main', commits: [] })).toBeNull();
  });

  it('formats a merged pull_request', () => {
    const embed = formatGithubEventEmbed('pull_request', {
      action: 'closed',
      repository: { full_name: 'acme/repo' },
      pull_request: { number: 42, title: 'Add feature', html_url: '#', user: { login: 'dev' }, merged: true },
    });
    expect(embed?.title).toContain('merged');
    expect(embed?.title).toContain('#42');
  });

  it('returns null for an unsupported event type', () => {
    expect(formatGithubEventEmbed('deployment', {})).toBeNull();
  });

  it('returns null for a non-published release action', () => {
    expect(formatGithubEventEmbed('release', { action: 'edited', release: { tag_name: 'v1' } })).toBeNull();
  });
});

describe('formatRedditPostEmbed / isRedditPostNsfw', () => {
  const post = {
    id: 't3_1',
    title: 'Cool build',
    author: 'someone',
    subreddit: 'gaming',
    permalink: '/r/gaming/comments/1',
    over18: false,
  };

  it('builds a post alert', () => {
    const embed = formatRedditPostEmbed(post);
    expect(embed.url).toBe('https://reddit.com/r/gaming/comments/1');
    expect(embed.description).toContain('r/gaming');
    expect(embed.description).toContain('someone');
  });

  it('flags NSFW posts', () => {
    expect(isRedditPostNsfw(post)).toBe(false);
    expect(isRedditPostNsfw({ ...post, over18: true })).toBe(true);
  });
});

describe('formatSteamNewsEmbed', () => {
  it('strips markup from the news contents', () => {
    const embed = formatSteamNewsEmbed({
      gid: '1',
      title: 'Patch notes',
      url: 'https://store.steampowered.com/news/1',
      appid: 730,
      contents: '<b>Fixed</b> [b]a bug[/b] in the game.',
    });
    expect(embed.title).toBe('Patch notes');
    expect(embed.description).not.toContain('<b>');
    expect(embed.description).not.toContain('[b]');
    expect(embed.description).toContain('Fixed');
  });
});
