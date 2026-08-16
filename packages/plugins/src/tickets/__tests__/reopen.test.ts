import { describe, expect, it } from 'vitest';
import { isWithinReopenWindow } from '../reopen';

describe('isWithinReopenWindow', () => {
  const now = new Date('2026-01-02T00:00:00.000Z');

  it('is true just inside the window', () => {
    expect(isWithinReopenWindow('2026-01-01T01:00:00.000Z', 24, now)).toBe(true);
  });

  it('is true exactly at the boundary', () => {
    expect(isWithinReopenWindow('2026-01-01T00:00:00.000Z', 24, now)).toBe(true);
  });

  it('is false just outside the window', () => {
    expect(isWithinReopenWindow('2026-01-01T00:00:00.000Z', 23, now)).toBe(false);
  });

  it('is always false when the reopen window is 0 (disabled)', () => {
    expect(isWithinReopenWindow(now, 0, now)).toBe(false);
  });

  it('accepts a Date object as well as an ISO string', () => {
    expect(isWithinReopenWindow(new Date('2026-01-01T12:00:00.000Z'), 24, now)).toBe(true);
  });
});
