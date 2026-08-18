import { describe, expect, it, vi } from 'vitest';
import type { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { createTestContext, type TestContextOverrides } from '../../sdk/testing';
import type { CommandContext } from '../../sdk';
import { command as tagCommand } from '../commands/tag';
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

const tagRow = {
  id: 'tag1',
  guildId: GUILD_ID,
  name: 'rules',
  content: 'Read the rules',
  embed: null,
  triggerMode: 'NONE',
  trigger: null as string | null,
  triggerChannelIds: [] as string[],
  staffOnly: false,
  uses: 0,
  createdBy: 'staff1',
  updatedBy: null as string | null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

interface TriggerOptions {
  mode: string;
  phrase?: string | null;
  channelId?: string | null;
}

function buildTriggerContext(tag: typeof tagRow, opts: TriggerOptions, overrides: TestContextOverrides = {}) {
  const replies: { embeds?: EmbedBuilder[]; ephemeral?: boolean }[] = [];
  const updates: unknown[] = [];

  const interaction = {
    user: { id: 'admin-1' },
    guild: { id: GUILD_ID },
    options: {
      getSubcommand: () => 'trigger',
      getString: (name: string, _required?: boolean) => {
        if (name === 'name') return tag.name;
        if (name === 'mode') return opts.mode;
        if (name === 'phrase') return opts.phrase ?? null;
        return null;
      },
      getChannel: (name: string) =>
        name === 'channel' && opts.channelId ? { id: opts.channelId } : null,
    },
    reply: vi.fn(async (payload: { embeds?: EmbedBuilder[]; ephemeral?: boolean }) => {
      replies.push(payload);
    }),
  };

  const cfg = configSchema.parse({ tags: { enabled: true, triggersEnabled: true } });
  const { ctx } = createTestContext({
    config: cfg,
    ...overrides,
    prismaOverrides: {
      tag: {
        findUnique: async () => tag,
        update: async (args: unknown) => {
          updates.push(args);
          return { ...tag };
        },
      },
      ...overrides.prismaOverrides,
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

  return { c, replies, updates };
}

function firstReplyText(replies: { embeds?: EmbedBuilder[] }[]): string {
  return replies[0]?.embeds?.[0]?.data.description ?? '';
}

describe('/tag trigger — staff-only guard', () => {
  it('refuses to set a trigger on a staff-only tag, with a localized error, and never writes', async () => {
    const staffOnlyTag = { ...tagRow, staffOnly: true };
    const { c, replies, updates } = buildTriggerContext(staffOnlyTag, {
      mode: 'CONTAINS',
      phrase: 'how do i verify',
    });

    await tagCommand.execute(c);

    expect(updates).toHaveLength(0);
    expect(replies).toHaveLength(1);
    expect(replies[0]?.ephemeral).toBe(true);
    expect(firstReplyText(replies)).toContain(realT('tag.staffOnlyNoTrigger', { name: 'rules' }));
  });

  it('still allows clearing a trigger (mode: NONE) on a staff-only tag', async () => {
    const staffOnlyTag = { ...tagRow, staffOnly: true, triggerMode: 'CONTAINS', trigger: 'old' };
    const { c, replies, updates } = buildTriggerContext(staffOnlyTag, { mode: 'NONE' });

    await tagCommand.execute(c);

    expect(updates).toHaveLength(1);
    expect(firstReplyText(replies)).toContain(realT('tag.triggerCleared', { name: 'rules' }));
  });

  it('sets a trigger normally on a tag that is not staff-only', async () => {
    const { c, replies, updates } = buildTriggerContext(tagRow, {
      mode: 'CONTAINS',
      phrase: 'how do i verify',
    });

    await tagCommand.execute(c);

    expect(updates).toHaveLength(1);
    expect((updates[0] as { data: { triggerMode: string } }).data.triggerMode).toBe('CONTAINS');
    expect(replies[0]?.ephemeral).toBe(true);
  });
});
