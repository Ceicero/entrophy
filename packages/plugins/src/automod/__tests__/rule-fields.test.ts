import { describe, expect, it } from 'vitest';
import { parseRuleFieldValues } from '../commands/rule-fields';

describe('parseRuleFieldValues', () => {
  it('parses MESSAGE_FREQUENCY fields with defaults for blanks', () => {
    const config = parseRuleFieldValues('MESSAGE_FREQUENCY', { maxMessages: '', windowSeconds: '15' });
    expect(config).toEqual({ type: 'MESSAGE_FREQUENCY', maxMessages: 5, windowSeconds: 15 });
  });

  it('parses boolean and csv fields for INVITE_LINKS', () => {
    const config = parseRuleFieldValues('INVITE_LINKS', { allowOwnServerInvites: 'false', allowedInviteCodes: 'abc, def ,ghi' });
    expect(config).toEqual({ type: 'INVITE_LINKS', allowOwnServerInvites: false, allowedInviteCodes: ['abc', 'def', 'ghi'] });
  });

  it('throws a friendly error for an out-of-range number', () => {
    expect(() => parseRuleFieldValues('MESSAGE_FREQUENCY', { maxMessages: '9999', windowSeconds: '10' })).toThrow();
  });

  it('throws for an invalid regex pattern (catastrophic backtracking)', () => {
    expect(() => parseRuleFieldValues('REGEX_FILTER', { pattern: '(a+)+$', flags: 'i' })).toThrow();
  });

  it('parses REGEX_FILTER with a default flag when left blank', () => {
    const config = parseRuleFieldValues('REGEX_FILTER', { pattern: 'hello', flags: '' });
    expect(config).toEqual({ type: 'REGEX_FILTER', pattern: 'hello', flags: 'i' });
  });

  it('requires at least one word for WORD_FILTER', () => {
    expect(() => parseRuleFieldValues('WORD_FILTER', { words: '', wholeWord: 'true', caseSensitive: 'false' })).toThrow();
  });
});
