import { describe, expect, it } from 'vitest';
import { isValidIanaTimezone, listIanaTimezones, parseTimestampInput, TimestampParseError } from '../timestamp';

describe('listIanaTimezones / isValidIanaTimezone', () => {
  it('lists a non-trivial number of IANA zones including common ones', () => {
    const zones = listIanaTimezones();
    expect(zones.length).toBeGreaterThan(100);
    expect(zones).toContain('America/New_York');
    expect(zones).toContain('Europe/London');
  });

  it('accepts UTC and known IANA zones, rejects garbage', () => {
    expect(isValidIanaTimezone('UTC')).toBe(true);
    expect(isValidIanaTimezone('America/New_York')).toBe(true);
    expect(isValidIanaTimezone('Not/AZone')).toBe(false);
    expect(isValidIanaTimezone('')).toBe(false);
  });
});

describe('parseTimestampInput', () => {
  it('parses ISO 8601 dates', () => {
    const dt = parseTimestampInput('2027-03-05T15:00:00', 'UTC');
    expect(dt.isValid).toBe(true);
    expect(dt.year).toBe(2027);
    expect(dt.month).toBe(3);
    expect(dt.day).toBe(5);
    expect(dt.hour).toBe(15);
  });

  it('parses "yyyy-MM-dd HH:mm" in the given zone', () => {
    const dt = parseTimestampInput('2027-03-05 15:00', 'America/New_York');
    expect(dt.isValid).toBe(true);
    expect(dt.zoneName).toBe('America/New_York');
    expect(dt.hour).toBe(15);
  });

  it('parses a date-only string as midnight in the given zone', () => {
    const dt = parseTimestampInput('2027-03-05', 'UTC');
    expect(dt.hour).toBe(0);
    expect(dt.minute).toBe(0);
  });

  it('parses a natural-language-ish explicit format', () => {
    const dt = parseTimestampInput('March 5, 2027 3:00 PM', 'UTC');
    expect(dt.isValid).toBe(true);
    expect(dt.year).toBe(2027);
    expect(dt.month).toBe(3);
    expect(dt.day).toBe(5);
    expect(dt.hour).toBe(15);
  });

  it('parses a time-only string against today\'s date', () => {
    const dt = parseTimestampInput('15:00', 'UTC');
    expect(dt.isValid).toBe(true);
    expect(dt.hour).toBe(15);
    expect(dt.minute).toBe(0);
  });

  it('defaults to UTC when no zone is given', () => {
    const dt = parseTimestampInput('2027-03-05T15:00:00');
    expect(dt.zoneName).toBe('UTC');
  });

  it('throws TimestampParseError for an invalid timezone', () => {
    expect(() => parseTimestampInput('2027-03-05', 'Not/AZone')).toThrow(TimestampParseError);
  });

  it('throws TimestampParseError for empty input', () => {
    expect(() => parseTimestampInput('   ')).toThrow(TimestampParseError);
  });

  it('throws TimestampParseError for unparseable text', () => {
    expect(() => parseTimestampInput('not a date at all !!', 'UTC')).toThrow(TimestampParseError);
  });
});
