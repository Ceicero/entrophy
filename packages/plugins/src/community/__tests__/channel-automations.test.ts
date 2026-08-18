import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, MessageFlagsBitField } from 'discord.js';
import { createTestContext } from '../../sdk/testing';
import { configSchema, type AutoThreadRule } from '../manifest';
import {
  autoPublishCountKey,
  autoPublishWarnedKey,
  autoThreadWarnedKey,
  findAutoThreadRule,
  isCrosspostLimitError,
  isMissingPermissionsError,
  renderThreadName,
  shouldAutoPublish,
  shouldAutoThread,
  utcDayKey,
} from '../channel-automations';
import { channelAutomationsHandler } from '../events/channel-automations';

const BOT_ID = 'bot1';

function publishCandidate(over: Partial<Parameters<typeof shouldAutoPublish>[0]> = {}) {
  return {
    channelId: 'c1',
    channelType: ChannelType.GuildAnnouncement,
    authorIsBot: false,
    authorId: 'u1',
    botUserId: BOT_ID,
    flagsCrossposted: false,
    ...over,
  };
}

function rule(over: Partial<AutoThreadRule> = {}): AutoThreadRule {
  return {
    channelId: 'c1',
    nameTemplate: '{user} — {date}',
    archiveMinutes: 1440,
    requireAttachment: false,
    starterMessage: null,
    ...over,
  };
}

describe('configSchema defaults', () => {
  it('parses empty config into empty auto-publish/auto-thread settings', () => {
    const cfg = configSchema.parse({});
    expect(cfg.autoPublish).toEqual({ channelIds: [], includeBots: false });
    expect(cfg.autoThreads).toEqual([]);
  });

  it('applies rule defaults and rejects invalid archive durations', () => {
    const cfg = configSchema.parse({ autoThreads: [{ channelId: 'c1' }] });
    expect(cfg.autoThreads[0]).toEqual(rule());
    expect(() => configSchema.parse({ autoThreads: [{ channelId: 'c1', archiveMinutes: 30 }] })).toThrow();
  });
});

describe('shouldAutoPublish', () => {
  const cfg = { channelIds: ['c1'], includeBots: false };

  it('publishes a human message in a listed announcement channel', () => {
    expect(shouldAutoPublish(publishCandidate(), cfg)).toBe(true);
  });

  it('ignores non-announcement channels and unlisted channels', () => {
    expect(shouldAutoPublish(publishCandidate({ channelType: ChannelType.GuildText }), cfg)).toBe(false);
    expect(shouldAutoPublish(publishCandidate({ channelId: 'other' }), cfg)).toBe(false);
  });

  it('skips messages that are already crossposted', () => {
    expect(shouldAutoPublish(publishCandidate({ flagsCrossposted: true }), cfg)).toBe(false);
  });

  it('skips other bots unless includeBots, but always allows this bot', () => {
    expect(shouldAutoPublish(publishCandidate({ authorIsBot: true, authorId: 'otherbot' }), cfg)).toBe(false);
    expect(
      shouldAutoPublish(publishCandidate({ authorIsBot: true, authorId: 'otherbot' }), {
        ...cfg,
        includeBots: true,
      }),
    ).toBe(true);
    expect(shouldAutoPublish(publishCandidate({ authorIsBot: true, authorId: BOT_ID }), cfg)).toBe(true);
  });
});

describe('findAutoThreadRule', () => {
  it('finds the rule by channel id', () => {
    const rules = [rule({ channelId: 'a' }), rule({ channelId: 'b' })];
    expect(findAutoThreadRule('b', rules)?.channelId).toBe('b');
    expect(findAutoThreadRule('zzz', rules)).toBeUndefined();
  });
});

describe('renderThreadName', () => {
  const vars = { user: 'Ada', 'user.tag': 'ada#0001', server: 'Lab', date: '2026-08-18' };

  it('substitutes known tokens and leaves unknown tokens literal', () => {
    expect(renderThreadName('{user} — {date}', vars)).toBe('Ada — 2026-08-18');
    expect(renderThreadName('{user.tag} in {server} {nope}', vars)).toBe('ada#0001 in Lab {nope}');
  });

  it('truncates the rendered name to 100 characters', () => {
    const name = renderThreadName(`${'x'.repeat(98)} {user}`, vars);
    expect(name.endsWith('…')).toBe(true);
    expect(name.length).toBe(100);
  });

  it('never returns an empty name', () => {
    expect(renderThreadName('   ', vars)).toBe('Thread');
  });
});

