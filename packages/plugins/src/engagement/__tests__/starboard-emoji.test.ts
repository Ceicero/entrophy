import { describe, expect, it, vi } from 'vitest';
import { ReactionType } from 'discord.js';
import type {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageReaction,
  MessageReactionEventDetails,
  User,
} from 'discord.js';
import { createTestContext } from '../../sdk/testing';
import type { CommandContext } from '../../sdk';
import { command as starboardCommand } from '../commands/starboard';
import { messageReactionAddHandler } from '../events/reactions';
import { configSchema } from '../manifest';
import { CUSTOM_EMOJI_PATTERN, resolveStarboardEmoji } from '../service';
import en from '../locales/en.json';

/** Looks a dotted key up in the plugin's real `en.json` with `{var}` interpolation (same stand-in as
 * __tests__/level-announce.test.ts). */
function realT(key: string, vars?: Record<string, string | number>): string {
  const parts = key.split('.');
  let node: unknown = en;
  for (const part of parts) {
    if (node && typeof node === 'object' && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return key;
    }
  }
  if (typeof node !== 'string') return key;
  let out = node;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.replaceAll(`{${k}}`, String(v));
    }
  }
  return out;
}

const GUILD_ID = 'guild-1';
const GUILD_EMOJI = { id: '999999999999999999', name: 'skel_sparkle', animated: false };

