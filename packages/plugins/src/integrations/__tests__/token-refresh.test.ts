import { describe, expect, it } from 'vitest';
import { selectTokensDueForRefresh } from '../jobs/token-refresh';

const NOW = new Date('2026-08-15T12:00:00.000Z');
const minutesFromNow = (m: number) => new Date(NOW.getTime() + m * 60_000);

describe('selectTokensDueForRefresh', () => {
  it('selects tokens expiring within the window', () => {
    const tokens = [
      { id: 'a', expiresAt: minutesFromNow(10) }, // due (< 30m)
      { id: 'b', expiresAt: minutesFromNow(29) }, // due
      { id: 'c', expiresAt: minutesFromNow(31) }, // not due
      { id: 'd', expiresAt: minutesFromNow(-5) }, // already expired -> due
    ];
    const due = selectTokensDueForRefresh(tokens, NOW);
    expect(due.map((t) => t.id).sort()).toEqual(['a', 'b', 'd']);
  });

  it('never selects a token with no expiry (expiresAt: null means "does not expire")', () => {
    const tokens = [{ id: 'a', expiresAt: null }];
    expect(selectTokensDueForRefresh(tokens, NOW)).toHaveLength(0);
  });

  it('respects a custom window', () => {
    const tokens = [{ id: 'a', expiresAt: minutesFromNow(45) }];
    expect(selectTokensDueForRefresh(tokens, NOW, 30 * 60_000)).toHaveLength(0);
    expect(selectTokensDueForRefresh(tokens, NOW, 60 * 60_000)).toHaveLength(1);
  });
});
