import { describe, expect, it } from 'vitest';
import { discordTimestamp, formatDuration, parseDuration } from '../src/utils/time';

describe('parseDuration', () => {
  it('parses single-unit durations', () => {
    expect(parseDuration('30s')).toBe(30_000);
    expect(parseDuration('10m')).toBe(10 * 60_000);
    expect(parseDuration('2h')).toBe(2 * 3_600_000);
    expect(parseDuration('3d')).toBe(3 * 86_400_000);
    expect(parseDuration('1w')).toBe(604_800_000);
  });

  it('parses combined durations', () => {
    expect(parseDuration('1h30m')).toBe(3_600_000 + 30 * 60_000);
    expect(parseDuration('1w2d3h')).toBe(604_800_000 + 2 * 86_400_000 + 3 * 3_600_000);
  });

  it('is case-insensitive on the unit', () => {
    expect(parseDuration('10M')).toBe(10 * 60_000);
  });

  it('returns null for invalid input', () => {
    expect(parseDuration('')).toBeNull();
    expect(parseDuration('abc')).toBeNull();
    expect(parseDuration('10x')).toBeNull();
    expect(parseDuration('h10')).toBeNull();
    expect(parseDuration('-10m')).toBeNull();
  });
});

describe('formatDuration', () => {
  it('formats a combined duration', () => {
    expect(formatDuration(3_600_000 + 30 * 60_000)).toBe('1h 30m');
  });

  it('formats a single-unit duration', () => {
    expect(formatDuration(45_000)).toBe('45s');
  });

  it('formats zero/negative as 0s', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(-100)).toBe('0s');
  });
});

describe('discordTimestamp', () => {
  it('formats a Date as a <t:unix:style> tag', () => {
    const date = new Date('2026-01-01T00:00:00.000Z');
    expect(discordTimestamp(date)).toBe(`<t:${Math.floor(date.getTime() / 1000)}:f>`);
    expect(discordTimestamp(date, 'R')).toBe(`<t:${Math.floor(date.getTime() / 1000)}:R>`);
  });

  it('formats an epoch-ms number the same way', () => {
    const ms = 1_700_000_000_000;
    expect(discordTimestamp(ms, 'D')).toBe(`<t:${Math.floor(ms / 1000)}:D>`);
  });
});
