import { describe, expect, it, vi } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';
import { createTestContext } from '../../sdk/testing';
import type { CommandContext } from '../../sdk';
import { command as configCommand } from '../commands/config';
import { configSchema, type AiConfig } from '../manifest';
import en from '../locales/en.json';

/** Looks a dotted key up in the real `en.json`, doing `{var}` interpolation — mirrors `mod-assist.test.ts`'s `realT`. */
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
    for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
  }
  return out;
}

const GUILD_ID = 'g1';
const CHANNEL_ID = '222222222222222222';
const NEW_CHANNEL_ID = '333333333333333333';

/** A pre-populated `chat` config (non-default in every field) so a merge bug — patching `chat` without spreading
 * its current value — would show up as a lost field rather than accidentally matching the defaults anyway. */
const seededConfig: AiConfig = configSchema.parse({
  chat: {
    enabled: true,
    channelIds: [CHANNEL_ID],
    persona: 'A cheerful raid-night hype-man.',
    historyMessages: 6,
    maxReplyChars: 1500,
  },
});

interface FakeOptions {
  group?: string | null;
  sub: string;
  action?: string | null;
  channel?: { id: string; name: string } | null;
  count?: number | null;
}

function buildFakeInteraction(opts: FakeOptions) {
  const reply = vi.fn(async (_payload: unknown) => undefined);
  const showModal = vi.fn(async (_payload: unknown) => undefined);
  const interaction = {
    user: { id: 'admin-1' },
    options: {
      getSubcommandGroup: (_required?: boolean) => opts.group ?? null,
      getSubcommand: (_required?: boolean) => opts.sub,
      getString: (name: string) => (name === 'action' ? (opts.action ?? null) : null),
      getChannel: (_name: string, _required?: boolean) => opts.channel ?? null,
      getInteger: (name: string) => (name === 'count' ? (opts.count ?? null) : null),
    },
    reply,
    showModal,
  };
  return { interaction: interaction as unknown as ChatInputCommandInteraction<'cached'>, reply, showModal };
}

function buildCommandContext(
  ctx: ReturnType<typeof createTestContext>['ctx'],
  interaction: ChatInputCommandInteraction<'cached'>,
  config: AiConfig,
): CommandContext {
  return {
    interaction,
    ctx,
    guildId: GUILD_ID,
    staffLevel: 'admin',
    locale: 'en' as CommandContext['locale'],
    t: realT,
    config: async <T = unknown>() => config as T,
  };
}

