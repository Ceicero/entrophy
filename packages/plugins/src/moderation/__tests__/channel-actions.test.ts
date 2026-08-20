import { describe, expect, it } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';
import type { PluginContext } from '../../sdk';
import { createTestContext } from '../../sdk/testing';
import { ModerationServiceImpl } from '../service';
import { BOT_ID, CHANNEL_ID, EVERYONE_ROLE_ID, GUILD_ID, createCasePrisma, createFakeGuild } from './fakes';

const MODERATOR_ID = '555555555555555555';
const SEND_BITS = PermissionFlagsBits.SendMessages | PermissionFlagsBits.SendMessagesInThreads;

function buildService() {
  const { guild, channel } = createFakeGuild();
  const { prisma } = createCasePrisma();
  const client = {
    guilds: { fetch: async () => guild, cache: new Map([[GUILD_ID, guild]]) },
    users: { fetch: async () => null },
  } as unknown as PluginContext['client'];

  const { ctx } = createTestContext({ config: {}, overrides: { prisma, client } });
  return { service: new ModerationServiceImpl(ctx), channel };
}

const action = { guildId: GUILD_ID, channelId: CHANNEL_ID, moderatorId: MODERATOR_ID, source: 'BOT' } as const;

describe('lock / unlock', () => {
  it('denies @everyone but leaves the bot itself able to send', async () => {
    const { service, channel } = buildService();

    await service.lock({ ...action, reason: 'audit' });

    expect(channel.overwrites.get(EVERYONE_ROLE_ID)?.deny).toBe(SEND_BITS);
    // Discord applies the @everyone deny to the bot too; without its own allow it can no longer act here.
    expect(channel.botCanSend()).toBe(true);
  });

  it('unlocks a channel it locked itself', async () => {
    const { service, channel } = buildService();

    await service.lock({ ...action, reason: 'audit' });
    await service.unlock({ ...action, reason: 'audit' });

    expect(channel.overwrites.get(EVERYONE_ROLE_ID)?.deny).toBe(0n);
    expect(channel.botCanSend()).toBe(true);
    // The allow lock() took for itself is exactly what it wrote, so unlock hands it back.
    expect(channel.overwrites.has(BOT_ID)).toBe(false);
  });

  it('unlocks a channel that was locked by hand (no bot overwrite to fall back on)', async () => {
    const { service, channel } = buildService();
    channel.seedOverwrite(EVERYONE_ROLE_ID, { deny: SEND_BITS });

    await service.unlock({ ...action, reason: 'unlock by hand' });

    expect(channel.overwrites.get(EVERYONE_ROLE_ID)?.deny).toBe(0n);
  });

  it('leaves a pre-existing bot overwrite alone when unlocking', async () => {
    const { service, channel } = buildService();
    // hub-setup grants the bot View + Send + Embed in its own channels — richer than what lock() writes.
    channel.seedOverwrite(BOT_ID, {
      allow:
        PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages | PermissionFlagsBits.EmbedLinks,
    });

    await service.lock({ ...action });
    await service.unlock({ ...action });

    const botOverwrite = channel.overwrites.get(BOT_ID);
    expect(botOverwrite?.allow).toBe(
      PermissionFlagsBits.ViewChannel |
        PermissionFlagsBits.SendMessages |
        PermissionFlagsBits.EmbedLinks |
        PermissionFlagsBits.SendMessagesInThreads,
    );
  });

  it('rejects a channel the bot cannot manage', async () => {
    const { service, channel } = buildService();
    channel.seedOverwrite(EVERYONE_ROLE_ID, { deny: PermissionFlagsBits.ManageRoles });

    await expect(service.lock({ ...action })).rejects.toThrow(/cannot be locked/);
  });
});

describe('slowmode', () => {
  it('sets and clears slowmode, including on a locked channel', async () => {
    const { service, channel } = buildService();

    await service.slowmode({ ...action, seconds: 5 });
    expect(channel.rateLimitPerUser).toBe(5);

    await service.lock({ ...action });
    await service.slowmode({ ...action, seconds: 0 });
    expect(channel.rateLimitPerUser).toBe(0);
  });
});
