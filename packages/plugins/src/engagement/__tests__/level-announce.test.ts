import { describe, expect, it, vi } from 'vitest';
import { ChannelType } from 'discord.js';
import type { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { createTestContext } from '../../sdk/testing';
import type { CommandContext } from '../../sdk';
import { command as levelCommand } from '../commands/level';
import { configSchema } from '../manifest';
import en from '../locales/en.json';

/** Looks a dotted key up in the plugin's real `en.json` with `{var}` interpolation (same stand-in used by
 * community/__tests__/statschannel-command.test.ts and ai/__tests__/mod-assist.test.ts). */
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

interface FakeChannelSpec {
  id: string;
  /** Whether the bot has View Channel + Send Messages there (`resolveTextChannel`'s gate). */
  botCanSend: boolean;
  type?: ChannelType;
}

function buildFakeGuild(channels: FakeChannelSpec[]) {
  const botMember = { id: 'bot-1' };
  const byId = new Map(channels.map((c) => [c.id, c]));
  return {
    id: GUILD_ID,
    members: { me: botMember },
    channels: {
      fetch: vi.fn(async (id: string) => {
        const spec = byId.get(id);
        if (!spec) return null;
        return {
          id: spec.id,
          type: spec.type ?? ChannelType.GuildText,
          isTextBased: () => true,
          permissionsFor: () => ({ has: () => spec.botCanSend }),
        };
      }),
    },
  };
}

interface AnnounceOptions {
  mode: string;
  channelId?: string | null;
}

function buildAnnounceContext(
  opts: AnnounceOptions,
  channels: FakeChannelSpec[] = [],
  staffLevel: CommandContext['staffLevel'] = 'admin',
) {
  const replies: { embeds?: EmbedBuilder[]; ephemeral?: boolean }[] = [];
  const setConfigCalls: unknown[] = [];

  const guild = buildFakeGuild(channels);

  const interaction = {
    user: { id: 'admin-1' },
    guild,
    options: {
      getSubcommand: () => 'announce',
      getSubcommandGroup: () => null,
      getString: (name: string) => (name === 'mode' ? opts.mode : null),
      getChannel: (name: string) => (name === 'channel' && opts.channelId ? { id: opts.channelId } : null),
      getUser: () => null,
      getInteger: () => null,
      getRole: () => null,
    },
    reply: vi.fn(async (payload: { embeds?: EmbedBuilder[]; ephemeral?: boolean }) => {
      replies.push(payload);
    }),
  };

  const cfg = configSchema.parse({ leveling: { levelUpChannel: 'none' } });
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
    staffLevel,
    locale: 'en-US' as never,
    t: realT,
    config: async <T>() => cfg as T,
  };

  return { c, replies, setConfigCalls };
}

function firstReplyText(replies: { embeds?: EmbedBuilder[] }[]): string {
  return replies[0]?.embeds?.[0]?.data.description ?? '';
}

