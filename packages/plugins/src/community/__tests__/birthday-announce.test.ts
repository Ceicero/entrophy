import { ChannelType, type Guild } from 'discord.js';
import type { Queue } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '../../sdk/testing';
import { configSchema, type CommunityConfig } from '../manifest';
import { announceBirthdaysForGuild, birthdayAnnounceJob } from '../jobs/birthday-announce';
import { birthdayRoleRemoveJob } from '../jobs/birthday-role-remove';

const GUILD_ID = 'guild-1';
const USER_ID = 'user-1';
const CHANNEL_ID = 'chan-1';
const ROLE_ID = 'role-1';

// 2026-03-04 09:15 UTC — a Wednesday, not a leap year.
const NOW = new Date('2026-03-04T09:15:00Z');

function makeConfig(patch: Partial<CommunityConfig['birthdays']> = {}): CommunityConfig {
  return configSchema.parse({
    birthdays: { enabled: true, channelId: CHANNEL_ID, announceHour: 9, ...patch },
  });
}

interface FakeGuildOptions {
  memberPresent?: boolean;
}

/** Minimal discord.js Guild stand-in covering everything the birthday job touches. */
function makeFakeGuild(opts: FakeGuildOptions = {}) {
  const sent: unknown[] = [];
  const rolesAdded: string[] = [];
  const rolesRemoved: string[] = [];
  const memberRoleIds = new Set<string>();

  const role = { id: ROLE_ID, position: 1, managed: false, permissions: { bitfield: 0n } };
  const member = {
    id: USER_ID,
    displayName: 'Ada',
    roles: {
      cache: { has: (id: string) => memberRoleIds.has(id) },
      add: async (r: { id: string }) => {
        rolesAdded.push(r.id);
        memberRoleIds.add(r.id);
      },
      remove: async (id: string) => {
        rolesRemoved.push(id);
        memberRoleIds.delete(id);
      },
    },
  };
  const channel = {
    id: CHANNEL_ID,
    type: ChannelType.GuildText,
    isTextBased: () => true,
    permissionsFor: () => ({ has: () => true }),
    send: async (payload: unknown) => {
      sent.push(payload);
    },
  };
  const guild = {
    id: GUILD_ID,
    name: 'Test Guild',
    memberCount: 42,
    members: {
      me: { roles: { highest: { position: 10 } } },
      fetch: async (id: string) => {
        if (opts.memberPresent === false || id !== USER_ID) throw new Error('Unknown Member');
        return member;
      },
    },
    channels: { fetch: async () => channel },
    roles: { cache: new Map([[ROLE_ID, role]]), fetch: async () => role },
  };
  return { guild: guild as unknown as Guild, sent, rolesAdded, rolesRemoved, memberRoleIds };
}

interface Setup {
  birthdayRows?: {
    id: string;
    userId: string;
    month: number;
    day: number;
    lastAnnouncedYear: number | null;
  }[];
  guildOptions?: FakeGuildOptions;
}

function setup(input: Setup = {}) {
  const rows = input.birthdayRows ?? [
    { id: 'b1', userId: USER_ID, month: 3, day: 4, lastAnnouncedYear: null },
  ];
  const updates: unknown[] = [];
  const findManyArgs: unknown[] = [];
  const queued: { name: string; data: unknown; opts: unknown }[] = [];
  const fake = makeFakeGuild(input.guildOptions);

  const { ctx } = createTestContext({
    prismaOverrides: {
      birthday: {
        // Honour the `NOT lastAnnouncedYear` + month/day filters the job sends, like a real DB would.
        findMany: async (args: unknown) => {
          findManyArgs.push(args);
          const where = (
            args as { where: { NOT: { lastAnnouncedYear: number }; OR: { month: number; day: number }[] } }
          ).where;
          return rows.filter(
            (r) =>
              r.lastAnnouncedYear !== where.NOT.lastAnnouncedYear &&
              where.OR.some((md) => md.month === r.month && md.day === r.day),
          );
        },
        update: async (args: unknown) => {
          updates.push(args);
          const { where, data } = args as { where: { id: string }; data: { lastAnnouncedYear: number } };
          const row = rows.find((r) => r.id === where.id);
          if (row) row.lastAnnouncedYear = data.lastAnnouncedYear;
          return row;
        },
      },
    },
    overrides: {
      queue: () =>
        ({
          add: async (name: string, data: unknown, opts: unknown) => {
            queued.push({ name, data, opts });
          },
        }) as unknown as Queue,
    },
  });

  return { ctx, ...fake, updates, findManyArgs, queued, rows };
}

