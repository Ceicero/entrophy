/** Formatting helpers shared across dashboard pages: dates, Discord snowflakes, and numbers. */

const DISCORD_EPOCH_MS = 1420070400000n;

/** Extracts the creation `Date` embedded in a Discord snowflake id. */
export function snowflakeToDate(snowflake: string): Date {
  const ms = (BigInt(snowflake) >> 22n) + DISCORD_EPOCH_MS;
  return new Date(Number(ms));
}

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const dateFormatter = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

/** Formats an ISO string or `Date` as `Jan 5, 2026, 3:04 PM` (localized). */
export function formatDateTime(input: string | Date): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return '—';
  return dateTimeFormatter.format(date);
}

/** Formats an ISO string or `Date` as `Jan 5, 2026` (localized). */
export function formatDate(input: string | Date): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return '—';
  return dateFormatter.format(date);
}

/** Formats an ISO string or `Date` as a short relative time, e.g. "3h ago", "in 2d". */
export function formatRelativeTime(input: string | Date, now: Date = new Date()): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return '—';
  const diffMs = date.getTime() - now.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1],
  ];
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, secondsInUnit] of units) {
    if (Math.abs(diffSec) >= secondsInUnit || unit === 'second') {
      return rtf.format(Math.round(diffSec / secondsInUnit), unit);
    }
  }
  return rtf.format(0, 'second');
}

const numberFormatter = new Intl.NumberFormat(undefined);
const compactNumberFormatter = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

/** Formats a count with locale thousands separators, e.g. `12,480`. */
export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

/** Formats a count compactly, e.g. `12.5K`. */
export function formatCompactNumber(value: number): string {
  return compactNumberFormatter.format(value);
}

/** Title-cases a `snake_case` or `kebab-case` string, e.g. `plugin.enable` → "Plugin Enable". */
export function humanizeAction(action: string): string {
  return action
    .split(/[._-]/)
    .map((part) => (part.length ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join(' ');
}