describe('/level announce', () => {
  it('mode: same-channel persists levelUpChannel = "current"', async () => {
    const { c, replies, setConfigCalls } = buildAnnounceContext({ mode: 'same-channel' });
    await levelCommand.execute(c);

    expect(setConfigCalls).toEqual([{ leveling: expect.objectContaining({ levelUpChannel: 'current' }) }]);
    expect(replies[0]?.ephemeral).toBe(true);
    expect(firstReplyText(replies)).toContain(realT('level.announce.targetCurrent'));
  });

  it('mode: dm persists levelUpChannel = "dm"', async () => {
    const { c, replies, setConfigCalls } = buildAnnounceContext({ mode: 'dm' });
    await levelCommand.execute(c);

    expect(setConfigCalls).toEqual([{ leveling: expect.objectContaining({ levelUpChannel: 'dm' }) }]);
    expect(firstReplyText(replies)).toContain(realT('level.announce.targetDm'));
  });

  it('mode: off persists levelUpChannel = "none"', async () => {
    const { c, replies, setConfigCalls } = buildAnnounceContext({ mode: 'off' });
    await levelCommand.execute(c);

    expect(setConfigCalls).toEqual([{ leveling: expect.objectContaining({ levelUpChannel: 'none' }) }]);
    expect(firstReplyText(replies)).toContain(realT('level.announce.targetOff'));
  });

  it('mode: channel with a channel the bot can send in persists that channel id', async () => {
    const channelId = '111111111111111111'; // real Discord channel ids are always snowflakes
    const { c, replies, setConfigCalls } = buildAnnounceContext({ mode: 'channel', channelId }, [
      { id: channelId, botCanSend: true },
    ]);
    await levelCommand.execute(c);

    expect(setConfigCalls).toEqual([{ leveling: expect.objectContaining({ levelUpChannel: channelId }) }]);
    expect(firstReplyText(replies)).toContain(`<#${channelId}>`);
  });

  it('mode: channel without a channel option replies with an error and persists nothing', async () => {
    const { c, replies, setConfigCalls } = buildAnnounceContext({ mode: 'channel' });
    await levelCommand.execute(c);

    expect(setConfigCalls).toHaveLength(0);
    expect(replies[0]?.ephemeral).toBe(true);
    expect(firstReplyText(replies)).toContain(realT('level.announce.channelRequired'));
  });

  it('mode: channel where the bot lacks View Channel/Send Messages replies with an error and persists nothing', async () => {
    const channelId = '222222222222222222';
    const { c, replies, setConfigCalls } = buildAnnounceContext({ mode: 'channel', channelId }, [
      { id: channelId, botCanSend: false },
    ]);
    await levelCommand.execute(c);

    expect(setConfigCalls).toHaveLength(0);
    expect(replies[0]?.ephemeral).toBe(true);
    expect(firstReplyText(replies)).toContain(realT('level.announce.channelNotUsable'));
  });

  it('is admin-only', async () => {
    const { c, setConfigCalls } = buildAnnounceContext({ mode: 'off' }, [], 'moderator');
    await expect(levelCommand.execute(c)).rejects.toThrow();
    expect(setConfigCalls).toHaveLength(0);
  });
});

describe('/level config — level-up announcement display', () => {
  function buildConfigContext(levelUpChannel: string) {
    const replies: { embeds?: EmbedBuilder[]; ephemeral?: boolean }[] = [];
    const guild = buildFakeGuild([]);
    const interaction = {
      user: { id: 'mod-1' },
      guild,
      options: {
        getSubcommand: () => 'config',
        getSubcommandGroup: () => null,
        getString: () => null,
        getChannel: () => null,
        getUser: () => null,
        getInteger: () => null,
        getRole: () => null,
      },
      reply: vi.fn(async (payload: { embeds?: EmbedBuilder[]; ephemeral?: boolean }) => {
        replies.push(payload);
      }),
    };
    const cfg = configSchema.parse({ leveling: { levelUpChannel } });
    const { ctx } = createTestContext({ config: cfg });
    const c: CommandContext = {
      interaction: interaction as unknown as ChatInputCommandInteraction<'cached'>,
      ctx,
      guildId: GUILD_ID,
      staffLevel: 'moderator',
      locale: 'en-US' as never,
      t: realT,
      config: async <T>() => cfg as T,
    };
    return { c, replies };
  }

  it('renders a channel-snowflake levelUpChannel as <#id>', async () => {
    const { c, replies } = buildConfigContext('123456789012345678');
    await levelCommand.execute(c);
    expect(firstReplyText(replies)).toContain('<#123456789012345678>');
  });

  it('renders the "current" mode as a human-readable phrase, not the raw word', async () => {
    const { c, replies } = buildConfigContext('current');
    await levelCommand.execute(c);
    expect(firstReplyText(replies)).toContain(realT('level.announce.targetCurrent'));
  });
});
