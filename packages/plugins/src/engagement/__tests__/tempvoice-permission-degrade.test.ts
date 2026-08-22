import { describe, expect, it, vi } from 'vitest';
import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import type { Logger } from 'pino';
import type { VoiceState } from 'discord.js';
import { createTestContext } from '../../sdk/testing';
import { voiceStateUpdateHandler } from '../events/voice-state-update';
import { configSchema } from '../manifest';

const GUILD_ID = 'guild-1';
const HUB_ID = '222222222222222222';
const TEMP_CHANNEL_ID = '333333333333333333';
const OWNER_ID = 'owner-1';

// Discord.js's real behavior this whole suite exists to guard against: a permission overwrite can only grant a
// bit the bot itself holds in the guild. Requesting Manage Channels/Move Members/Mute Members/Deafen Members
// unconditionally (the pre-fix code) means the entire `channels.create` call is rejected (50013 Missing
// Permissions) on any guild where the bot is missing even one of them — temp voice does nothing, silently.
const FULL_BOT_PERMISSIONS = new PermissionsBitField([
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.MoveMembers,
  PermissionFlagsBits.MuteMembers,
  PermissionFlagsBits.DeafenMembers,
]);

// A bot that has the two permissions the manifest treats as load-bearing for "the owner controls their own
// channel" (Manage Channels, Move Members) but was never granted the two newer optional ones — the exact
// real-world case for a bot invited before Mute/Deafen were added to the invite link.
const PARTIAL_BOT_PERMISSIONS = new PermissionsBitField([
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.MoveMembers,
]);

function fakeLogger(): Logger {
  return { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } as unknown as Logger;
}

interface CreateCall {
  permissionOverwrites?: { id: string; allow: bigint[] }[];
}

function buildScenario(opts: {
  botPermissions: PermissionsBitField | null;
  createImpl?: (options: CreateCall) => Promise<{ id: string }>;
}) {
  const createCalls: CreateCall[] = [];
  const setChannel = vi.fn(async () => undefined);
  const member = {
    id: OWNER_ID,
    displayName: 'Ada',
    user: { username: 'ada', bot: false },
    voice: { setChannel },
  };

  const defaultCreate = async (options: CreateCall) => {
    createCalls.push(options);
    return { id: TEMP_CHANNEL_ID };
  };

  const guild = {
    id: GUILD_ID,
    members: {
      me: opts.botPermissions ? { permissions: opts.botPermissions } : null,
    },
    channels: {
      cache: new Map(),
      create: vi.fn(opts.createImpl ?? defaultCreate),
    },
  };

  const cfg = configSchema.parse({
    leveling: { enabled: false },
    tempVoice: { hubChannelIds: [HUB_ID] },
  });
  const logger = fakeLogger();
  const { ctx } = createTestContext({ config: cfg, overrides: { logger } });

  const oldState = { channelId: null, guild, id: OWNER_ID } as unknown as VoiceState;
  const newState = {
    channelId: HUB_ID,
    guild,
    id: OWNER_ID,
    member,
    channel: { id: HUB_ID, isVoiceBased: () => true, parentId: null },
  } as unknown as VoiceState;

  return { ctx, guild, createCalls, setChannel, oldState, newState, logger };
}

describe('temp voice channel creation — permission degradation', () => {
  it('grants the owner Mute/Deafen (plus Manage Channels, Move Members, Connect) when the bot holds them', async () => {
    const { ctx, createCalls, setChannel, oldState, newState } = buildScenario({
      botPermissions: FULL_BOT_PERMISSIONS,
    });

    await voiceStateUpdateHandler.handler(ctx, oldState, newState);

    expect(createCalls).toHaveLength(1);
    const overwrite = createCalls[0]?.permissionOverwrites?.[0];
    expect(overwrite?.id).toBe(OWNER_ID);
    expect(overwrite?.allow).toEqual(
      expect.arrayContaining([
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.MoveMembers,
        PermissionFlagsBits.MuteMembers,
        PermissionFlagsBits.DeafenMembers,
      ]),
    );
    expect(overwrite?.allow).toHaveLength(5);
    expect(setChannel).toHaveBeenCalledWith(TEMP_CHANNEL_ID);
  });

  it('excludes Mute/Deafen from the owner overwrite when the bot lacks them, and still creates the channel and moves the member in', async () => {
    const { ctx, createCalls, setChannel, oldState, newState } = buildScenario({
      botPermissions: PARTIAL_BOT_PERMISSIONS,
    });

    await voiceStateUpdateHandler.handler(ctx, oldState, newState);

    // The channel-create call must still happen — a missing *optional* ownership permission must never block
    // temp voice entirely, only degrade what the owner can do once inside their own channel.
    expect(createCalls).toHaveLength(1);
    const overwrite = createCalls[0]?.permissionOverwrites?.[0];
    expect(overwrite?.id).toBe(OWNER_ID);
    expect(overwrite?.allow).toEqual(
      expect.arrayContaining([
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.MoveMembers,
      ]),
    );
    expect(overwrite?.allow).not.toContain(PermissionFlagsBits.MuteMembers);
    expect(overwrite?.allow).not.toContain(PermissionFlagsBits.DeafenMembers);

    // And the owner still actually gets moved into their new channel — the degraded permission set didn't
    // regress the rest of the flow.
    expect(setChannel).toHaveBeenCalledWith(TEMP_CHANNEL_ID);
  });

  it('logs a specific warning and skips channel creation entirely when the bot is confirmed to lack Manage Channels', async () => {
    const { ctx, guild, createCalls, setChannel, oldState, newState, logger } = buildScenario({
      botPermissions: new PermissionsBitField([PermissionFlagsBits.MoveMembers]),
    });

    await voiceStateUpdateHandler.handler(ctx, oldState, newState);

    expect(createCalls).toHaveLength(0);
    expect(guild.channels.create).not.toHaveBeenCalled();
    expect(setChannel).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [, message] = (logger.warn as ReturnType<typeof vi.fn>).mock.calls[0] as [unknown, string];
    expect(message).toMatch(/Manage Channels/);
  });

  it('never throws out of the handler when channels.create rejects', async () => {
    const { ctx, oldState, newState, logger } = buildScenario({
      botPermissions: FULL_BOT_PERMISSIONS,
      createImpl: async () => {
        throw new Error('50013: Missing Permissions');
      },
    });

    await expect(voiceStateUpdateHandler.handler(ctx, oldState, newState)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });
});
