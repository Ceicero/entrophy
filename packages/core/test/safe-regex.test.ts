import { describe, expect, it } from 'vitest';
import { safeTest, validateUserRegex } from '../src/utils/safe-regex';

describe('validateUserRegex', () => {
  it('rejects a catastrophic-backtracking pattern', () => {
    const result = validateUserRegex('(a+)+$');
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('accepts a simple, safe pattern', () => {
    const result = validateUserRegex('^[a-z0-9_-]{3,20}$');
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('rejects patterns longer than 256 characters', () => {
    const longPattern = `^${'a'.repeat(300)}$`;
    const result = validateUserRegex(longPattern);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/256/);
  });

  it('rejects an empty pattern', () => {
    expect(validateUserRegex('').ok).toBe(false);
  });

  it('rejects unsupported flags', () => {
    const result = validateUserRegex('abc', 'y');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/flag/i);
  });

  it('accepts allowed flags (gimsu)', () => {
    expect(validateUserRegex('abc', 'gi').ok).toBe(true);
    expect(validateUserRegex('abc', 'gimsu').ok).toBe(true);
  });

  it('rejects a pattern that fails to compile', () => {
    const result = validateUserRegex('(unterminated');
    expect(result.ok).toBe(false);
  });
});

describe('safeTest', () => {
  it('matches normally for short input', () => {
    expect(safeTest(/foo/, 'this has foo in it')).toBe(true);
    expect(safeTest(/bar/, 'no match here')).toBe(false);
  });

  it('truncates overly long input before testing', () => {
    const needle = 'NEEDLE';
    const haystack = `${'x'.repeat(2000)}${needle}`;
    // The needle sits past the default 2000-char truncation point, so it should NOT be found.
    expect(safeTest(new RegExp(needle), haystack)).toBe(false);
    // With a larger maxInputLength, it should be found.
    expect(safeTest(new RegExp(needle), haystack, { maxInputLength: 5000 })).toBe(true);
  });

  it('resets lastIndex so repeated calls with a global regex behave consistently', () => {
    const re = /a/g;
    expect(safeTest(re, 'banana')).toBe(true);
    expect(safeTest(re, 'banana')).toBe(true);
    expect(re.lastIndex).toBe(0);
  });
});
