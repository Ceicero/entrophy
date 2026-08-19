import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientEvents } from 'discord.js';
import RedisMock from 'ioredis-mock';
import { createTestContext } from '../../sdk/testing';
import type { AiCompleteInput, AiCompleteResult, AiService } from '../../sdk';
import { mentionChatHandler } from '../events/mention-chat';
import { configSchema } from '../manifest';
import { BASE_SAFETY_PROMPT } from '../prompt';
import en from '../locales/en.json';

type IncomingMessage = ClientEvents['messageCreate'][0];

const GUILD_ID = '111111111111111111';
const CHANNEL_ID = '222222222222222222';
const OTHER_CHANNEL_ID = '333333333333333333';
const BOT_ID = '999999999999999999';
const USER_ID = '444444444444444444';

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

const enabledChatConfig = configSchema.parse({
  chat: { enabled: true, channelIds: [CHANNEL_ID], historyMessages: 0 },
});

function mentionContent(text: string, opts: { literalMention?: boolean } = {}): string {
  const { literalMention = true } = opts;
  return literalMention ? `<@${BOT_ID}> ${text}` : text;
}

function fakeMessage(
  content: string,
  overrides: Partial<Record<string, unknown>> = {},
): { message: IncomingMessage; reply: ReturnType<typeof vi.fn>; sendTyping: ReturnType<typeof vi.fn> } {
  const reply = vi.fn(async (_payload: unknown) => undefined);
  const sendTyping = vi.fn(async () => undefined);
  const channel = { messages: { fetch: vi.fn(async () => new Map()) }, sendTyping };

  const message = {
    id: 'msg-1',
    inGuild: () => true,
    guildId: GUILD_ID,
    channelId: CHANNEL_ID,
    content,
    author: { id: USER_ID, bot: false, username: 'alice', tag: 'alice#0' },
    webhookId: null,
    system: false,
    mentions: { users: new Map<string, unknown>() },
    channel,
    reply,
    ...overrides,
  };
  return { message: message as unknown as IncomingMessage, reply, sendTyping };
}

/** A message that explicitly @mentions the bot, both via `mentions.users` and the raw content. */
function mentioningMessage(text: string, overrides: Partial<Record<string, unknown>> = {}) {
  return fakeMessage(mentionContent(text), {
    mentions: { users: new Map([[BOT_ID, { id: BOT_ID }]]) },
    ...overrides,
  });
}

function buildFakeAiService(
  response: Partial<AiCompleteResult> = {},
  impl?: () => Promise<AiCompleteResult>,
): {
  service: AiService;
  calls: AiCompleteInput[];
} {
  const calls: AiCompleteInput[] = [];
  const service: AiService = {
    complete: vi.fn(async (input: AiCompleteInput) => {
      calls.push(input);
      if (impl) return impl();
      return {
        text: 'Hey there! Happy to help.',
        promptTokens: 20,
        completionTokens: 10,
        model: 'test-model',
        provider: 'openai',
        ...response,
      };
    }),
    test: vi.fn(async () => ({ ok: true })),
  };
  return { service, calls };
}

function buildCtx(config = enabledChatConfig) {
  const testContext = createTestContext({
    config,
    intentsEnabled: { messageContent: true },
    overrides: {
      t: realT,
      client: { user: { id: BOT_ID } } as never,
    },
  });
  return testContext;
}

