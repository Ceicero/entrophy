import { describe, expect, it } from 'vitest';
import { parsePrefixMessage, splitNamedArg, tokenize, isBarePrefix } from '../prefix/parse';

describe('parsePrefixMessage', () => {
  it('returns null if message does not start with prefix', () => {
    const result = parsePrefixMessage('/help', '+');
    expect(result).toBeNull();
  });

  it('returns null if remainder is empty', () => {
    const result = parsePrefixMessage('+', '+');
    expect(result).toBeNull();
  });

  it('returns null if remainder is only whitespace', () => {
    const result = parsePrefixMessage('+   \t\n', '+');
    expect(result).toBeNull();
  });

  it('returns null if first non-whitespace char after prefix is not a letter', () => {
    expect(parsePrefixMessage('++', '+')).toBeNull();
    expect(parsePrefixMessage('+1', '+')).toBeNull();
    expect(parsePrefixMessage('++help', '+')).toBeNull();
    expect(parsePrefixMessage('+_test', '+')).toBeNull();
    expect(parsePrefixMessage('+-test', '+')).toBeNull();
  });

  it('parses a simple command with no args', () => {
    const result = parsePrefixMessage('+help', '+');
    expect(result).toEqual({ name: 'help', tokens: [] });
  });

  it('lowercases the command name', () => {
    const result = parsePrefixMessage('+HELP', '+');
    expect(result).toEqual({ name: 'help', tokens: [] });

    const result2 = parsePrefixMessage('+Help', '+');
    expect(result2).toEqual({ name: 'help', tokens: [] });
  });

  it('parses positional arguments', () => {
    const result = parsePrefixMessage('+mod ban @user spam', '+');
    expect(result).toEqual({
      name: 'mod',
      tokens: ['ban', '@user', 'spam'],
    });
  });

  it('respects quoted strings as single tokens', () => {
    const result = parsePrefixMessage('+say "hello world" test', '+');
    expect(result).toEqual({
      name: 'say',
      tokens: ['hello world', 'test'],
    });
  });

  it('handles escaped quotes inside quoted strings', () => {
    const result = parsePrefixMessage('+say "hello \\"world\\""', '+');
    expect(result).toEqual({
      name: 'say',
      tokens: ['hello "world"'],
    });
  });

  it('handles multiple quoted sections', () => {
    const result = parsePrefixMessage('+say "first" "second"', '+');
    expect(result).toEqual({
      name: 'say',
      tokens: ['first', 'second'],
    });
  });

  it('handles mixed quoted and unquoted tokens', () => {
    const result = parsePrefixMessage('+mod ban @user "lots of spam"', '+');
    expect(result).toEqual({
      name: 'mod',
      tokens: ['ban', '@user', 'lots of spam'],
    });
  });

  it('uses a custom prefix', () => {
    const result = parsePrefixMessage('!help test', '!');
    expect(result).toEqual({ name: 'help', tokens: ['test'] });
  });

  it('handles whitespace after prefix', () => {
    const result = parsePrefixMessage('+  help arg1 arg2', '+');
    expect(result).toEqual({ name: 'help', tokens: ['arg1', 'arg2'] });
  });
});

describe('tokenize', () => {
  it('splits on whitespace', () => {
    expect(tokenize('hello world test')).toEqual(['hello', 'world', 'test']);
  });

  it('respects quoted strings', () => {
    expect(tokenize('"hello world" test')).toEqual(['hello world', 'test']);
  });

  it('handles escaped quotes', () => {
    expect(tokenize('"hello \\"world\\""')).toEqual(['hello "world"']);
  });

  it('handles mixed tokens', () => {
    expect(tokenize('a "b c" d')).toEqual(['a', 'b c', 'd']);
  });

  it('returns empty array for empty input', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('returns empty array for whitespace-only input', () => {
    expect(tokenize('   \t\n  ')).toEqual([]);
  });

  it('ignores leading/trailing whitespace', () => {
    expect(tokenize('  hello world  ')).toEqual(['hello', 'world']);
  });
});

describe('splitNamedArg', () => {
  it('splits key:value', () => {
    const result = splitNamedArg('user:@someone');
    expect(result).toEqual({ key: 'user', value: '@someone' });
  });

  it('lowercases the key', () => {
    const result = splitNamedArg('User:@someone');
    expect(result).toEqual({ key: 'user', value: '@someone' });
  });

  it('allows hyphens and underscores in key', () => {
    const result = splitNamedArg('user_id:123');
    expect(result).toEqual({ key: 'user_id', value: '123' });

    const result2 = splitNamedArg('user-name:test');
    expect(result2).toEqual({ key: 'user-name', value: 'test' });
  });

  it('handles empty value', () => {
    const result = splitNamedArg('key:');
    expect(result).toEqual({ key: 'key', value: '' });
  });

  it('handles value with colons', () => {
    const result = splitNamedArg('url:https://example.com');
    expect(result).toEqual({ key: 'url', value: 'https://example.com' });
  });

  it('returns null if no colon', () => {
    expect(splitNamedArg('nocolon')).toBeNull();
  });

  it('returns null if key starts with digit', () => {
    expect(splitNamedArg('1key:value')).toBeNull();
  });

  it('returns null if key is empty', () => {
    expect(splitNamedArg(':value')).toBeNull();
  });

  it('returns null if key contains invalid chars', () => {
    expect(splitNamedArg('key@:value')).toBeNull();
    expect(splitNamedArg('key#:value')).toBeNull();
  });
});

describe('isBarePrefix', () => {
  it('returns true for just the prefix', () => {
    expect(isBarePrefix('+', '+')).toBe(true);
  });

  it('returns true for prefix with trailing whitespace', () => {
    expect(isBarePrefix('+   ', '+')).toBe(true);
    expect(isBarePrefix('+\t', '+')).toBe(true);
    expect(isBarePrefix('+\n', '+')).toBe(true);
  });

  it('returns false if prefix not at start', () => {
    expect(isBarePrefix('x+', '+')).toBe(false);
  });

  it('returns false if there is a command after prefix', () => {
    expect(isBarePrefix('+help', '+')).toBe(false);
    expect(isBarePrefix('+ help', '+')).toBe(false);
  });

  it('returns false if content does not start with prefix', () => {
    expect(isBarePrefix('help', '+')).toBe(false);
  });

  it('works with custom prefixes', () => {
    expect(isBarePrefix('!', '!')).toBe(true);
    expect(isBarePrefix('!  \t', '!')).toBe(true);
    expect(isBarePrefix('! help', '!')).toBe(false);
  });
});