describe('/ai chat config subcommands', () => {
  it('enable preserves every other chat.* field (shallow-merge-safety regression guard)', async () => {
    const testContext = createTestContext({ config: seededConfig });
    const setConfigSpy = vi.spyOn(testContext.ctx, 'setConfig');
    const { interaction } = buildFakeInteraction({ group: 'chat', sub: 'enable' });
    const c = buildCommandContext(testContext.ctx, interaction, seededConfig);

    await configCommand.execute(c);

    expect(setConfigSpy).toHaveBeenCalledTimes(1);
    const patch = setConfigSpy.mock.calls[0][1] as unknown as Partial<AiConfig>;
    expect(patch.chat).toEqual({ ...seededConfig.chat, enabled: true });
  });

  it('disable preserves every other chat.* field', async () => {
    const testContext = createTestContext({ config: seededConfig });
    const setConfigSpy = vi.spyOn(testContext.ctx, 'setConfig');
    const { interaction } = buildFakeInteraction({ group: 'chat', sub: 'disable' });
    const c = buildCommandContext(testContext.ctx, interaction, seededConfig);

    await configCommand.execute(c);

    const patch = setConfigSpy.mock.calls[0][1] as unknown as Partial<AiConfig>;
    expect(patch.chat).toEqual({ ...seededConfig.chat, enabled: false });
  });

  it('channel add appends to channelIds and preserves persona/history/maxReplyChars', async () => {
    const testContext = createTestContext({ config: seededConfig });
    const setConfigSpy = vi.spyOn(testContext.ctx, 'setConfig');
    const { interaction, reply } = buildFakeInteraction({
      group: 'chat',
      sub: 'channel',
      action: 'add',
      channel: { id: NEW_CHANNEL_ID, name: 'general' },
    });
    const c = buildCommandContext(testContext.ctx, interaction, seededConfig);

    await configCommand.execute(c);

    const patch = setConfigSpy.mock.calls[0][1] as unknown as Partial<AiConfig>;
    expect(patch.chat).toEqual({
      ...seededConfig.chat,
      channelIds: [CHANNEL_ID, NEW_CHANNEL_ID],
    });
    expect(reply).toHaveBeenCalledTimes(1);
  });

  it('channel remove drops only the given channel and preserves everything else', async () => {
    const testContext = createTestContext({ config: seededConfig });
    const setConfigSpy = vi.spyOn(testContext.ctx, 'setConfig');
    const { interaction } = buildFakeInteraction({
      group: 'chat',
      sub: 'channel',
      action: 'remove',
      channel: { id: CHANNEL_ID, name: 'general' },
    });
    const c = buildCommandContext(testContext.ctx, interaction, seededConfig);

    await configCommand.execute(c);

    const patch = setConfigSpy.mock.calls[0][1] as unknown as Partial<AiConfig>;
    expect(patch.chat).toEqual({ ...seededConfig.chat, channelIds: [] });
  });

  it('channel list never calls setConfig', async () => {
    const testContext = createTestContext({ config: seededConfig });
    const setConfigSpy = vi.spyOn(testContext.ctx, 'setConfig');
    const { interaction, reply } = buildFakeInteraction({ group: 'chat', sub: 'channel', action: 'list' });
    const c = buildCommandContext(testContext.ctx, interaction, seededConfig);

    await configCommand.execute(c);

    expect(setConfigSpy).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledTimes(1);
    const payload = reply.mock.calls[0]![0] as { embeds: unknown[] };
    expect(JSON.stringify(payload.embeds)).toContain(CHANNEL_ID);
  });

  it('channel add/remove without a channel option is a validation error', async () => {
    const testContext = createTestContext({ config: seededConfig });
    const { interaction } = buildFakeInteraction({
      group: 'chat',
      sub: 'channel',
      action: 'add',
      channel: null,
    });
    const c = buildCommandContext(testContext.ctx, interaction, seededConfig);

    await expect(configCommand.execute(c)).rejects.toThrow();
  });

  it('persona set opens a modal rather than writing config directly (key never typed into a visible option)', async () => {
    const testContext = createTestContext({ config: seededConfig });
    const setConfigSpy = vi.spyOn(testContext.ctx, 'setConfig');
    const { interaction, showModal } = buildFakeInteraction({ group: 'chat', sub: 'persona', action: 'set' });
    const c = buildCommandContext(testContext.ctx, interaction, seededConfig);

    await configCommand.execute(c);

    expect(showModal).toHaveBeenCalledTimes(1);
    expect(setConfigSpy).not.toHaveBeenCalled();
  });

  it('persona clear resets only persona, preserving channelIds/enabled/history/maxReplyChars', async () => {
    const testContext = createTestContext({ config: seededConfig });
    const setConfigSpy = vi.spyOn(testContext.ctx, 'setConfig');
    const { interaction } = buildFakeInteraction({ group: 'chat', sub: 'persona', action: 'clear' });
    const c = buildCommandContext(testContext.ctx, interaction, seededConfig);

    await configCommand.execute(c);

    const patch = setConfigSpy.mock.calls[0][1] as unknown as Partial<AiConfig>;
    expect(patch.chat).toEqual({ ...seededConfig.chat, persona: null });
  });

  it('persona view shows the current persona without changing config', async () => {
    const testContext = createTestContext({ config: seededConfig });
    const setConfigSpy = vi.spyOn(testContext.ctx, 'setConfig');
    const { interaction, reply } = buildFakeInteraction({ group: 'chat', sub: 'persona', action: 'view' });
    const c = buildCommandContext(testContext.ctx, interaction, seededConfig);

    await configCommand.execute(c);

    expect(setConfigSpy).not.toHaveBeenCalled();
    const payload = reply.mock.calls[0]![0] as { embeds: unknown[] };
    expect(JSON.stringify(payload.embeds)).toContain('A cheerful raid-night hype-man.');
  });

  it('history sets historyMessages and preserves channelIds/persona/enabled/maxReplyChars', async () => {
    const testContext = createTestContext({ config: seededConfig });
    const setConfigSpy = vi.spyOn(testContext.ctx, 'setConfig');
    const { interaction } = buildFakeInteraction({ group: 'chat', sub: 'history', count: 9 });
    const c = buildCommandContext(testContext.ctx, interaction, seededConfig);

    await configCommand.execute(c);

    const patch = setConfigSpy.mock.calls[0][1] as unknown as Partial<AiConfig>;
    expect(patch.chat).toEqual({ ...seededConfig.chat, historyMessages: 9 });
  });
});
