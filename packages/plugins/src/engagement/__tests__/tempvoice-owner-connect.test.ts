import { describe, expect, it, vi } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';
import type { ChatInputCommandInteraction, EmbedBuilder, VoiceState } from 'discord.js';
import { createTestContext } from '../../sdk/testing';
import type { CommandContext } from '../../sdk';
import { command as tempVoiceCommand } from '../commands/tempvoice';
import { voiceStateUpdateHandler } from '../events/voice-state-update';
import { configSchema } from '../manifest';

const GUILD_ID = 'guild-1';
const HUB_ID = '222222222222222222';
const TEMP_CHANNEL_ID = '333333333333333333';
const OWNER_ID = 'owner-1';
const EVERYONE_ROLE = { id: GUILD_ID };

interface OverwriteEdit {
  target: unknown;
  permissions: Record<string, boolean | null>;
}

function buildLockContext(sub: 'lock' | 'claim') {
  const edits: OverwriteEdit[] = [];
  const replies: { embeds?: EmbedBuilder[] }[] = [];

  const channel = {
    id: TEMP_CHANNEL_ID,
    isVoiceBased: () => true,
    members: new Map([[OWNER_ID, { id: OWNER_ID }]]),
    permissionOverwrites: {
      edit: vi.fn(async (target: unknown, permissions: Record<string, boolean | null>) => {
        edits.push({ target, permissions });
      }),
    },
  };

  const interaction = {
    user: { id: OWNER_ID },
    member: { voice: { channelId: TEMP_CHANNEL_ID } },
    guild: {
      id: GUILD_ID,
      roles: { everyone: EVERYONE_ROLE },
      channels: { cache: new Map([[TEMP_CHANNEL_ID, channel]]) },
    },
    options: {
      getSubcommand: () => sub,
      getSubcommandGroup: () => null,
      getString: () => null,
      getChannel: () => null,
      getUser: () => null,
      getInteger: () => null,
      getRole: () => null,
    },
    reply: vi.fn(async (payload: { embeds?: EmbedBuilder[] }) => {
      replies.push(payload);
    }),
  };

  const cfg = configSchema.parse({});
  const { ctx } = createTestContext({
    config: cfg,
    prismaOverrides: {
      tempVoiceChannel: {
        findUnique: async () => ({
          id: 'row-1',
          guildId: GUILD_ID,
          channelId: TEMP_CHANNEL_ID,
          ownerId: OWNER_ID,
          hubChannelId: HUB_ID,
        }),
        update: async () => undefined,
      },
    },
  });

  const c: CommandContext = {
    interaction: interaction as unknown as ChatInputCommandInteraction<'cached'>,
    ctx,
    guildId: GUILD_ID,
    staffLevel: 'member',
    locale: 'en-US' as never,
    t: (key: string) => key,
    config: async <T>() => cfg as T,
  };

  return { c, edits, replies };
}

describe('/tempvoice lock', () => {
  // Only Administrator bypasses a channel Connect denial — ManageChannels does not — so denying Connect to
  // @everyone without granting it to the owner locks the owner out of their own channel.
  it('grants the owner Connect before denying it to @everyone', async () => {
    const { c, edits } = buildLockContext('lock');
    await tempVoiceCommand.execute(c);

    expect(edits).toEqual([
      { target: OWNER_ID, permissions: { Connect: true } },
      { target: EVERYONE_ROLE, permissions: { Connect: false } },
    ]);
  });
});

describe('/tempvoice claim', () => {
  it('gives the new owner Connect along with the management permissions', async () => {
    const { c, edits } = buildLockContext('claim');
    await tempVoiceCommand.execute(c);

    expect(edits).toHaveLength(1);
    expect(edits[0]?.permissions).toMatchObject({ Connect: true, ManageChannels: true });
  });
});

describe('temp voice channel creation', () => {
  it('grants the creator Connect so a later /tempvoice lock cannot exclude them', async () => {
    const createCalls: { permissionOverwrites?: { id: string; allow: bigint[] }[] }[] = [];
    const member = {
      id: OWNER_ID,
      displayName: 'Ada',
      user: { username: 'ada', bot: false },
      voice: { setChannel: vi.fn(async () => undefined) },
    };
    const guild = {
      id: GUILD_ID,
      channels: {
        cache: new Map(),
        create: vi.fn(async (options: { permissionOverwrites?: { id: string; allow: bigint[] }[] }) => {
          createCalls.push(options);
          return { id: TEMP_CHANNEL_ID };
        }),
      },
    };

    const cfg = configSchema.parse({
      leveling: { enabled: false },
      tempVoice: { hubChannelIds: [HUB_ID] },
    });
    const { ctx } = createTestContext({ config: cfg });

    const oldState = { channelId: null, guild, id: OWNER_ID } as unknown as VoiceState;
    const newState = {
      channelId: HUB_ID,
      guild,
      id: OWNER_ID,
      member,
      channel: { id: HUB_ID, isVoiceBased: () => true, parentId: null },
    } as unknown as VoiceState;

    await voiceStateUpdateHandler.handler(ctx, oldState, newState);

    const overwrite = createCalls[0]?.permissionOverwrites?.[0];
    expect(overwrite?.id).toBe(OWNER_ID);
    expect(overwrite?.allow).toContain(PermissionFlagsBits.Connect);
  });
});
