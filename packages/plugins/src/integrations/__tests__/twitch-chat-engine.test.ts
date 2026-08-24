import { describe, expect, it, vi } from 'vitest';
import {
  CommandCooldowns,
  applyTemplate,
  handleChatMessage,
  resolveChatterLevel,
  type EngineChannel,
  type EngineCommand,
  type EngineHelix,
} from '../twitch-chat/engine';

const CHANNEL: EngineChannel = {
  id: 'channel-1',
  commandPrefix: '!',
  broadcasterLogin: 'somestreamer',
  broadcasterUserId: 'b-1',
};

const BOT_USER_ID = 'bot-1';

function command(overrides: Partial<EngineCommand> = {}): EngineCommand {
  return {
    name: 'hello',
    response: 'Hi {user}, welcome to {channel}!',
    cooldownSeconds: 5,
    minLevel: 'EVERYONE',
    enabled: true,
    ...overrides,
  };
}

function chatEvent(overrides: Partial<Parameters<typeof handleChatMessage>[0]['event']> = {}) {
  return {
    chatterUserId: 'viewer-1',
    chatterDisplayName: 'ViewerOne',
    messageText: '',
    badgeSetIds: [] as string[],
    ...overrides,
  };
}

function makeHelix(overrides: Partial<EngineHelix> = {}): EngineHelix {
  return {
    getStream: vi.fn(async () => ({ ok: true, value: null })),
    getChannelInfo: vi.fn(async () => ({ ok: true, value: null })),
    ...overrides,
  };
}

describe('resolveChatterLevel', () => {
  it('is EVERYONE with no badges', () => {
    expect(resolveChatterLevel([])).toBe('EVERYONE');
  });

  it('maps subscriber/founder/vip/moderator/broadcaster badges to the ladder', () => {
    expect(resolveChatterLevel(['subscriber'])).toBe('SUBSCRIBER');
    expect(resolveChatterLevel(['founder'])).toBe('SUBSCRIBER');
    expect(resolveChatterLevel(['vip'])).toBe('VIP');
    expect(resolveChatterLevel(['moderator'])).toBe('MODERATOR');
    expect(resolveChatterLevel(['broadcaster'])).toBe('BROADCASTER');
  });

  it('takes the highest level when multiple badges are present', () => {
    expect(resolveChatterLevel(['subscriber', 'moderator'])).toBe('MODERATOR');
  });

  it('ignores unrecognized badge set ids', () => {
    expect(resolveChatterLevel(['sub-gifter', 'bits-leader'])).toBe('EVERYONE');
  });
});

describe('applyTemplate', () => {
  it('fills {user} and {channel} and nothing else', () => {
    expect(applyTemplate('Hi {user} on {channel}! {unknown}', { user: 'Bob', channel: 'foo' })).toBe(
      'Hi Bob on foo! {unknown}',
    );
  });
});

