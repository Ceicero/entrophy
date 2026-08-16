import { describe, expect, it } from 'vitest';
import { filterMessagesForPurge, validatePurgeCount, type PurgeCandidateMessage } from '../purge';

describe('validatePurgeCount', () => {
  it('accepts counts within [1, min(100, purgeMax)]', () => {
    expect(validatePurgeCount(50, 100)).toEqual({ ok: true, count: 50 });
    expect(validatePurgeCount(1, 100)).toEqual({ ok: true, count: 1 });
    expect(validatePurgeCount(100, 100)).toEqual({ ok: true, count: 100 });
  });

  it('rejects 0, negative, non-integer, and >100 (Discord bulk-delete cap)', () => {
    expect(validatePurgeCount(0, 100)).toMatchObject({ ok: false });
    expect(validatePurgeCount(-5, 100)).toMatchObject({ ok: false });
    expect(validatePurgeCount(1.5, 100)).toMatchObject({ ok: false });
    expect(validatePurgeCount(101, 100)).toMatchObject({ ok: false });
  });

  it("rejects a count above the guild's configured purgeMax even if <= 100", () => {
    expect(validatePurgeCount(80, 50)).toMatchObject({ ok: false });
    expect(validatePurgeCount(50, 50)).toEqual({ ok: true, count: 50 });
  });
});

function msg(overrides: Partial<PurgeCandidateMessage>): PurgeCandidateMessage {
  return { id: 'm1', authorId: 'u1', ageMs: 1000, content: '', ...overrides };
}

describe('filterMessagesForPurge', () => {
  const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

  it('excludes messages older than 14 days (Discord bulk-delete window)', () => {
    const messages = [msg({ id: 'a', ageMs: 1000 }), msg({ id: 'b', ageMs: FOURTEEN_DAYS_MS + 1 })];
    const result = filterMessagesForPurge(messages, { limit: 100 });
    expect(result.map((m) => m.id)).toEqual(['a']);
  });

  it('filters by author when userId is given', () => {
    const messages = [msg({ id: 'a', authorId: 'u1' }), msg({ id: 'b', authorId: 'u2' })];
    const result = filterMessagesForPurge(messages, { userId: 'u2', limit: 100 });
    expect(result.map((m) => m.id)).toEqual(['b']);
  });

  it('filters by content substring case-insensitively', () => {
    const messages = [msg({ id: 'a', content: 'Hello World' }), msg({ id: 'b', content: 'goodbye' })];
    const result = filterMessagesForPurge(messages, { contains: 'hello', limit: 100 });
    expect(result.map((m) => m.id)).toEqual(['a']);
  });

  it('combines filters and respects the limit', () => {
    const messages = [
      msg({ id: 'a', authorId: 'u1', content: 'spam spam' }),
      msg({ id: 'b', authorId: 'u1', content: 'spam spam' }),
      msg({ id: 'c', authorId: 'u1', content: 'clean' }),
      msg({ id: 'd', authorId: 'u2', content: 'spam spam' }),
    ];
    const result = filterMessagesForPurge(messages, { userId: 'u1', contains: 'spam', limit: 1 });
    expect(result.map((m) => m.id)).toEqual(['a']);
  });

  it('returns an empty array when nothing matches', () => {
    const messages = [msg({ id: 'a', authorId: 'u1' })];
    expect(filterMessagesForPurge(messages, { userId: 'nobody', limit: 100 })).toEqual([]);
  });
});
