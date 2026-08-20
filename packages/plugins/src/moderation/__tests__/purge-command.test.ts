import { describe, expect, it, vi } from 'vitest';
import type { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import type { CommandContext } from '../../sdk';
import { createTestContext } from '../../sdk/testing';
import { command as modCommand } from '../commands/mod';
import { configSchema, type ModerationConfig } from '../manifest';
import { CHANNEL_ID, GUILD_ID, createFakeGuild } from './fakes';
import en from '../locales/en.json';

const MODERATOR_ID = '555555555555555555';

/** Looks a dotted key up in the plugin's real `en.json` (same stand-in as community/__tests__/tag-command.test.ts). */
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
  for (const [k, v] of Object.entries(vars ?? {})) {
    out = out.replaceAll(`{${k}}`, String(v));
  }
  return out;
}

interface ReplyPayload {
  embeds?: EmbedBuilder[];
  components?: unknown[];
  ephemeral?: boolean;
}

/**
 * An interaction that enforces discord.js's acknowledgement rules: `followUp`/`editReply` on an interaction
 * that was never replied to or deferred throws `InteractionNotReplied`, exactly as
 * `InteractionResponses#followUp` does. Without that the fast-actions purge bug is invisible to a test.
 */
function fakeInteraction(count: number) {
  const state = { replied: false, deferred: false };
  const replies: ReplyPayload[] = [];
  const followUps: ReplyPayload[] = [];
  const edits: ReplyPayload[] = [];
  const { guild, channel } = createFakeGuild();

  const assertNotAcknowledged = (): void => {
    if (state.replied || state.deferred) throw new Error('InteractionAlreadyReplied');
  };
  const assertAcknowledged = (): void => {
    if (!state.replied && !state.deferred) throw new Error('InteractionNotReplied');
  };

  const interaction = {
    user: { id: MODERATOR_ID },
    guild,
    channel,
    channelId: CHANNEL_ID,
    get replied() {
      return state.replied;
    },
    get deferred() {
      return state.deferred;
    },
    options: {
      getSubcommandGroup: () => null,
      getSubcommand: () => 'purge',
      getInteger: (name: string) => (name === 'count' ? count : null),
      getUser: () => null,
      getString: () => null,
      getChannel: () => null,
    },
    reply: vi.fn(async (payload: ReplyPayload) => {
      assertNotAcknowledged();
      state.replied = true;
      replies.push(payload);
    }),
    deferReply: vi.fn(async () => {
      assertNotAcknowledged();
      state.deferred = true;
    }),
    editReply: vi.fn(async (payload: ReplyPayload) => {
      assertAcknowledged();
      edits.push(payload);
    }),
    followUp: vi.fn(async (payload: ReplyPayload) => {
      assertAcknowledged();
      followUps.push(payload);
    }),
  };

  return { interaction, replies, followUps, edits };
}

function buildContext(opts: { fastActions: boolean; count?: number }) {
  const { interaction, replies, followUps, edits } = fakeInteraction(opts.count ?? 5);
  const cfg: ModerationConfig = configSchema.parse({});
  const { ctx, services } = createTestContext({ config: cfg });

  const purge = vi.fn(async () => ({ case: {}, deletedCount: 5 }));
  services.register('moderation', { purge } as never);
  services.register('host', {
    getGuildConfig: async () => ({ fastActions: opts.fastActions }),
  } as never);

  const c: CommandContext = {
    interaction: interaction as unknown as ChatInputCommandInteraction<'cached'>,
    ctx,
    guildId: GUILD_ID,
    staffLevel: 'moderator',
    locale: 'en-US' as never,
    t: realT,
    config: async <T>() => cfg as T,
  };

  return { c, purge, replies, followUps, edits, interaction };
}

function describedText(payloads: ReplyPayload[]): string {
  return payloads[0]?.embeds?.[0]?.data.description ?? '';
}

describe('/mod purge acknowledgement', () => {
  it('acknowledges the interaction itself when fast actions skip the confirmation prompt', async () => {
    const { c, purge, edits, interaction } = buildContext({ fastActions: true });

    await modCommand.execute(c);

    expect(purge).toHaveBeenCalledTimes(1);
    expect(interaction.deferReply).toHaveBeenCalledTimes(1);
    expect(edits).toHaveLength(1);
    expect(describedText(edits)).toContain('Deleted 5 message(s).');
  });

  it('sends a confirmation prompt (and purges nothing yet) when fast actions are off', async () => {
    const { c, purge, replies, edits } = buildContext({ fastActions: false });

    await modCommand.execute(c);

    expect(purge).not.toHaveBeenCalled();
    expect(replies).toHaveLength(1);
    expect(replies[0].components).toHaveLength(1);
    expect(edits).toHaveLength(0);
  });
});
