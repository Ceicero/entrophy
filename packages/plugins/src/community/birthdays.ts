// Pure, discord.js/Prisma-free birthday logic for the community plugin (spec CG-06). Everything here is unit
// tested directly (`__tests__/birthdays.test.ts`); the job/command files only glue these onto Discord + Prisma.
//
// Privacy by construction: nothing in this module ever takes or produces a birth year or age — the data model
// is month + day only.
import { DateTime } from 'luxon';
import { renderTemplate } from '../roles/engine';

export interface MonthDay {
  month: number;
  day: number;
}

export type ParseBirthdayResult =
  { ok: true; month: number; day: number } | { ok: false; reason: 'month' | 'day' };

/** Days per month, indexed by month number (1..12). February is 29 so Feb 29 is a valid birthday. */
const DAYS_IN_MONTH: readonly number[] = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const MONTH_NAMES: readonly string[] = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MONTH_ABBREVIATIONS: readonly string[] = MONTH_NAMES.map((name) => name.slice(0, 3));

/** Validates a month/day pair (Feb 29 allowed; Feb 30 / Apr 31 rejected). */
export function parseBirthday(input: { month: number; day: number }): ParseBirthdayResult {
  const { month, day } = input;
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { ok: false, reason: 'month' };
  }
  if (!Number.isInteger(day) || day < 1 || day > DAYS_IN_MONTH[month]!) {
    return { ok: false, reason: 'day' };
  }
  return { ok: true, month, day };
}

/**
 * True if `b` falls on the given guild-local date. Feb 29 birthdays are celebrated on Feb 28 in non-leap years
 * (and on Feb 29 itself in leap years).
 */
export function isBirthdayToday(
  b: MonthDay,
  localDate: { month: number; day: number; isLeapYear: boolean },
): boolean {
  if (b.month === 2 && b.day === 29 && !localDate.isLeapYear) {
    return localDate.month === 2 && localDate.day === 28;
  }
  return b.month === localDate.month && b.day === localDate.day;
}

/** Day-of-year on a fixed 366-day calendar (Feb 29 always counts) — good enough for ordering/"in N days". */
function dayOfYear366(md: MonthDay): number {
  let n = 0;
  for (let m = 1; m < md.month; m += 1) n += DAYS_IN_MONTH[m]!;
  return n + md.day;
}

export interface UpcomingBirthday extends MonthDay {
  userId: string;
  /** Days from `today` until this birthday (0 = today; wraps around the year end). */
  inDays: number;
}

/**
 * Sorts birthdays by how soon they occur relative to `today` (today first, then tomorrow, ... wrapping past
 * December into January) and returns the first `limit`. Ties keep input order (stable sort).
 */
export function upcomingSorted(
  list: { userId: string; month: number; day: number }[],
  today: MonthDay,
  limit = 15,
): UpcomingBirthday[] {
  const todayIndex = dayOfYear366(today);
  const withDistance = list.map((b) => {
    let inDays = dayOfYear366(b) - todayIndex;
    if (inDays < 0) inDays += 366;
    return { userId: b.userId, month: b.month, day: b.day, inDays };
  });
  withDistance.sort((a, b) => a.inDays - b.inDays);
  return withDistance.slice(0, Math.max(0, limit));
}

export interface LocalNow {
  year: number;
  month: number;
  day: number;
  hour: number;
  isLeapYear: boolean;
}

/** The current wall-clock date/hour in IANA zone `tz` (falls back to UTC if `tz` is invalid). */
export function localNow(tz: string, now: Date = new Date()): LocalNow {
  let dt = DateTime.fromJSDate(now, { zone: tz });
  if (!dt.isValid) dt = DateTime.fromJSDate(now, { zone: 'UTC' });
  return { year: dt.year, month: dt.month, day: dt.day, hour: dt.hour, isLeapYear: dt.isInLeapYear };
}

/**
 * Renders the announcement template. Supported tokens: `{mention}`, `{user}`, `{server}` (plus the shared
 * `{user.tag}`/`{user.id}`/`{memberCount}` from the roles template engine so admins get consistent behaviour);
 * unknown tokens are left literal.
 */
export function renderBirthdayMessage(
  template: string,
  vars: { mention: string; user: string; server: string; userId?: string; memberCount?: number },
): string {
  return renderTemplate(template, {
    mention: vars.mention,
    user: vars.user,
    'user.tag': vars.user,
    'user.id': vars.userId ?? '',
    server: vars.server,
    memberCount: vars.memberCount ?? '',
  });
}

/** Tokens `/birthday config message:` and the dashboard accept; anything else `{like.this}` is rejected. */
export const BIRTHDAY_MESSAGE_TOKENS: readonly string[] = ['mention', 'user', 'server'];

/** Returns the unknown `{token}` names in `template` (empty when every token is supported). */
export function findUnknownMessageTokens(template: string): string[] {
  const unknown = new Set<string>();
  for (const match of template.matchAll(/\{([a-zA-Z._]+)\}/g)) {
    const token = match[1]!;
    if (!BIRTHDAY_MESSAGE_TOKENS.includes(token)) unknown.add(token);
  }
  return [...unknown];
}

/** "4 March" — never includes a year (there is none). */
export function formatBirthday(md: MonthDay): string {
  return `${md.day} ${MONTH_NAMES[md.month - 1] ?? '?'}`;
}

/** "Mar 4" — short form for lists. */
export function formatBirthdayShort(md: MonthDay): string {
  return `${MONTH_ABBREVIATIONS[md.month - 1] ?? '?'} ${md.day}`;
}

/** BullMQ job id for the delayed role removal — one per member per year so re-runs can't double-enqueue. */
export function birthdayRoleRemoveJobId(guildId: string, userId: string, year: number): string {
  return `bday-role:${guildId}:${userId}:${year}`;
}

/** ~24 hours, the lifetime of the optional birthday role. */
export const BIRTHDAY_ROLE_DURATION_MS = 86_400_000;