describe('mention chat (messageCreate)', () => {
  beforeEach(async () => {
    await new RedisMock().flushall();
  });

  it('ignores messages without an explicit @mention', async () => {
    const testContext = buildCtx();
    testContext.services.register('ai', buildFakeAiService().service);
    const { message, reply } = fakeMessage('hey what is up');
    await mentionChatHandler.handler(testContext.ctx, message);
    expect(reply).not.toHaveBeenCalled();
  });

  it('ignores a reply-ping that mentions the bot in `mentions.users` without a literal <@id> in the content (hard rule: explicit @mention only)', async () => {
    const testContext = buildCtx();
    const { service, calls } = buildFakeAiService();
    testContext.services.register('ai', service);
    // Simulates Discord's reply-ping behavior: mentions.users has the bot, but the raw text never contains <@botId>.
    const { message, reply } = fakeMessage('thanks for the help earlier', {
      mentions: { users: new Map([[BOT_ID, { id: BOT_ID }]]) },
    });
    await mentionChatHandler.handler(testContext.ctx, message);
    expect(reply).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it('ignores the wrong channel', async () => {
    const testContext = buildCtx();
    testContext.services.register('ai', buildFakeAiService().service);
    const { message, reply } = mentioningMessage('hello', { channelId: OTHER_CHANNEL_ID });
    await mentionChatHandler.handler(testContext.ctx, message);
    expect(reply).not.toHaveBeenCalled();
  });

  it('ignores bots, webhooks, and DMs', async () => {
    const testContext = buildCtx();
    testContext.services.register('ai', buildFakeAiService().service);
    const bot = mentioningMessage('hello', { author: { id: 'b', bot: true, username: 'b', tag: 'b#0' } });
    await mentionChatHandler.handler(testContext.ctx, bot.message);
    const webhook = mentioningMessage('hello', { webhookId: 'wh' });
    await mentionChatHandler.handler(testContext.ctx, webhook.message);
    const dm = mentioningMessage('hello', { inGuild: () => false });
    await mentionChatHandler.handler(testContext.ctx, dm.message);
    expect(bot.reply).not.toHaveBeenCalled();
    expect(webhook.reply).not.toHaveBeenCalled();
    expect(dm.reply).not.toHaveBeenCalled();
  });

  it('does nothing while chat.enabled is false', async () => {
    const off = configSchema.parse({ chat: { enabled: false, channelIds: [CHANNEL_ID] } });
    const testContext = buildCtx(off);
    testContext.services.register('ai', buildFakeAiService().service);
    const { message, reply } = mentioningMessage('hello');
    await mentionChatHandler.handler(testContext.ctx, message);
    expect(reply).not.toHaveBeenCalled();
  });

  it('does nothing without the Message Content intent', async () => {
    const testContext = createTestContext({
      config: enabledChatConfig,
      intentsEnabled: { messageContent: false },
      overrides: { t: realT, client: { user: { id: BOT_ID } } as never },
    });
    testContext.services.register('ai', buildFakeAiService().service);
    const { message, reply } = mentioningMessage('hello');
    await mentionChatHandler.handler(testContext.ctx, message);
    expect(reply).not.toHaveBeenCalled();
  });

  it('replies with a hint when the prompt is empty after the mention is stripped', async () => {
    const testContext = buildCtx();
    const { service, calls } = buildFakeAiService();
    testContext.services.register('ai', service);
    const { message, reply } = mentioningMessage('');
    await mentionChatHandler.handler(testContext.ctx, message);
    expect(calls).toHaveLength(0);
    expect(reply).toHaveBeenCalledTimes(1);
    const payload = reply.mock.calls[0]![0] as { content: string };
    expect(payload.content).toContain('what');
  });

  it('strips the mention from the prompt sent to the AI service', async () => {
    const testContext = buildCtx();
    const { service, calls } = buildFakeAiService();
    testContext.services.register('ai', service);
    const { message } = mentioningMessage('what are the rules here?');
    await mentionChatHandler.handler(testContext.ctx, message);
    expect(calls).toHaveLength(1);
    expect(calls[0].prompt).not.toContain(`<@${BOT_ID}>`);
    expect(calls[0].prompt).toContain('what are the rules here?');
    expect(calls[0].command).toBe('mention-chat');
  });

  it('builds the system prompt as BASE_SAFETY_PROMPT followed by the configured persona', async () => {
    const withPersona = configSchema.parse({
      chat: { enabled: true, channelIds: [CHANNEL_ID], persona: 'A grumpy but lovable pirate captain.' },
    });
    const testContext = buildCtx(withPersona);
    const { service, calls } = buildFakeAiService();
    testContext.services.register('ai', service);
    const { message } = mentioningMessage('ahoy there');
    await mentionChatHandler.handler(testContext.ctx, message);
    expect(calls).toHaveLength(1);
    const system = calls[0].system ?? '';
    expect(system.startsWith(BASE_SAFETY_PROMPT)).toBe(true);
    const safetyIndex = system.indexOf(BASE_SAFETY_PROMPT);
    const personaIndex = system.indexOf('A grumpy but lovable pirate captain.');
    expect(personaIndex).toBeGreaterThan(safetyIndex);
  });

  it('applies the per-user cooldown silently (no reply on the second mention within the window)', async () => {
    const cooldownConfig = configSchema.parse({
      chat: { enabled: true, channelIds: [CHANNEL_ID] },
      userCooldownSeconds: 30,
    });
    const testContext = buildCtx(cooldownConfig);
    const { service, calls } = buildFakeAiService();
    testContext.services.register('ai', service);

    const first = mentioningMessage('hello there');
    await mentionChatHandler.handler(testContext.ctx, first.message);
    expect(calls).toHaveLength(1);
    expect(first.reply).toHaveBeenCalledTimes(1);

    const second = mentioningMessage('hello again');
    await mentionChatHandler.handler(testContext.ctx, second.message);
    // Still on cooldown: no second AI call, and no rate-limit reply either (silent, per the handler's design).
    expect(calls).toHaveLength(1);
    expect(second.reply).not.toHaveBeenCalled();
  });

  it('truncates the reply to maxReplyChars and appends the disclosure', async () => {
    const tightConfig = configSchema.parse({
      chat: { enabled: true, channelIds: [CHANNEL_ID], maxReplyChars: 200 },
    });
    const testContext = buildCtx(tightConfig);
    const longText = 'x'.repeat(1000);
    const { service } = buildFakeAiService({ text: longText });
    testContext.services.register('ai', service);

    const { message, reply } = mentioningMessage('tell me a long story');
    await mentionChatHandler.handler(testContext.ctx, message);

    expect(reply).toHaveBeenCalledTimes(1);
    const payload = reply.mock.calls[0]![0] as { content: string; allowedMentions: unknown };
    expect(payload.content.length).toBeLessThanOrEqual(200);
    expect(payload.content).toContain('AI can be inaccurate');
    expect(payload.allowedMentions).toEqual({ repliedUser: true, parse: [] });
  });

  it('never throws when the provider call fails, and throttles the fallback reply to once per hour per channel', async () => {
    // Cooldown disabled so the second mention actually reaches the provider call again (and fails again),
    // isolating the failure-reply throttle from the separate per-user cooldown behavior covered above.
    const noCooldownConfig = configSchema.parse({
      chat: { enabled: true, channelIds: [CHANNEL_ID] },
      userCooldownSeconds: 0,
    });
    const testContext = buildCtx(noCooldownConfig);
    const { service, calls } = buildFakeAiService(undefined, async () => {
      throw new Error('provider is down');
    });
    testContext.services.register('ai', service);

    const first = mentioningMessage('hello');
    await expect(mentionChatHandler.handler(testContext.ctx, first.message)).resolves.toBeUndefined();
    expect(first.reply).toHaveBeenCalledTimes(1);
    const payload = first.reply.mock.calls[0]![0] as { content: string };
    expect(payload.content).toBe('AI is unavailable right now.');

    // A second mention shortly after (still the same hour-per-channel window) fails again, but the fallback
    // reply itself is throttled — only the first failure gets a visible notice.
    const second = mentioningMessage('hello again');
    await expect(mentionChatHandler.handler(testContext.ctx, second.message)).resolves.toBeUndefined();
    expect(second.reply).not.toHaveBeenCalled();
    // Both mentions actually reached (and failed at) the provider — the throttle only gates the reply, not
    // whether the handler keeps trying.
    expect(calls).toHaveLength(2);
  });
});
