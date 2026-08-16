import { describe, expect, it } from 'vitest';
import { parseMatcherValue } from '../commands/policy';
import { matcherSchema } from '../schemas';

describe('parseMatcherValue — mention_count', () => {
  it('parses a clean integer', () => {
    expect(parseMatcherValue('mention_count', '5')).toBe(5);
  });

  it('returns undefined (not 0) for a non-numeric typo, so the caller rejects it instead of matching every message', () => {
    expect(parseMatcherValue('mention_count', '5 mentions')).toBeUndefined();
    expect(parseMatcherValue('mention_count', '@5')).toBeUndefined();
    expect(parseMatcherValue('mention_count', 'five')).toBeUndefined();
  });
});

describe('matcherSchema — mention_count guard (the second line of defense used by both the command and API path)', () => {
  it('rejects a mention_count matcher with value 0 (would match every message in scope)', () => {
    const result = matcherSchema.safeParse({ type: 'mention_count', value: 0 });
    expect(result.success).toBe(false);
  });

  it('accepts a mention_count matcher with a positive integer', () => {
    const result = matcherSchema.safeParse({ type: 'mention_count', value: 5 });
    expect(result.success).toBe(true);
  });
});
