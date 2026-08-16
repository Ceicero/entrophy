import { describe, expect, it } from 'vitest';
import { matcherSchema, matcherValues } from '../schemas';

describe('matcherSchema', () => {
  it('accepts a valid keyword matcher', () => {
    expect(matcherSchema.safeParse({ type: 'keyword', value: 'foo' }).success).toBe(true);
  });

  it('rejects an empty keyword value', () => {
    expect(matcherSchema.safeParse({ type: 'keyword', value: '' }).success).toBe(false);
  });

  it('rejects a mention_count matcher with a non-integer value', () => {
    expect(matcherSchema.safeParse({ type: 'mention_count', value: 'five' }).success).toBe(false);
    expect(matcherSchema.safeParse({ type: 'mention_count', value: 0 }).success).toBe(false);
    expect(matcherSchema.safeParse({ type: 'mention_count', value: 5 }).success).toBe(true);
  });

  it('accepts a valid regex matcher', () => {
    expect(matcherSchema.safeParse({ type: 'regex', value: '\\d+' }).success).toBe(true);
  });

  it('rejects a catastrophic-backtracking regex matcher (guards against ReDoS)', () => {
    expect(matcherSchema.safeParse({ type: 'regex', value: '(a+)+$' }).success).toBe(false);
  });

  it('rejects a malformed regex matcher', () => {
    expect(matcherSchema.safeParse({ type: 'regex', value: '(' }).success).toBe(false);
  });

  it('accepts an empty link_domain value (means "match any link")', () => {
    expect(matcherSchema.safeParse({ type: 'link_domain', value: [] }).success).toBe(true);
  });

  it('rejects an ai_category matcher with no category name', () => {
    expect(matcherSchema.safeParse({ type: 'ai_category', value: '' }).success).toBe(false);
    expect(matcherSchema.safeParse({ type: 'ai_category', value: 'harassment' }).success).toBe(true);
  });
});

describe('matcherValues', () => {
  it('wraps a single string value into a one-element array', () => {
    expect(matcherValues({ value: 'foo' })).toEqual(['foo']);
  });

  it('passes through an array value unchanged', () => {
    expect(matcherValues({ value: ['foo', 'bar'] })).toEqual(['foo', 'bar']);
  });

  it('stringifies a number value', () => {
    expect(matcherValues({ value: 5 })).toEqual(['5']);
  });
});
