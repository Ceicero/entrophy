// Date/time text parsing for `/utility timestamp` and IANA timezone validation for `/utility timezone`.
import { DateTime } from 'luxon';

export class TimestampParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimestampParseError';
  }
}

const DEFAULT_ZONE = 'UTC';

/** Every IANA timezone name the current Node runtime knows about (used for validation and autocomplete). */
export function listIanaTimezones(): string[] {
  return Intl.supportedValuesOf('timeZone');
}

const ZONE_SET = new Set(listIanaTimezones());

/** True if `zone` is a recognized IANA timezone identifier (e.g. `America/New_York`, `Europe/Berlin`, `UTC`). */
export function isValidIanaTimezone(zone: string): boolean {
  if (zone === 'UTC') return true;
  return ZONE_SET.has(zone);
}

// Explicit formats tried (in order) against luxon's strict `fromFormat`, each combined with the target zone.
// Ordered from most to least specific so an unambiguous match wins before a looser one is attempted.
const DATE_TIME_FORMATS = [
  'yyyy-MM-dd HH:mm:ss',
  'yyyy-MM-dd HH:mm',
  "yyyy-MM-dd'T'HH:mm:ss",
  "yyyy-MM-dd'T'HH:mm",
  'yyyy/MM/dd HH:mm:ss',
  'yyyy/MM/dd HH:mm',
  'MM/dd/yyyy HH:mm:ss',
  'MM/dd/yyyy HH:mm',
  'MM/dd/yyyy h:mm a',
  'M/d/yyyy h:mm a',
  'MMMM d, yyyy h:mm a',
  'MMMM d yyyy h:mm a',
  'MMM d, yyyy h:mm a',
  'd MMMM yyyy HH:mm',
];

const DATE_ONLY_FORMATS = ['yyyy-MM-dd', 'yyyy/MM/dd', 'MM/dd/yyyy', 'M/d/yyyy', 'MMMM d, yyyy', 'MMMM d yyyy', 'MMM d, yyyy', 'd MMMM yyyy'];

const TIME_ONLY_FORMATS = ['HH:mm:ss', 'HH:mm', 'h:mm a', 'h a', 'ha'];

function tryFormats(text: string, formats: string[], zone: string): DateTime | null {
  for (const format of formats) {
    const parsed = DateTime.fromFormat(text, format, { zone });
    if (parsed.isValid) return parsed;
  }
  return null;
}

/**
 * Parses free-form date/time text into a `DateTime` in `zone` (default `UTC`). Tries, in order: ISO 8601,
 * RFC 2822, a curated list of common explicit date+time / date-only / time-only formats (date-only implies
 * midnight; time-only implies today's date in `zone`), and finally the platform's native `Date.parse` as a
 * last resort (its interpretation of a bare timezone offset, if any, always wins over `zone`). Throws
 * `TimestampParseError` with a user-facing message listing example formats if nothing matches.
 */
export function parseTimestampInput(rawInput: string, zone = DEFAULT_ZONE): DateTime {
  const text = rawInput.trim();
  if (text.length === 0) {
    throw new TimestampParseError('Please provide a date/time to parse.');
  }
  if (!isValidIanaTimezone(zone)) {
    throw new TimestampParseError(`"${zone}" is not a recognized IANA timezone (e.g. "America/New_York", "Europe/London", "UTC").`);
  }

  const iso = DateTime.fromISO(text, { zone });
  if (iso.isValid) return iso;

  const rfc2822 = DateTime.fromRFC2822(text, { zone });
  if (rfc2822.isValid) return rfc2822;

  const dateTime = tryFormats(text, DATE_TIME_FORMATS, zone);
  if (dateTime) return dateTime;

  const dateOnly = tryFormats(text, DATE_ONLY_FORMATS, zone);
  if (dateOnly) return dateOnly;

  const timeOnly = tryFormats(text, TIME_ONLY_FORMATS, zone);
  if (timeOnly) {
    const now = DateTime.now().setZone(zone);
    return now.set({ hour: timeOnly.hour, minute: timeOnly.minute, second: timeOnly.second, millisecond: 0 });
  }

  const nativeMs = Date.parse(text);
  if (!Number.isNaN(nativeMs)) {
    return DateTime.fromMillis(nativeMs, { zone });
  }

  throw new TimestampParseError(
    `Could not parse "${rawInput}" as a date/time. Try something like "2027-03-05 15:00", "March 5 2027 3:00 PM", or "15:00".`,
  );
}