describe('shouldAutoThread', () => {
  it('skips bots and messages that already have a thread', () => {
    expect(
      shouldAutoThread(
        { hasAttachmentOrEmbed: true, authorIsBot: true, isThreadStarterAlready: false },
        rule(),
      ),
    ).toBe(false);
    expect(
      shouldAutoThread(
        { hasAttachmentOrEmbed: true, authorIsBot: false, isThreadStarterAlready: true },
        rule(),
      ),
    ).toBe(false);
  });

  it('honours requireAttachment', () => {
    const r = rule({ requireAttachment: true });
    expect(
      shouldAutoThread({ hasAttachmentOrEmbed: false, authorIsBot: false, isThreadStarterAlready: false }, r),
    ).toBe(false);
    expect(
      shouldAutoThread({ hasAttachmentOrEmbed: true, authorIsBot: false, isThreadStarterAlready: false }, r),
    ).toBe(true);
    expect(
      shouldAutoThread(
        { hasAttachmentOrEmbed: false, authorIsBot: false, isThreadStarterAlready: false },
        rule(),
      ),
    ).toBe(true);
  });
});

describe('error classifiers', () => {
  it('recognises 50013 and crosspost/rate-limit errors', () => {
    expect(isMissingPermissionsError({ code: 50013 })).toBe(true);
    expect(isMissingPermissionsError({ code: 10008 })).toBe(false);
    expect(isCrosspostLimitError({ status: 429 })).toBe(true);
    expect(isCrosspostLimitError(new Error('You are being rate limited.'))).toBe(true);
    expect(isCrosspostLimitError(new Error('Unknown Message'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// messageCreate handler
// ---------------------------------------------------------------------------

interface FakeMessageOptions {
  channelId?: string;
  channelType?: ChannelType;
  authorBot?: boolean;
  authorId?: string;
  attachments?: number;
  hasThread?: boolean;
  crosspost?: () => Promise<unknown>;
  startThread?: (opts: unknown) => Promise<{ send: (payload: unknown) => Promise<unknown> }>;
}

type HandlerMessage = Parameters<typeof channelAutomationsHandler.handler>[1];

function fakeMessage(o: FakeMessageOptions = {}): HandlerMessage {
  const attachments = new Map<string, unknown>();
  for (let i = 0; i < (o.attachments ?? 0); i++) attachments.set(`a${i}`, {});
  return {
    guildId: 'g1',
    guild: { id: 'g1', name: 'Lab' },
    channelId: o.channelId ?? 'c1',
    channel: { type: o.channelType ?? ChannelType.GuildAnnouncement },
    system: false,
    inGuild: () => true,
    author: {
      bot: o.authorBot ?? false,
      id: o.authorId ?? 'u1',
      username: 'ada',
      displayName: 'Ada',
      tag: 'ada#0001',
    },
    member: { displayName: 'Ada' },
    client: { user: { id: BOT_ID } },
    flags: new MessageFlagsBitField(0),
    attachments,
    embeds: [],
    hasThread: o.hasThread ?? false,
    createdAt: new Date('2026-08-18T12:00:00Z'),
    crosspost: o.crosspost ?? (async () => undefined),
    startThread: o.startThread ?? (async () => ({ send: async () => undefined })),
  } as unknown as HandlerMessage;
}

describe('channelAutomationsHandler', () => {
  // ioredis-mock instances share one in-memory store, so clear it between tests.
  beforeEach(async () => {
    await createTestContext().redis.flushall();
  });

  it('crossposts a human message in a listed announcement channel and bumps the daily counter', async () => {
    const { ctx, redis } = createTestContext({
      config: { autoPublish: { channelIds: ['c1'], includeBots: false }, autoThreads: [] },
    });
    const crosspost = vi.fn(async () => undefined);
    await channelAutomationsHandler.handler(ctx, fakeMessage({ crosspost }));
    expect(crosspost).toHaveBeenCalledTimes(1);
    expect(await redis.get(autoPublishCountKey('g1', utcDayKey()))).toBe('1');
  });

  it('leaves messages in unlisted channels alone', async () => {
    const { ctx } = createTestContext({
      config: { autoPublish: { channelIds: ['c1'], includeBots: false }, autoThreads: [] },
    });
    const crosspost = vi.fn(async () => undefined);
    await channelAutomationsHandler.handler(ctx, fakeMessage({ channelId: 'c9', crosspost }));
    expect(crosspost).not.toHaveBeenCalled();
  });

  it('on 50013 logs once per hour per channel (warned key set), never throws', async () => {
    const { ctx, redis, services } = createTestContext({
      config: { autoPublish: { channelIds: ['c1'], includeBots: false }, autoThreads: [] },
    });
    const log = vi.fn<(guildId: string, kind: string, payload: unknown) => Promise<void>>(
      async () => undefined,
    );
    services.register('logging', { log } as unknown as NonNullable<
      ReturnType<typeof services.get<'logging'>>
    >);
    const crosspost = vi.fn(async () => {
      throw Object.assign(new Error('Missing Permissions'), { code: 50013 });
    });

    await channelAutomationsHandler.handler(ctx, fakeMessage({ crosspost }));
    await channelAutomationsHandler.handler(ctx, fakeMessage({ crosspost }));

    expect(crosspost).toHaveBeenCalledTimes(2);
    expect(await redis.get(autoPublishWarnedKey('c1'))).toBe('1');
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[1]).toBe('bot.error');
    expect(await redis.get(autoPublishCountKey('g1', utcDayKey()))).toBeNull();
  });

  it('starts a thread from the template and posts the starter message', async () => {
    const { ctx } = createTestContext({
      config: {
        autoPublish: { channelIds: [], includeBots: false },
        autoThreads: [
          rule({ channelId: 'c2', nameTemplate: '{user} · {date}', starterMessage: 'Hi {user}!' }),
        ],
      },
    });
    const send = vi.fn(async () => undefined);
    const startThread = vi.fn(async () => ({ send }));
    await channelAutomationsHandler.handler(
      ctx,
      fakeMessage({ channelId: 'c2', channelType: ChannelType.GuildText, startThread }),
    );
    expect(startThread).toHaveBeenCalledWith({
      name: 'Ada · 2026-08-18',
      autoArchiveDuration: 1440,
      reason: 'Auto-thread',
    });
    expect(send).toHaveBeenCalledWith({ content: 'Hi Ada!', allowedMentions: { parse: [] } });
  });

  it('does not thread bot posts, text-only posts under requireAttachment, or posts that already have a thread', async () => {
    const { ctx } = createTestContext({
      config: {
        autoPublish: { channelIds: [], includeBots: false },
        autoThreads: [rule({ channelId: 'c2', requireAttachment: true })],
      },
    });
    const startThread = vi.fn(async () => ({ send: async () => undefined }));
    const base = { channelId: 'c2', channelType: ChannelType.GuildText, startThread };
    await channelAutomationsHandler.handler(ctx, fakeMessage({ ...base, authorBot: true, attachments: 1 }));
    await channelAutomationsHandler.handler(ctx, fakeMessage({ ...base, attachments: 0 }));
    await channelAutomationsHandler.handler(ctx, fakeMessage({ ...base, attachments: 1, hasThread: true }));
    expect(startThread).not.toHaveBeenCalled();
    await channelAutomationsHandler.handler(ctx, fakeMessage({ ...base, attachments: 1 }));
    expect(startThread).toHaveBeenCalledTimes(1);
  });

  it('warns once per hour when thread creation fails', async () => {
    const { ctx, redis } = createTestContext({
      config: {
        autoPublish: { channelIds: [], includeBots: false },
        autoThreads: [rule({ channelId: 'c2' })],
      },
    });
    const startThread = vi.fn(async () => {
      throw Object.assign(new Error('Missing Permissions'), { code: 50013 });
    });
    const msg = () => fakeMessage({ channelId: 'c2', channelType: ChannelType.GuildText, startThread });
    await expect(channelAutomationsHandler.handler(ctx, msg())).resolves.toBeUndefined();
    await expect(channelAutomationsHandler.handler(ctx, msg())).resolves.toBeUndefined();
    expect(await redis.get(autoThreadWarnedKey('c2'))).toBe('1');
  });

  it('does nothing when neither automation is configured', async () => {
    const { ctx } = createTestContext({ config: configSchema.parse({}) });
    const crosspost = vi.fn(async () => undefined);
    await channelAutomationsHandler.handler(ctx, fakeMessage({ crosspost }));
    expect(crosspost).not.toHaveBeenCalled();
  });
});
