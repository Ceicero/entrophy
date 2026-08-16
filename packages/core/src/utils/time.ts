const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

const FULL_DURATION_PATTERN = /^(\d+(s|m|h|d|w))+$/i;
const DURATION_PART_PATTERN = /(\d+)(s|m|h|d|w)/gi;

/**
 * Parses a duration string like `'30s'`, `'10m'`, `'2h'`, `'3d'`, `'1w'`, or a combo like `'1h30m'` into
 * milliseconds. Returns `null` for anything that isn't purely a sequence of `<number><unit>` segments.
 */
export function parseDuration(input: string): number | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length === 0 || !FULL_DURATION_PATTERN.test(trimmed)) return null;

  let totalMs = 0;
  DURATION_PART_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DURATION_PART_PATTERN.exec(trimmed)) !== null) {
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    totalMs += value * UNIT_MS[unit];
  }
  return totalMs;
}

const FORMAT_UNITS: [string, number][] = [
  ['w', UNIT_MS.w],
  ['d', UNIT_MS.d],
  ['h', UNIT_MS.h],
  ['m', UNIT_MS.m],
  ['s', UNIT_MS.s],
];

/** Formats a millisecond duration as a compact human string like `'1h 30m'` (top two non-zero units). */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0s';

  const parts: string[] = [];
  let remaining = Math.floor(ms);
  for (const [unit, unitMs] of FORMAT_UNITS) {
    const value = Math.floor(remaining / unitMs);
    if (value > 0) {
      parts.push(`${value}${unit}`);
      remaining -= value * unitMs;
    }
    if (parts.length === 2) break;
  }
  return parts.length > 0 ? parts.join(' ') : '0s';
}

export type DiscordTimestampStyle = 't' | 'T' | 'd' | 'D' | 'f' | 'F' | 'R';

/** Formats a Date or epoch-ms value as a Discord timestamp markdown tag: `<t:unix:style>`. */
export function discordTimestamp(date: Date | number, style: DiscordTimestampStyle = 'f'): string {
  const ms = date instanceof Date ? date.getTime() : date;
  const unixSeconds = Math.floor(ms / 1000);
  return `<t:${unixSeconds}:${style}>`;
}
