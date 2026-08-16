import { describe, expect, it } from 'vitest';
import { automodActionsSchema, automodRuleConfigSchema } from '../schemas';
import { DEFAULT_SCAM_DOMAINS, DEFAULT_SCAM_KEYWORD_PATTERNS } from '../engine/scam-list';
import { hostnameMatchesDomain } from '../engine/scam-list';

describe('automodRuleConfigSchema — REGEX_FILTER catastrophic pattern rejection', () => {
  it('accepts a safe pattern', () => {
    const result = automodRuleConfigSchema.safeParse({ type: 'REGEX_FILTER', pattern: '\\bbadword\\b', flags: 'i' });
    expect(result.success).toBe(true);
  });

  it('rejects a classic catastrophic-backtracking pattern', () => {
    const result = automodRuleConfigSchema.safeParse({ type: 'REGEX_FILTER', pattern: '(a+)+$', flags: 'i' });
    expect(result.success).toBe(false);
  });

  it('rejects an overlong pattern', () => {
    const result = automodRuleConfigSchema.safeParse({ type: 'REGEX_FILTER', pattern: 'a'.repeat(300), flags: 'i' });
    expect(result.success).toBe(false);
  });

  it('rejects an unsupported flag', () => {
    const result = automodRuleConfigSchema.safeParse({ type: 'REGEX_FILTER', pattern: 'ok', flags: 'y' });
    expect(result.success).toBe(false);
  });
});

describe('automodRuleConfigSchema — defaults', () => {
  it('fills in defaults for every field per type', () => {
    const result = automodRuleConfigSchema.parse({ type: 'MESSAGE_FREQUENCY' });
    expect(result).toEqual({ type: 'MESSAGE_FREQUENCY', maxMessages: 5, windowSeconds: 10 });
  });

  it('rejects an unknown type', () => {
    const result = automodRuleConfigSchema.safeParse({ type: 'NOT_A_REAL_TYPE' });
    expect(result.success).toBe(false);
  });
});

describe('automodActionsSchema', () => {
  it('accepts a valid action list', () => {
    const result = automodActionsSchema.safeParse([{ type: 'warn' }, { type: 'timeout', timeoutMs: 60_000 }]);
    expect(result.success).toBe(true);
  });

  it('requires at least one action', () => {
    const result = automodActionsSchema.safeParse([]);
    expect(result.success).toBe(false);
  });

  it('rejects an unknown action type', () => {
    const result = automodActionsSchema.safeParse([{ type: 'ban' }]);
    expect(result.success).toBe(false);
  });
});

describe('hostnameMatchesDomain', () => {
  it('matches every default scam domain against itself', () => {
    for (const domain of DEFAULT_SCAM_DOMAINS) {
      expect(hostnameMatchesDomain(domain, domain)).toBe(true);
    }
  });

  it('matches a subdomain', () => {
    expect(hostnameMatchesDomain('www.dlscord.com', 'dlscord.com')).toBe(true);
  });

  it('does not match an unrelated hostname', () => {
    expect(hostnameMatchesDomain('discord.com', 'dlscord.com')).toBe(false);
  });
});

describe('DEFAULT_SCAM_KEYWORD_PATTERNS', () => {
  it('matches common bait phrases', () => {
    const samples = ['FREE NITRO for the first 10!', 'claim your steam gift now', 'you have won a nitro giveaway'];
    for (const sample of samples) {
      expect(DEFAULT_SCAM_KEYWORD_PATTERNS.some((p) => p.test(sample))).toBe(true);
    }
  });

  it('does not match ordinary text', () => {
    const sample = 'thanks for the help, appreciate it!';
    expect(DEFAULT_SCAM_KEYWORD_PATTERNS.some((p) => p.test(sample))).toBe(false);
  });
});
