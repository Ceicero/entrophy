import { describe, expect, it } from 'vitest';
import type { Guild } from 'discord.js';
import {
  checkTemplateTokens,
  collectCounts,
  nextRefreshAllowedAt,
  RENAME_BUDGET_MS,
  renderStatsName,
  type GuildCounts,
} from '../stats-channels';

const COUNTS: GuildCounts = {
  members: 1234,
  humans: 1200,
  bots: 34,
  boosts: 7,
  roles: 12,
  channels: 40,
  date: '2026-08-18',
};

/** Minimal fake `Guild` with a member cache of `humans` humans + `bots` bots (discord.js Collections are Maps with `.filter`). */
function fakeGuild(opts: {
  members?: number;
  humans: number;
  bots: number;
  boosts?: number | null;
  roles?: number;
  channels?: number;
}): Guild {
  const memberEntries: [string, { user: { bot: boolean } }][] = [];
  for (let i = 0; i < opts.humans; i++) memberEntries.push([`h${i}`, { user: { bot: false } }]);
  for (let i = 0; i < opts.bots; i++) memberEntries.push([`b${i}`, { user: { bot: true } }]);
  const memberCache = new Map(memberEntries);
  const cache = {
    filter: (fn: (m: { user: { bot: boolean } }) => boolean) => ({
      size: [...memberCache.values()].filter(fn).length,
    }),
    size: memberCache.size,
  };
  return {
    id: 'g1',
    memberCount: opts.members ?? opts.humans + opts.bots,
    members: { cache },
    premiumSubscriptionCount: opts.boosts === undefined ? 3 : opts.boosts,
    roles: { cache: { size: (opts.roles ?? 5) + 1 } }, // +1 for @everyone
    channels: { cache: { size: opts.channels ?? 20 } },
  } as unknown as Guild;
}

describe('renderStatsName', () => {
  it('substitutes every known token', () => {
    expect(
      renderStatsName('M {members} H {humans} B {bots} S {boosts} R {roles} C {channels} D {date}', COUNTS),
    ).toBe('M 1234 H 1200 B 34 S 7 R 12 C 40 D 2026-08-18');
  });

  it('leaves unknown tokens literal', () => {
    expect(renderStatsName('Online: {online} / {memebrs}', COUNTS)).toBe('Online: {online} / {memebrs}');
  });

  it('truncates to 100 characters', () => {
    const long = 'x'.repeat(95) + ' {members}';
    const out = renderStatsName(long, COUNTS);
    expect(out).toHaveLength(100);
    expect(out.startsWith('x'.repeat(95))).toBe(true);
  });
});

describe('checkTemplateTokens', () => {
  it('accepts a template made only of known tokens', () => {
    expect(checkTemplateTokens('Members: {members} · Bots: {bots}')).toEqual({
      ok: true,
      unknown: [],
      wantsOnline: false,
    });
  });

  it('flags unknown tokens (deduplicated, in order)', () => {
    const check = checkTemplateTokens('{memebrs} {foo} {memebrs} {members}');
    expect(check.ok).toBe(false);
    expect(check.unknown).toEqual(['memebrs', 'foo']);
    expect(check.wantsOnline).toBe(false);
  });

  it('flags {online} specifically', () => {
    const check = checkTemplateTokens('Online: {online}');
    expect(check.ok).toBe(false);
    expect(check.wantsOnline).toBe(true);
    expect(check.unknown).toEqual([]);
  });
});

describe('nextRefreshAllowedAt', () => {
  it('returns now when there was no previous refresh', () => {
    const now = new Date('2026-08-18T12:00:00Z');
    expect(nextRefreshAllowedAt(null, now).getTime()).toBe(now.getTime());
  });

  it('returns last + 5 minutes otherwise', () => {
    const last = new Date('2026-08-18T12:00:00Z');
    expect(nextRefreshAllowedAt(last, new Date('2026-08-18T12:01:00Z')).getTime()).toBe(
      last.getTime() + RENAME_BUDGET_MS,
    );
    expect(RENAME_BUDGET_MS).toBe(5 * 60_000);
  });
});

describe('collectCounts', () => {
  const now = new Date('2026-08-18T23:30:00Z');

  it('splits humans/bots from the member cache when the GuildMembers intent is on', () => {
    const counts = collectCounts(
      fakeGuild({ humans: 10, bots: 3, boosts: 2, roles: 4, channels: 9 }),
      'UTC',
      {
        guildMembersIntent: true,
        now,
      },
    );
    expect(counts).toEqual({
      members: 13,
      humans: 10,
      bots: 3,
      boosts: 2,
      roles: 4,
      channels: 9,
      date: '2026-08-18',
    });
  });

  it('falls back to humans = members / bots = 0 without the intent', () => {
    const counts = collectCounts(fakeGuild({ humans: 10, bots: 3 }), 'UTC', {
      guildMembersIntent: false,
      now,
    });
    expect(counts.members).toBe(13);
    expect(counts.humans).toBe(13);
    expect(counts.bots).toBe(0);
  });

  it('renders {date} in the guild timezone and treats a null boost count as 0', () => {
    const counts = collectCounts(fakeGuild({ humans: 1, bots: 0, boosts: null }), 'Pacific/Auckland', {
      guildMembersIntent: true,
      now,
    });
    expect(counts.date).toBe('2026-08-19'); // 23:30Z is already the next day in NZ
    expect(counts.boosts).toBe(0);
  });

  it('uses memberCount for members even when the cache is partial', () => {
    const counts = collectCounts(fakeGuild({ members: 500, humans: 4, bots: 1 }), 'UTC', {
      guildMembersIntent: true,
      now,
    });
    expect(counts.members).toBe(500);
    expect(counts.bots).toBe(1);
    expect(counts.humans).toBe(499);
  });
});
