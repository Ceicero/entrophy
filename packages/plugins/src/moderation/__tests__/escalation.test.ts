import { describe, expect, it } from 'vitest';
import { evaluateEscalation } from '../escalation';
import type { EscalationRule } from '../manifest';

const LADDER: EscalationRule[] = [
  { warnings: 3, action: 'timeout', durationMs: 3_600_000 },
  { warnings: 5, action: 'kick' },
  { warnings: 7, action: 'ban' },
];

describe('evaluateEscalation', () => {
  it('returns null when the count matches no threshold', () => {
    expect(evaluateEscalation(1, LADDER)).toBeNull();
    expect(evaluateEscalation(2, LADDER)).toBeNull();
    expect(evaluateEscalation(4, LADDER)).toBeNull();
    expect(evaluateEscalation(6, LADDER)).toBeNull();
    expect(evaluateEscalation(100, LADDER)).toBeNull();
  });

  it('fires on an exact threshold match', () => {
    expect(evaluateEscalation(3, LADDER)).toEqual(LADDER[0]);
    expect(evaluateEscalation(5, LADDER)).toEqual(LADDER[1]);
    expect(evaluateEscalation(7, LADDER)).toEqual(LADDER[2]);
  });

  it('does not fire again once the count moves past a threshold (no re-triggering)', () => {
    // Count 4 already passed the warnings:3 rung — it should not fire a second time.
    expect(evaluateEscalation(4, LADDER)).toBeNull();
  });

  it('returns an empty ladder as null for every count', () => {
    expect(evaluateEscalation(3, [])).toBeNull();
  });

  it('picks the most severe action when multiple rules share the same threshold', () => {
    const tied: EscalationRule[] = [
      { warnings: 3, action: 'timeout', durationMs: 60_000 },
      { warnings: 3, action: 'ban' },
      { warnings: 3, action: 'kick' },
    ];
    expect(evaluateEscalation(3, tied)?.action).toBe('ban');
  });
});