describe('handleChatMessage', () => {
  it('ignores messages from the bot itself, even if they look like a command', async () => {
    const reply = await handleChatMessage({
      botUserId: BOT_USER_ID,
      channel: CHANNEL,
      commands: [command()],
      event: chatEvent({ chatterUserId: BOT_USER_ID, messageText: '!hello' }),
      cooldowns: new CommandCooldowns(),
      helix: makeHelix(),
    });
    expect(reply).toBeNull();
  });

  it('ignores messages that do not start with the configured prefix', async () => {
    const reply = await handleChatMessage({
      botUserId: BOT_USER_ID,
      channel: CHANNEL,
      commands: [command()],
      event: chatEvent({ messageText: 'hello there, no prefix' }),
      cooldowns: new CommandCooldowns(),
      helix: makeHelix(),
    });
    expect(reply).toBeNull();
  });

  it('ignores unknown commands', async () => {
    const reply = await handleChatMessage({
      botUserId: BOT_USER_ID,
      channel: CHANNEL,
      commands: [command()],
      event: chatEvent({ messageText: '!nope' }),
      cooldowns: new CommandCooldowns(),
      helix: makeHelix(),
    });
    expect(reply).toBeNull();
  });

  it('runs a matching custom command and fills {user}/{channel}', async () => {
    const reply = await handleChatMessage({
      botUserId: BOT_USER_ID,
      channel: CHANNEL,
      commands: [command()],
      event: chatEvent({ messageText: '!hello' }),
      cooldowns: new CommandCooldowns(),
      helix: makeHelix(),
    });
    expect(reply).toBe('Hi ViewerOne, welcome to somestreamer!');
  });

  it('matches command names case-insensitively', async () => {
    const reply = await handleChatMessage({
      botUserId: BOT_USER_ID,
      channel: CHANNEL,
      commands: [command()],
      event: chatEvent({ messageText: '!HELLO' }),
      cooldowns: new CommandCooldowns(),
      helix: makeHelix(),
    });
    expect(reply).not.toBeNull();
  });

  it('skips disabled commands', async () => {
    const reply = await handleChatMessage({
      botUserId: BOT_USER_ID,
      channel: CHANNEL,
      commands: [command({ enabled: false })],
      event: chatEvent({ messageText: '!hello' }),
      cooldowns: new CommandCooldowns(),
      helix: makeHelix(),
    });
    expect(reply).toBeNull();
  });

  describe('level gating', () => {
    it('blocks a below-level chatter', async () => {
      const reply = await handleChatMessage({
        botUserId: BOT_USER_ID,
        channel: CHANNEL,
        commands: [command({ minLevel: 'MODERATOR' })],
        event: chatEvent({ messageText: '!hello', badgeSetIds: ['subscriber'] }),
        cooldowns: new CommandCooldowns(),
        helix: makeHelix(),
      });
      expect(reply).toBeNull();
    });

    it('allows a chatter who meets the level exactly', async () => {
      const reply = await handleChatMessage({
        botUserId: BOT_USER_ID,
        channel: CHANNEL,
        commands: [command({ minLevel: 'VIP' })],
        event: chatEvent({ messageText: '!hello', badgeSetIds: ['vip'] }),
        cooldowns: new CommandCooldowns(),
        helix: makeHelix(),
      });
      expect(reply).not.toBeNull();
    });

    it('allows a chatter above the required level', async () => {
      const reply = await handleChatMessage({
        botUserId: BOT_USER_ID,
        channel: CHANNEL,
        commands: [command({ minLevel: 'SUBSCRIBER' })],
        event: chatEvent({ messageText: '!hello', badgeSetIds: ['broadcaster'] }),
        cooldowns: new CommandCooldowns(),
        helix: makeHelix(),
      });
      expect(reply).not.toBeNull();
    });
  });

  describe('cooldowns', () => {
    it('blocks a second use of the same command in the same channel within the cooldown window', async () => {
      const cooldowns = new CommandCooldowns();
      let now = 1_000_000;
      const input = {
        botUserId: BOT_USER_ID,
        channel: CHANNEL,
        commands: [command({ cooldownSeconds: 10 })],
        event: chatEvent({ messageText: '!hello' }),
        cooldowns,
        helix: makeHelix(),
      };

      const first = await handleChatMessage({ ...input, now });
      expect(first).not.toBeNull();

      now += 5000; // still within the 10s cooldown
      const second = await handleChatMessage({ ...input, now });
      expect(second).toBeNull();

      now += 6000; // now past the cooldown
      const third = await handleChatMessage({ ...input, now });
      expect(third).not.toBeNull();
    });

    it('cooldowns are independent per channel', async () => {
      const cooldowns = new CommandCooldowns();
      const now = 1_000_000;
      const commands = [command({ cooldownSeconds: 10 })];

      const first = await handleChatMessage({
        botUserId: BOT_USER_ID,
        channel: CHANNEL,
        commands,
        event: chatEvent({ messageText: '!hello' }),
        cooldowns,
        helix: makeHelix(),
        now,
      });
      expect(first).not.toBeNull();

      const otherChannel: EngineChannel = { ...CHANNEL, id: 'channel-2', broadcasterLogin: 'other' };
      const second = await handleChatMessage({
        botUserId: BOT_USER_ID,
        channel: otherChannel,
        commands,
        event: chatEvent({ messageText: '!hello' }),
        cooldowns,
        helix: makeHelix(),
        now,
      });
      expect(second).not.toBeNull();
    });
  });

  describe('built-ins', () => {
    it('!commands lists enabled custom command names sorted, prefixed', async () => {
      const reply = await handleChatMessage({
        botUserId: BOT_USER_ID,
        channel: CHANNEL,
        commands: [command({ name: 'zzz' }), command({ name: 'aaa' }), command({ name: 'off', enabled: false })],
        event: chatEvent({ messageText: '!commands' }),
        cooldowns: new CommandCooldowns(),
        helix: makeHelix(),
      });
      expect(reply).toBe('Commands: !aaa, !zzz');
    });

    it('!commands reports when there are none', async () => {
      const reply = await handleChatMessage({
        botUserId: BOT_USER_ID,
        channel: CHANNEL,
        commands: [],
        event: chatEvent({ messageText: '!commands' }),
        cooldowns: new CommandCooldowns(),
        helix: makeHelix(),
      });
      expect(reply).toBe('No custom commands are set up for this channel.');
    });

    it('!uptime reports offline when getStream resolves ok with no live stream', async () => {
      const reply = await handleChatMessage({
        botUserId: BOT_USER_ID,
        channel: CHANNEL,
        commands: [],
        event: chatEvent({ messageText: '!uptime' }),
        cooldowns: new CommandCooldowns(),
        helix: makeHelix({ getStream: vi.fn(async () => ({ ok: true, value: null })) }),
      });
      expect(reply).toBe('somestreamer is offline.');
    });

    it('!uptime reports elapsed time when live', async () => {
      const now = new Date('2026-01-01T02:30:00.000Z').getTime();
      const startedAt = '2026-01-01T00:00:00.000Z';
      const reply = await handleChatMessage({
        botUserId: BOT_USER_ID,
        channel: CHANNEL,
        commands: [],
        event: chatEvent({ messageText: '!uptime' }),
        cooldowns: new CommandCooldowns(),
        helix: makeHelix({ getStream: vi.fn(async () => ({ ok: true, value: { startedAt } })) }),
        now,
      });
      expect(reply).toBe('somestreamer has been live for 2h 30m.');
    });

    it('!uptime sends nothing when the Helix lookup itself fails, instead of falsely claiming offline', async () => {
      const reply = await handleChatMessage({
        botUserId: BOT_USER_ID,
        channel: CHANNEL,
        commands: [],
        event: chatEvent({ messageText: '!uptime' }),
        cooldowns: new CommandCooldowns(),
        helix: makeHelix({ getStream: vi.fn(async () => ({ ok: false as const })) }),
      });
      expect(reply).toBeNull();
    });

    it('!title reports the current title', async () => {
      const reply = await handleChatMessage({
        botUserId: BOT_USER_ID,
        channel: CHANNEL,
        commands: [],
        event: chatEvent({ messageText: '!title' }),
        cooldowns: new CommandCooldowns(),
        helix: makeHelix({ getChannelInfo: vi.fn(async () => ({ ok: true, value: { title: 'Playing some games' } })) }),
      });
      expect(reply).toBe('Title: Playing some games');
    });

    it('!title reports no title set', async () => {
      const reply = await handleChatMessage({
        botUserId: BOT_USER_ID,
        channel: CHANNEL,
        commands: [],
        event: chatEvent({ messageText: '!title' }),
        cooldowns: new CommandCooldowns(),
        helix: makeHelix({ getChannelInfo: vi.fn(async () => ({ ok: true, value: { title: '' } })) }),
      });
      expect(reply).toBe('No title is set.');
    });

    it('!title sends nothing when the Helix lookup itself fails, instead of falsely claiming no title', async () => {
      const reply = await handleChatMessage({
        botUserId: BOT_USER_ID,
        channel: CHANNEL,
        commands: [],
        event: chatEvent({ messageText: '!title' }),
        cooldowns: new CommandCooldowns(),
        helix: makeHelix({ getChannelInfo: vi.fn(async () => ({ ok: false as const })) }),
      });
      expect(reply).toBeNull();
    });

    it('built-in names take priority over a same-named custom command', async () => {
      const reply = await handleChatMessage({
        botUserId: BOT_USER_ID,
        channel: CHANNEL,
        commands: [command({ name: 'uptime', response: 'custom response' })],
        event: chatEvent({ messageText: '!uptime' }),
        cooldowns: new CommandCooldowns(),
        helix: makeHelix({ getStream: vi.fn(async () => ({ ok: true, value: null })) }),
      });
      expect(reply).toBe('somestreamer is offline.');
    });

    it('rate-limits repeated calls to the same built-in in the same channel (fixed 5s cooldown)', async () => {
      const cooldowns = new CommandCooldowns();
      let now = 2_000_000;
      const helix = makeHelix({ getStream: vi.fn(async () => ({ ok: true, value: null })) });
      const input = {
        botUserId: BOT_USER_ID,
        channel: CHANNEL,
        commands: [],
        event: chatEvent({ messageText: '!uptime' }),
        cooldowns,
        helix,
      };

      const first = await handleChatMessage({ ...input, now });
      expect(first).toBe('somestreamer is offline.');

      now += 2000; // within the 5s built-in cooldown
      const second = await handleChatMessage({ ...input, now });
      expect(second).toBeNull();

      now += 4000; // now past the 5s cooldown
      const third = await handleChatMessage({ ...input, now });
      expect(third).toBe('somestreamer is offline.');
    });

    it('built-in cooldowns are independent per built-in name', async () => {
      const cooldowns = new CommandCooldowns();
      const now = 3_000_000;
      const helix = makeHelix({
        getStream: vi.fn(async () => ({ ok: true, value: null })),
        getChannelInfo: vi.fn(async () => ({ ok: true, value: { title: 'Hello' } })),
      });

      const uptimeReply = await handleChatMessage({
        botUserId: BOT_USER_ID,
        channel: CHANNEL,
        commands: [],
        event: chatEvent({ messageText: '!uptime' }),
        cooldowns,
        helix,
        now,
      });
      expect(uptimeReply).not.toBeNull();

      // A different built-in, same instant, same channel — must not be blocked by !uptime's cooldown.
      const titleReply = await handleChatMessage({
        botUserId: BOT_USER_ID,
        channel: CHANNEL,
        commands: [],
        event: chatEvent({ messageText: '!title' }),
        cooldowns,
        helix,
        now,
      });
      expect(titleReply).toBe('Title: Hello');
    });
  });
});
