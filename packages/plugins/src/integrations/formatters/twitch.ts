import type { AlertEmbedData } from './types';

const TWITCH_PURPLE = 0x9146ff;

export interface TwitchStream {
  id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  game_name?: string;
  title?: string;
  thumbnail_url?: string;
  started_at?: string;
}

export interface FormatTwitchOptions {
  /** Discord role mention text (e.g. `<@&123>`), prepended to the alert content outside the embed. */
  roleMention?: string;
  /** `{streamer}`, `{title}`, `{game}` template placeholders; defaults to a sensible sentence. */
  template?: string;
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match);
}

/** Builds the "went live" alert embed for a Twitch stream (ARCHITECTURE.md's integrations connector spec). */
export function formatTwitchStreamEmbed(
  stream: TwitchStream,
  options: FormatTwitchOptions = {},
): AlertEmbedData {
  const vars = {
    streamer: stream.user_name || stream.user_login,
    title: stream.title ?? '',
    game: stream.game_name ?? 'a game',
  };
  const description = fillTemplate(options.template ?? '**{streamer}** just went live playing {game}!', vars);
  const thumb = stream.thumbnail_url
    ? stream.thumbnail_url.replace('{width}', '640').replace('{height}', '360')
    : undefined;

  return {
    title: stream.title || `${vars.streamer} is live on Twitch`,
    url: `https://twitch.tv/${stream.user_login}`,
    description,
    color: TWITCH_PURPLE,
    imageUrl: thumb,
    authorName: `${vars.streamer} on Twitch`,
    fields: stream.game_name ? [{ name: 'Playing', value: stream.game_name, inline: true }] : [],
    footer: 'Twitch',
  };
}
