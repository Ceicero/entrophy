import { describe, expect, it } from 'vitest';
import { computeSlaDueAt, isSlaBreached } from '../sla';

describe('computeSlaDueAt', () => {
  it('returns null when no SLA minutes are configured', () => {
    expect(computeSlaDueAt(new Date('2026-01-01T00:00:00.000Z'), null)).toBeNull();
    expect(computeSlaDueAt(new Date('2026-01-01T00:00:00.000Z'), undefined)).toBeNull();
  });

  it('adds the configured minutes to the opened-at time', () => {
    const due = computeSlaDueAt(new Date('2026-01-01T00:00:00.000Z'), 60);
    expect(due?.toISOString()).toBe('2026-01-01T01:00:00.000Z');
  });
});

describe('isSlaBreached', () => {
  const now = new Date('2026-01-01T12:00:00.000Z');

  it('is false when there is no SLA due date', () => {
    expect(isSlaBreached({ slaDueAt: null, firstResponseAt: null, now })).toBe(false);
  });

  it('is false once a first response has been recorded, even if the due date has passed', () => {
    expect(isSlaBreached({ slaDueAt: '2026-01-01T11:00:00.000Z', firstResponseAt: '2026-01-01T11:30:00.000Z', now })).toBe(false);
  });

  it('is true when the due date is in the past and there has been no response', () => {
    expect(isSlaBreached({ slaDueAt: '2026-01-01T11:59:59.000Z', firstResponseAt: null, now })).toBe(true);
  });

  it('is true exactly at the due date (boundary)', () => {
    expect(isSlaBreached({ slaDueAt: now.toISOString(), firstResponseAt: null, now })).toBe(true);
  });

  it('is false when the due date is still in the future', () => {
    expect(isSlaBreached({ slaDueAt: '2026-01-01T12:00:01.000Z', firstResponseAt: null, now })).toBe(false);
  });

  it('accepts Date objects as well as ISO strings', () => {
    expect(isSlaBreached({ slaDueAt: new Date('2026-01-01T11:00:00.000Z'), firstResponseAt: null, now })).toBe(true);
  });
});
