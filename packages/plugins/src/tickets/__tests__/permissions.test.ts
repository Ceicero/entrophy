import { PermissionFlagsBits } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { buildTicketChannelOverwrites } from '../permissions';

const EVERYONE = '000000000000000000';
const OPENER = '111111111111111111';
const BOT = '222222222222222222';

describe('buildTicketChannelOverwrites', () => {
  it('denies @everyone View Channel', () => {
    const overwrites = buildTicketChannelOverwrites({
      everyoneRoleId: EVERYONE,
      openerId: OPENER,
      supportRoleIds: [],
      botId: BOT,
    });
    const everyone = overwrites.find((o) => o.id === EVERYONE);
    expect(everyone?.deny).toContain(PermissionFlagsBits.ViewChannel);
    expect(everyone?.allow).toEqual([]);
  });

  it('allows the opener to view, send, read history, attach files, and embed links', () => {
    const overwrites = buildTicketChannelOverwrites({
      everyoneRoleId: EVERYONE,
      openerId: OPENER,
      supportRoleIds: [],
      botId: BOT,
    });
    const opener = overwrites.find((o) => o.id === OPENER);
    expect(opener?.allow).toEqual(
      expect.arrayContaining([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ]),
    );
    expect(opener?.deny).toEqual([]);
  });

  it('allows every configured support role the same access as the opener', () => {
    const supportRoleIds = ['333333333333333333', '444444444444444444'];
    const overwrites = buildTicketChannelOverwrites({
      everyoneRoleId: EVERYONE,
      openerId: OPENER,
      supportRoleIds,
      botId: BOT,
    });
    for (const roleId of supportRoleIds) {
      const overwrite = overwrites.find((o) => o.id === roleId);
      expect(overwrite?.allow).toContain(PermissionFlagsBits.ViewChannel);
      expect(overwrite?.allow).toContain(PermissionFlagsBits.SendMessages);
    }
  });

  it('gives the bot Manage Messages and Manage Channels in addition to the opener grants', () => {
    const overwrites = buildTicketChannelOverwrites({
      everyoneRoleId: EVERYONE,
      openerId: OPENER,
      supportRoleIds: [],
      botId: BOT,
    });
    const bot = overwrites.find((o) => o.id === BOT);
    expect(bot?.allow).toEqual(
      expect.arrayContaining([
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ViewChannel,
      ]),
    );
  });

  it('never produces a duplicate overwrite id when a support role collides with the opener or bot id', () => {
    const overwrites = buildTicketChannelOverwrites({
      everyoneRoleId: EVERYONE,
      openerId: OPENER,
      supportRoleIds: [OPENER, BOT, '555555555555555555'],
      botId: BOT,
    });
    const ids = overwrites.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(overwrites).toHaveLength(4); // everyone, opener, bot, and the one genuinely-new support role
  });

  it('deduplicates repeated support role ids', () => {
    const overwrites = buildTicketChannelOverwrites({
      everyoneRoleId: EVERYONE,
      openerId: OPENER,
      supportRoleIds: ['666666666666666666', '666666666666666666'],
      botId: BOT,
    });
    expect(overwrites.filter((o) => o.id === '666666666666666666')).toHaveLength(1);
  });
});
