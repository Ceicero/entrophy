import { describe, expect, it, vi } from 'vitest';
import type { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { createTestContext } from '../../sdk/testing';
import type { CommandContext } from '../../sdk';
import { command as levelCommand } from '../commands/level';
import { configSchema } from '../manifest';
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
const ROLE_ID = '111111111111111111';

interface SyncCall {
  kind: 'defer' | 'reply' | 'editReply';
  payload?: { embeds?: EmbedBuilder[]; ephemeral?: boolean };
}

function buildSyncContext(rankedMemberCount: number) {
  const calls: SyncCall[] = [];
  const roleAdds: string[][] = [];

  const profiles = Array.from({ length: rankedMemberCount }, (_, i) => ({
    id: `p${i}`,
    guildId: GUILD_ID,
    userId: `user-${i}`,
    level: 5,
    xp: 10_000 - i,
  }));

  const findManyArgs: unknown[] = [];

  const guild = {
    id: GUILD_ID,
    members: {
      fetch: vi.fn(async (userId: string) => ({
        id: userId,
        roles: {
          cache: new Map<string, unknown>(),
          add: vi.fn(async (ids: string[]) => {
            roleAdds.push(ids);
          }),
          remove: vi.fn(async () => undefined),
        },
      })),
    },
  };

  const interaction = {
    user: { id: 'admin-1' },
    guild,
    options: {
      getSubcommand: () => 'sync',
      getSubcommandGroup: () => 'rewards',
      getString: () => null,
      getChannel: () => null,
      getUser: () => null,
      getInteger: () => null,
      getRole: () => null,
    },
    deferReply: vi.fn(async (payload: { ephemeral?: boolean }) => {
      calls.push({ kind: 'defer', payload });
    }),
    reply: vi.fn(async (payload: { embeds?: EmbedBuilder[]; ephemeral?: boolean }) => {
      calls.push({ kind: 'reply', payload });
    }),
    editReply: vi.fn(async (payload: { embeds?: EmbedBuilder[] }) => {
      calls.push({ kind: 'editReply', payload });
    }),
  };

  const cfg = configSchema.parse({});
  const { ctx } = createTestContext({
    config: cfg,
    prismaOverrides: {
      levelReward: {
        findMany: async () => [{ id: 'r1', guildId: GUILD_ID, level: 1, roleId: ROLE_ID }],
      },
      levelProfile: {
        findMany: async (args: unknown) => {
          findManyArgs.push(args);
          const take = (args as { take?: number }).take;
          return typeof take === 'number' ? profiles.slice(0, take) : profiles;
        },
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

  return { c, calls, findManyArgs, roleAdds };
}

function embedText(payload: SyncCall['payload']): string {
  return payload?.embeds?.[0]?.data.description ?? '';
}

describe('/level rewards sync', () => {
  // The loop costs a member fetch plus up to two role writes per ranked member, so the reply is nowhere
  // near Discord's 3-second ack deadline on a real server.
  it('defers before doing any work and answers with editReply', async () => {
    const { c, calls } = buildSyncContext(3);
    await levelCommand.execute(c);

    expect(calls[0]).toEqual({ kind: 'defer', payload: { ephemeral: true } });
    expect(calls.some((call) => call.kind === 'reply')).toBe(false);
    expect(calls.at(-1)?.kind).toBe('editReply');
    expect(embedText(calls.at(-1)?.payload)).toContain(realT('level.rewards.syncDone', { count: 3 }));
  });

  it('bounds the profile query so one command cannot fan out unlimited role writes', async () => {
    const { c, findManyArgs, roleAdds, calls } = buildSyncContext(5000);
    await levelCommand.execute(c);

    const take = (findManyArgs[0] as { take?: number }).take;
    expect(typeof take).toBe('number');
    expect(take).toBeLessThanOrEqual(1001);
    // One row over the cap is fetched to detect truncation, but only the cap itself is processed.
    const limit = (take as number) - 1;
    expect(roleAdds.length).toBe(limit);
    // …and the admin is told the pass was capped rather than silently seeing a partial sync.
    expect(embedText(calls.at(-1)?.payload)).toContain(
      realT('level.rewards.syncCapped', { count: limit, limit }),
    );
  });
});