describe('resolveStarboardEmoji', () => {
  const findByName = (name: string) => (name === GUILD_EMOJI.name ? GUILD_EMOJI : null);

  it('accepts unicode emoji, including modifiers, ZWJ sequences, flags and keycaps', () => {
    const cases = [
      '\u{2B50}', // star
      '\u{2764}\u{FE0F}', // heart + VS16
      '\u{1F44D}\u{1F3FD}', // thumbs up + skin tone
      '\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}', // ZWJ family
      '\u{1F1FA}\u{1F1F8}', // regional-indicator flag
      '1\u{FE0F}\u{20E3}', // keycap
    ];
    for (const emoji of cases) {
      expect(resolveStarboardEmoji(emoji)).toEqual({ ok: true, emoji });
    }
  });

  it('accepts a custom-emoji mention in either static or animated form', () => {
    expect(resolveStarboardEmoji('<:skel_sparkle:123456789012345678>')).toEqual({
      ok: true,
      emoji: '<:skel_sparkle:123456789012345678>',
    });
    expect(resolveStarboardEmoji('<a:skel_dance:123456789012345678>').ok).toBe(true);
  });

  // Discord hands slash-command string options over verbatim, so a shortcode has to be resolved against the
  // guild's own emoji or it is stored as a string no reaction can ever equal.
  it('resolves a bare :shortcode: against the guild emoji and stores the wire form', () => {
    expect(resolveStarboardEmoji(':skel_sparkle:', findByName)).toEqual({
      ok: true,
      emoji: `<:${GUILD_EMOJI.name}:${GUILD_EMOJI.id}>`,
    });
  });

  it('rejects a shortcode this guild does not have, naming it', () => {
    expect(resolveStarboardEmoji(':skel_skull:', findByName)).toEqual({
      ok: false,
      reason: 'unknown_custom',
      name: 'skel_skull',
    });
  });

  it('rejects plain words, empty input, malformed mentions and multi-emoji strings', () => {
    expect(resolveStarboardEmoji('star', findByName)).toEqual({ ok: false, reason: 'invalid' });
    expect(resolveStarboardEmoji('   ', findByName)).toEqual({ ok: false, reason: 'empty' });
    expect(resolveStarboardEmoji('<:skel_sparkle:>', findByName)).toEqual({ ok: false, reason: 'invalid' });
    expect(resolveStarboardEmoji('\u{2B50}\u{2B50}', findByName)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('produces a value the reaction matcher can extract an emoji id from', () => {
    const resolved = resolveStarboardEmoji(':skel_sparkle:', findByName);
    expect(resolved.ok).toBe(true);
    expect(CUSTOM_EMOJI_PATTERN.exec(resolved.ok ? resolved.emoji : '')?.[2]).toBe(GUILD_EMOJI.id);
  });
});

function buildEmojiContext(typed: string) {
  const replies: { embeds?: EmbedBuilder[]; ephemeral?: boolean }[] = [];
  const setConfigCalls: unknown[] = [];

  const interaction = {
    user: { id: 'admin-1' },
    guild: {
      id: GUILD_ID,
      emojis: { cache: [GUILD_EMOJI] },
    },
    options: {
      getSubcommandGroup: () => 'set',
      getSubcommand: () => 'emoji',
      getString: (name: string) => (name === 'emoji' ? typed : null),
      getChannel: () => null,
      getInteger: () => null,
      getBoolean: () => null,
    },
    reply: vi.fn(async (payload: { embeds?: EmbedBuilder[]; ephemeral?: boolean }) => {
      replies.push(payload);
    }),
  };

  const cfg = configSchema.parse({});
  const { ctx } = createTestContext({
    config: cfg,
    overrides: {
      setConfig: async <T>(_guildId: string, patch: Partial<T>) => {
        setConfigCalls.push(patch);
        return { ...cfg, ...patch } as T;
      },
    },
  });

  const c: CommandContext = {
    interaction: interaction as unknown as ChatInputCommandInteraction<'cached'>,
    ctx,
    guildId: GUILD_ID,
    staffLevel: 'admin',
    locale: 'en-US' as never,
    t: realT,
    config: async <T>() => cfg as T,
  };

  return { c, replies, setConfigCalls };
}

function replyText(replies: { embeds?: EmbedBuilder[] }[]): string {
  return replies[0]?.embeds?.[0]?.data.description ?? '';
}

describe('/starboard set emoji', () => {
  it('stores a unicode emoji as typed', async () => {
    const { c, setConfigCalls } = buildEmojiContext('\u{2B50}');
    await starboardCommand.execute(c);

    expect(setConfigCalls).toEqual([{ starboard: expect.objectContaining({ emoji: '\u{2B50}' }) }]);
  });

  it('stores the wire form for a shortcode that names one of this guild’s emoji', async () => {
    const { c, setConfigCalls } = buildEmojiContext(':skel_sparkle:');
    await starboardCommand.execute(c);

    expect(setConfigCalls).toEqual([
      { starboard: expect.objectContaining({ emoji: `<:${GUILD_EMOJI.name}:${GUILD_EMOJI.id}>` }) },
    ]);
  });

  it('refuses a plain word instead of silently killing the starboard', async () => {
    const { c, replies, setConfigCalls } = buildEmojiContext('star');
    await starboardCommand.execute(c);

    expect(setConfigCalls).toHaveLength(0);
    expect(replies[0]?.ephemeral).toBe(true);
    expect(replyText(replies)).toContain(realT('starboard.set.emojiInvalid'));
  });

  it('refuses a shortcode this guild has no emoji for, naming it', async () => {
    const { c, replies, setConfigCalls } = buildEmojiContext(':skel_skull:');
    await starboardCommand.execute(c);

    expect(setConfigCalls).toHaveLength(0);
    expect(replyText(replies)).toContain(realT('starboard.set.emojiUnknown', { name: 'skel_skull' }));
  });
});

// `resolveStarboardEmoji` only stores the wire form; `emojiMatches` in events/reactions.ts is what has to
// read the *id* capture group back out of it. Asserting the regex against itself would pass even if that
// consumer read the wrong group, so drive the real reaction handler instead: reaching the starboard-entry
// lookup is the observable proof the emoji matched.
describe('custom-emoji reactions reach the starboard', () => {
  const CONFIGURED = `<:${GUILD_EMOJI.name}:${GUILD_EMOJI.id}>`;

  function buildReaction(emoji: { id: string | null; name: string | null }): MessageReaction {
    return {
      partial: false,
      emoji,
      users: { fetch: async () => new Map([['reactor-1', { id: 'reactor-1', bot: false }]]) },
      message: {
        partial: false,
        id: 'message-1',
        guildId: GUILD_ID,
        guild: { id: GUILD_ID },
        channelId: 'channel-1',
        channel: {},
        author: { id: 'author-1', bot: false },
      },
    } as unknown as MessageReaction;
  }

  async function reactWith(emoji: { id: string | null; name: string | null }): Promise<string[]> {
    const cfg = configSchema.parse({ starboard: { channelId: 'starboard-1', emoji: CONFIGURED } });
    const { ctx, prismaCalls } = createTestContext({ config: cfg });
    await messageReactionAddHandler.handler(
      ctx,
      buildReaction(emoji),
      { id: 'reactor-1', bot: false } as unknown as User,
      { type: ReactionType.Normal, burst: false } as unknown as MessageReactionEventDetails,
    );
    return prismaCalls.map((call) => `${call.model}.${call.method}`);
  }

  it('matches the configured custom emoji by id', async () => {
    expect(await reactWith({ id: GUILD_EMOJI.id, name: GUILD_EMOJI.name })).toContain(
      'starboardEntry.findUnique',
    );
  });

  // A different server's emoji can share the name, so a name match must never stand in for an id match.
  it('ignores a different custom emoji that happens to share the name', async () => {
    expect(await reactWith({ id: '111111111111111111', name: GUILD_EMOJI.name })).toHaveLength(0);
  });

  it('ignores an unrelated unicode reaction', async () => {
    expect(await reactWith({ id: null, name: '\u{1F480}' })).toHaveLength(0);
  });
});
