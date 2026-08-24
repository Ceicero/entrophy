import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestContext } from '../../sdk/testing';
import { fireDueTimers } from '../twitch-chat/timers';
import type { TwitchChatManager } from '../twitch-chat/manager';

// `vi.mock` factories are hoisted above every import, including this file's own top-level `const`s — a plain
// outer variable referenced inside the factory would still be in its temporal dead zone when the factory runs.
// `vi.hoisted` runs (and is itself hoisted) before that, so `mocks.sendChatMessage` is safe to close over.
const mocks = vi.hoisted(() => ({ sendChatMessage: vi.fn() }));

vi.mock('../twitch-chat/helix', () => ({
  sendChatMessage: (...args: unknown[]) => mocks.sendChatMessage(...args),
}));

const sendChatMessage = mocks.sendChatMessage;

function fakeManager(connectedChannelIds: string[]): TwitchChatManager {
  return { connectedChannelIds: () => connectedChannelIds } as unknown as TwitchChatManager;
}

function makeTimer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'timer-1',
    channelId: 'channel-1',
    guildId: 'guild-1',
    name: 'social',
    message: 'Follow us!',
    intervalMinutes: 30,
    enabled: true,
    lastFiredAt: null,
    createdBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    channel: { id: 'channel-1', broadcasterUserId: 'b-1', broadcasterLogin: 'somestreamer' },
    ...overrides,
  };
}

beforeEach(() => {
  sendChatMessage.mockReset();
  sendChatMessage.mockResolvedValue({ ok: true });
});

describe('fireDueTimers', () => {
  it('does nothing when the manager has no connected channels', async () => {
    const { ctx, prismaCalls } = createTestContext();
    await fireDueTimers(ctx, fakeManager([]));
    expect(prismaCalls).toHaveLength(0);
    expect(sendChatMessage).not.toHaveBeenCalled();
  });

  it('only queries timers for currently-connected channels', async () => {
    const { ctx, prismaCalls } = createTestContext({
      prismaOverrides: { twitchChatTimer: { findMany: async () => [] } },
    });
    await fireDueTimers(ctx, fakeManager(['channel-1', 'channel-2']));
    const call = prismaCalls.find((c) => c.model === 'twitchChatTimer' && c.method === 'findMany');
    expect(call).toBeTruthy();
    const args = call?.args[0] as { where: { channelId: { in: string[] } } };
    expect(args.where.channelId.in).toEqual(['channel-1', 'channel-2']);
  });

  it('fires a timer that has never fired before (lastFiredAt: null)', async () => {
    const updates: unknown[] = [];
    const { ctx } = createTestContext({
      prismaOverrides: {
        twitchChatTimer: {
          findMany: async () => [makeTimer({ lastFiredAt: null })],
          update: async (args: unknown) => {
            updates.push(args);
            return {};
          },
        },
      },
    });

    await fireDueTimers(ctx, fakeManager(['channel-1']));

    expect(sendChatMessage).toHaveBeenCalledWith(ctx, 'b-1', 'Follow us!');
    expect(updates).toHaveLength(1);
  });

  it('does not fire a timer whose interval has not elapsed yet', async () => {
    const now = new Date('2026-01-01T12:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const updates: unknown[] = [];
    const { ctx } = createTestContext({
      prismaOverrides: {
        twitchChatTimer: {
          findMany: async () => [
            makeTimer({ intervalMinutes: 30, lastFiredAt: new Date(now.getTime() - 10 * 60_000) }),
          ],
          update: async (args: unknown) => {
            updates.push(args);
            return {};
          },
        },
      },
    });

    await fireDueTimers(ctx, fakeManager(['channel-1']));

    expect(sendChatMessage).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
    vi.useRealTimers();
  });

  it('fires a timer once its interval has elapsed and stamps lastFiredAt', async () => {
    const now = new Date('2026-01-01T12:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const updates: { where: { id: string }; data: { lastFiredAt: Date } }[] = [];
    const { ctx } = createTestContext({
      prismaOverrides: {
        twitchChatTimer: {
          findMany: async () => [
            makeTimer({ intervalMinutes: 30, lastFiredAt: new Date(now.getTime() - 31 * 60_000) }),
          ],
          update: async (args: unknown) => {
            updates.push(args as (typeof updates)[number]);
            return {};
          },
        },
      },
    });

    await fireDueTimers(ctx, fakeManager(['channel-1']));

    expect(sendChatMessage).toHaveBeenCalledTimes(1);
    expect(updates).toHaveLength(1);
    expect(updates[0].where.id).toBe('timer-1');
    expect(updates[0].data.lastFiredAt.getTime()).toBe(now.getTime());
    vi.useRealTimers();
  });

  it('does not stamp lastFiredAt when the send fails', async () => {
    sendChatMessage.mockResolvedValueOnce({ ok: false, error: 'throttled' });
    const updates: unknown[] = [];
    const { ctx } = createTestContext({
      prismaOverrides: {
        twitchChatTimer: {
          findMany: async () => [makeTimer({ lastFiredAt: null })],
          update: async (args: unknown) => {
            updates.push(args);
            return {};
          },
        },
      },
    });

    await fireDueTimers(ctx, fakeManager(['channel-1']));

    expect(updates).toHaveLength(0);
  });

  it('one timer failing to send never stops the others from being processed', async () => {
    sendChatMessage.mockRejectedValueOnce(new Error('network error')).mockResolvedValueOnce({ ok: true });
    const updates: unknown[] = [];
    const { ctx } = createTestContext({
      prismaOverrides: {
        twitchChatTimer: {
          findMany: async () => [
            makeTimer({ id: 'timer-1', lastFiredAt: null }),
            makeTimer({ id: 'timer-2', lastFiredAt: null, channel: { id: 'channel-1', broadcasterUserId: 'b-2', broadcasterLogin: 'other' } }),
          ],
          update: async (args: unknown) => {
            updates.push(args);
            return {};
          },
        },
      },
    });

    await fireDueTimers(ctx, fakeManager(['channel-1']));

    expect(sendChatMessage).toHaveBeenCalledTimes(2);
    expect(updates).toHaveLength(1); // only the second timer's send succeeded
  });
});
