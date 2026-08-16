import { describe, expect, it } from 'vitest';
import { buildRecordSearchWhere } from '../search-filters';

describe('buildRecordSearchWhere', () => {
  it('always scopes to guildId and omits unset filters', () => {
    const where = buildRecordSearchWhere({ guildId: 'g1' });
    expect(where).toEqual({ guildId: 'g1' });
  });

  it('applies userId/kind/decision/status/policyId filters when given', () => {
    const where = buildRecordSearchWhere({
      guildId: 'g1',
      userId: 'u1',
      kind: 'FLAG',
      decision: 'WARN',
      status: 'PENDING',
      policyId: 'p1',
    });
    expect(where).toMatchObject({ guildId: 'g1', userId: 'u1', kind: 'FLAG', decision: 'WARN', status: 'PENDING', policyId: 'p1' });
  });

  it('parses a duration string for "since" into a createdAt.gte lower bound', () => {
    const before = Date.now();
    const where = buildRecordSearchWhere({ guildId: 'g1', since: '7d' });
    const gte = (where.createdAt as { gte: Date }).gte;
    const expectedMs = 7 * 24 * 60 * 60 * 1000;
    expect(before - gte.getTime()).toBeGreaterThanOrEqual(expectedMs - 1000);
    expect(before - gte.getTime()).toBeLessThanOrEqual(expectedMs + 5000);
  });

  it('parses an ISO date string for "since" when it is not a duration', () => {
    const where = buildRecordSearchWhere({ guildId: 'g1', since: '2026-01-01T00:00:00.000Z' });
    expect((where.createdAt as { gte: Date }).gte.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('accepts a Date instance for "since" directly', () => {
    const date = new Date('2026-06-01T00:00:00.000Z');
    const where = buildRecordSearchWhere({ guildId: 'g1', since: date });
    expect((where.createdAt as { gte: Date }).gte).toBe(date);
  });

  it('ignores an unparseable "since" value', () => {
    const where = buildRecordSearchWhere({ guildId: 'g1', since: 'not a date' });
    expect(where.createdAt).toBeUndefined();
  });
});