describe('announceBirthdaysForGuild', () => {
  it('announces a due birthday exactly once, mentions only that user, and stamps lastAnnouncedYear', async () => {
    const s = setup();
    const first = await announceBirthdaysForGuild(s.ctx, s.guild, makeConfig(), NOW);
    expect(first.announced).toBe(1);
    expect(s.sent).toHaveLength(1);
    expect(s.sent[0]).toMatchObject({
      content: `🎂 Happy birthday, <@${USER_ID}>!`,
      allowedMentions: { users: [USER_ID], parse: [] },
    });
    expect(s.updates[0]).toMatchObject({ where: { id: 'b1' }, data: { lastAnnouncedYear: 2026 } });
    expect(s.rows[0]!.lastAnnouncedYear).toBe(2026);

    // Same hour, later run (or a restart) — nothing due anymore this year.
    const second = await announceBirthdaysForGuild(s.ctx, s.guild, makeConfig(), NOW);
    expect(second.announced).toBe(0);
    expect(s.sent).toHaveLength(1);
    // The query itself excludes already-announced rows for the current year.
    expect(s.findManyArgs[0]).toMatchObject({ where: { NOT: { lastAnnouncedYear: 2026 } } });
  });

  it('skips when the guild-local hour does not match the configured hour', async () => {
    const s = setup();
    const result = await announceBirthdaysForGuild(s.ctx, s.guild, makeConfig({ announceHour: 10 }), NOW);
    expect(result).toMatchObject({ announced: 0, skippedReason: 'hour' });
    expect(s.sent).toHaveLength(0);
    expect(s.updates).toHaveLength(0);
  });

  it('uses the guild timezone from the host service for the local hour', async () => {
    const s = setup();
    s.ctx.services.register('host', {
      getGuildConfig: async () => ({ timezone: 'Asia/Tokyo' }),
    } as never);
    // 09:15 UTC is 18:15 in Tokyo → hour 9 doesn't match; hour 18 does.
    expect((await announceBirthdaysForGuild(s.ctx, s.guild, makeConfig(), NOW)).skippedReason).toBe('hour');
    expect(
      (await announceBirthdaysForGuild(s.ctx, s.guild, makeConfig({ announceHour: 18 }), NOW)).announced,
    ).toBe(1);
  });

  it('adds the role and enqueues a ~24h removal only when roleId is set', async () => {
    const without = setup();
    await announceBirthdaysForGuild(without.ctx, without.guild, makeConfig(), NOW);
    expect(without.rolesAdded).toEqual([]);
    expect(without.queued).toEqual([]);

    const withRole = setup();
    await announceBirthdaysForGuild(withRole.ctx, withRole.guild, makeConfig({ roleId: ROLE_ID }), NOW);
    expect(withRole.rolesAdded).toEqual([ROLE_ID]);
    expect(withRole.queued).toHaveLength(1);
    expect(withRole.queued[0]).toMatchObject({
      name: 'birthday-role-remove',
      data: { guildId: GUILD_ID, userId: USER_ID, roleId: ROLE_ID },
      opts: { delay: 86_400_000, jobId: `bday-role:${GUILD_ID}:${USER_ID}:2026`, removeOnComplete: true },
    });
  });

  it('skips (without deleting) a member who has left, and still announces on Feb 28 for Feb 29 birthdays', async () => {
    const gone = setup({ guildOptions: { memberPresent: false } });
    const r = await announceBirthdaysForGuild(gone.ctx, gone.guild, makeConfig(), NOW);
    expect(r.announced).toBe(0);
    expect(gone.updates).toHaveLength(0);
    expect(gone.rows[0]!.lastAnnouncedYear).toBeNull();

    const leap = setup({
      birthdayRows: [{ id: 'b29', userId: USER_ID, month: 2, day: 29, lastAnnouncedYear: null }],
    });
    const feb28 = new Date('2026-02-28T09:05:00Z'); // 2026 is not a leap year
    expect((await announceBirthdaysForGuild(leap.ctx, leap.guild, makeConfig(), feb28)).announced).toBe(1);
  });
});

describe('birthdayAnnounceJob processor', () => {
  it('iterates enabled guilds and never throws when one guild fails', async () => {
    const good = makeFakeGuild();
    const bad = {
      ...makeFakeGuild().guild,
      id: 'guild-bad',
      channels: {
        fetch: async () => {
          throw new Error('boom');
        },
      },
    } as unknown as Guild;
    const config = makeConfig();
    const { ctx } = createTestContext({
      config,
      prismaOverrides: {
        birthday: {
          findMany: async (args: unknown) => {
            const guildId = (args as { where: { guildId: string } }).where.guildId;
            return [
              { id: `b-${guildId}`, guildId, userId: USER_ID, month: 3, day: 4, lastAnnouncedYear: null },
            ];
          },
        },
      },
      overrides: {
        client: {
          guilds: {
            cache: new Map([
              ['guild-bad', bad],
              [GUILD_ID, good.guild],
            ]),
          },
        } as never,
      },
    });
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      await expect(birthdayAnnounceJob.processor(ctx, {} as never)).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
    // The bad guild's channel fetch throws inside resolveTextChannel (caught → null → skipped); the good one posts.
    expect(good.sent).toHaveLength(1);
  });

  it('is scheduled hourly on the community.birthday-announce queue', () => {
    expect(birthdayAnnounceJob.name).toBe('birthday-announce');
    expect(birthdayAnnounceJob.repeat).toEqual({ pattern: '0 * * * *' });
  });
});

describe('birthdayRoleRemoveJob', () => {
  it('removes the role only if the member still has it', async () => {
    const fake = makeFakeGuild();
    fake.memberRoleIds.add(ROLE_ID);
    const { ctx } = createTestContext({
      overrides: { client: { guilds: { cache: new Map([[GUILD_ID, fake.guild]]) } } as never },
    });
    await birthdayRoleRemoveJob.processor(ctx, {
      data: { guildId: GUILD_ID, userId: USER_ID, roleId: ROLE_ID },
    } as never);
    expect(fake.rolesRemoved).toEqual([ROLE_ID]);

    // Second run: role already gone → no-op.
    await birthdayRoleRemoveJob.processor(ctx, {
      data: { guildId: GUILD_ID, userId: USER_ID, roleId: ROLE_ID },
    } as never);
    expect(fake.rolesRemoved).toEqual([ROLE_ID]);
  });
});
