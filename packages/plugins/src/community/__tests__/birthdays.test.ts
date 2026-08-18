import { describe, expect, it } from 'vitest';
import {
  findUnknownMessageTokens,
  formatBirthday,
  isBirthdayToday,
  localNow,
  parseBirthday,
  renderBirthdayMessage,
  upcomingSorted,
} from '../birthdays';

describe('parseBirthday', () => {
  it('accepts a normal date', () => {
    expect(parseBirthday({ month: 3, day: 4 })).toEqual({ ok: true, month: 3, day: 4 });
  });

  it('accepts Feb 29', () => {
    expect(parseBirthday({ month: 2, day: 29 })).toEqual({ ok: true, month: 2, day: 29 });
  });

  it('rejects Feb 30 and Apr 31 as bad days', () => {
    expect(parseBirthday({ month: 2, day: 30 })).toEqual({ ok: false, reason: 'day' });
    expect(parseBirthday({ month: 4, day: 31 })).toEqual({ ok: false, reason: 'day' });
    expect(parseBirthday({ month: 1, day: 0 })).toEqual({ ok: false, reason: 'day' });
  });

  it('rejects out-of-range or non-integer months', () => {
    expect(parseBirthday({ month: 0, day: 1 })).toEqual({ ok: false, reason: 'month' });
    expect(parseBirthday({ month: 13, day: 1 })).toEqual({ ok: false, reason: 'month' });
    expect(parseBirthday({ month: 1.5, day: 1 })).toEqual({ ok: false, reason: 'month' });
  });
});

describe('isBirthdayToday', () => {
  it('matches the same month/day', () => {
    expect(isBirthdayToday({ month: 3, day: 4 }, { month: 3, day: 4, isLeapYear: false })).toBe(true);
    expect(isBirthdayToday({ month: 3, day: 4 }, { month: 3, day: 5, isLeapYear: false })).toBe(false);
  });

  it('celebrates Feb 29 on Feb 28 in a non-leap year, and on Feb 29 in a leap year', () => {
    expect(isBirthdayToday({ month: 2, day: 29 }, { month: 2, day: 28, isLeapYear: false })).toBe(true);
    expect(isBirthdayToday({ month: 2, day: 29 }, { month: 2, day: 29, isLeapYear: true })).toBe(true);
    expect(isBirthdayToday({ month: 2, day: 29 }, { month: 2, day: 28, isLeapYear: true })).toBe(false);
    // A real Feb 28 birthday is unaffected either way.
    expect(isBirthdayToday({ month: 2, day: 28 }, { month: 2, day: 28, isLeapYear: true })).toBe(true);
  });
});

describe('upcomingSorted', () => {
  it('orders by days until the birthday, wrapping around the year end', () => {
    const list = [
      { userId: 'jan', month: 1, day: 2 },
      { userId: 'dec', month: 12, day: 30 },
      { userId: 'today', month: 12, day: 28 },
      { userId: 'june', month: 6, day: 1 },
    ];
    const out = upcomingSorted(list, { month: 12, day: 28 });
    expect(out.map((b) => b.userId)).toEqual(['today', 'dec', 'jan', 'june']);
    expect(out[0]!.inDays).toBe(0);
    expect(out[1]!.inDays).toBe(2);
    // Dec 28 → Jan 2 is 5 days on the fixed 366-day calendar used for ordering.
    expect(out[2]!.inDays).toBe(5);
  });

  it('respects the limit', () => {
    const list = Array.from({ length: 20 }, (_, i) => ({ userId: `u${i}`, month: 1, day: i + 1 }));
    expect(upcomingSorted(list, { month: 1, day: 1 }, 15)).toHaveLength(15);
    expect(upcomingSorted(list, { month: 1, day: 1 }, 3)).toHaveLength(3);
  });
});

describe('localNow', () => {
  // 2026-03-04T23:30:00Z: still Mar 4 in UTC, already Mar 5 in Tokyo, Mar 4 15:30 in Los Angeles.
  const instant = new Date('2026-03-04T23:30:00Z');

  it('reports the wall-clock date/hour in the requested zone', () => {
    expect(localNow('Asia/Tokyo', instant)).toEqual({
      year: 2026,
      month: 3,
      day: 5,
      hour: 8,
      isLeapYear: false,
    });
    expect(localNow('America/Los_Angeles', instant)).toEqual({
      year: 2026,
      month: 3,
      day: 4,
      hour: 15,
      isLeapYear: false,
    });
  });

  it('flags leap years and falls back to UTC for an invalid zone', () => {
    expect(localNow('UTC', new Date('2028-02-29T09:00:00Z'))).toMatchObject({
      month: 2,
      day: 29,
      hour: 9,
      isLeapYear: true,
    });
    expect(localNow('Not/AZone', instant)).toMatchObject({ month: 3, day: 4, hour: 23 });
  });
});

describe('renderBirthdayMessage', () => {
  it('fills the supported tokens and leaves unknown ones literal', () => {
    const out = renderBirthdayMessage('🎂 {mention} ({user}) turns {age} on {server}!', {
      mention: '<@1>',
      user: 'Ada',
      server: 'Lovelace Lounge',
    });
    expect(out).toBe('🎂 <@1> (Ada) turns {age} on Lovelace Lounge!');
  });
});

describe('findUnknownMessageTokens / formatBirthday', () => {
  it('lists unsupported tokens once each', () => {
    expect(findUnknownMessageTokens('{mention} {user} {server}')).toEqual([]);
    expect(findUnknownMessageTokens('{age} {age} {mention} {user.id}')).toEqual(['age', 'user.id']);
  });

  it('formats without any year', () => {
    expect(formatBirthday({ month: 3, day: 4 })).toBe('4 March');
    expect(formatBirthday({ month: 12, day: 25 })).toBe('25 December');
  });
});
