import { describe, expect, it } from 'vitest';
import { buildExcerpt, evaluate, type NormalizedMessage, type Policy } from '../engine';

function baseMessage(overrides: Partial<NormalizedMessage> = {}): NormalizedMessage {
  return {
    content: '',
    authorId: 'u1',
    authorRoleIds: [],
    channelId: 'c1',
    mentionsCount: 0,
    attachments: [],
    links: [],
    invites: [],
    isStaff: false,
    ...overrides,
  };
}

function basePolicy(overrides: Partial<Policy> = {}): Policy {
  return {
    id: 'p1',
    name: 'Test policy',
    enabled: true,
    severity: 'MEDIUM',
    matchers: [],
    channelIds: [],
    exemptRoleIds: [],
    exemptChannelIds: [],
    ...overrides,
  };
}

describe('evaluate: keyword matcher', () => {
  it('matches whole words case-insensitively by default', () => {
    const message = baseMessage({ content: 'this message has FOO in it' });
    const policy = basePolicy({ matchers: [{ type: 'keyword', value: 'foo' }] });
    expect(evaluate(message, [policy])).toHaveLength(1);
  });

  it('does not match a substring inside another word when wholeWord is true', () => {
    const message = baseMessage({ content: 'foobar is not foo' });
    const policyNoMatch = basePolicy({ matchers: [{ type: 'keyword', value: 'foobarbaz' }] });
    expect(evaluate(message, [policyNoMatch])).toHaveLength(0);
  });

  it('matches substrings when wholeWord is false', () => {
    const message = baseMessage({ content: 'xfooy' });
    const policy = basePolicy({ matchers: [{ type: 'keyword', value: 'foo', wholeWord: false }] });
    expect(evaluate(message, [policy])).toHaveLength(1);
  });

  it('respects caseSensitive: true', () => {
    const message = baseMessage({ content: 'FOO' });
    const policy = basePolicy({ matchers: [{ type: 'keyword', value: 'foo', caseSensitive: true }] });
    expect(evaluate(message, [policy])).toHaveLength(0);
  });

  it('matches any value in a keyword list', () => {
    const message = baseMessage({ content: 'contains banana' });
    const policy = basePolicy({ matchers: [{ type: 'keyword', value: ['apple', 'banana'] }] });
    expect(evaluate(message, [policy])).toHaveLength(1);
  });
});

describe('evaluate: phrase matcher', () => {
  it('matches a multi-word substring', () => {
    const message = baseMessage({ content: 'please click this link now' });
    const policy = basePolicy({ matchers: [{ type: 'phrase', value: 'click this link' }] });
    expect(evaluate(message, [policy])).toHaveLength(1);
  });
});

describe('evaluate: regex matcher', () => {
  it('matches a validated pattern', () => {
    const message = baseMessage({ content: 'order id 12345' });
    const policy = basePolicy({ matchers: [{ type: 'regex', value: '\\d{5}' }] });
    expect(evaluate(message, [policy])).toHaveLength(1);
  });

  it('does not throw on a malformed pattern (fails closed)', () => {
    const message = baseMessage({ content: 'anything' });
    const policy = basePolicy({ matchers: [{ type: 'regex', value: '(' }] });
    expect(() => evaluate(message, [policy])).not.toThrow();
    expect(evaluate(message, [policy])).toHaveLength(0);
  });
});

describe('evaluate: link_domain matcher', () => {
  it('matches an exact domain', () => {
    const message = baseMessage({ links: ['https://scam.example/path'] });
    const policy = basePolicy({ matchers: [{ type: 'link_domain', value: 'scam.example' }] });
    expect(evaluate(message, [policy])).toHaveLength(1);
  });

  it('matches a subdomain by suffix', () => {
    const message = baseMessage({ links: ['https://cdn.scam.example/path'] });
    const policy = basePolicy({ matchers: [{ type: 'link_domain', value: 'scam.example' }] });
    expect(evaluate(message, [policy])).toHaveLength(1);
  });

  it('does not match an unrelated domain', () => {
    const message = baseMessage({ links: ['https://safe.example/path'] });
    const policy = basePolicy({ matchers: [{ type: 'link_domain', value: 'scam.example' }] });
    expect(evaluate(message, [policy])).toHaveLength(0);
  });

  it('matches any link when the value list is empty ("external-links" pack behaviour)', () => {
    const message = baseMessage({ links: ['https://anything.example/'] });
    const policy = basePolicy({ matchers: [{ type: 'link_domain', value: [] }] });
    expect(evaluate(message, [policy])).toHaveLength(1);
  });

  it('does not match when there are no links and the value list is empty', () => {
    const message = baseMessage({ links: [] });
    const policy = basePolicy({ matchers: [{ type: 'link_domain', value: [] }] });
    expect(evaluate(message, [policy])).toHaveLength(0);
  });
});

describe('evaluate: invite matcher', () => {
  it('matches when the message has any extracted invite', () => {
    const message = baseMessage({ invites: ['discord.gg/abc123'] });
    const policy = basePolicy({ matchers: [{ type: 'invite', value: 'discord-invite' }] });
    expect(evaluate(message, [policy])).toHaveLength(1);
  });

  it('does not match without an invite', () => {
    const message = baseMessage({ invites: [] });
    const policy = basePolicy({ matchers: [{ type: 'invite', value: 'discord-invite' }] });
    expect(evaluate(message, [policy])).toHaveLength(0);
  });
});

describe('evaluate: mention_count matcher', () => {
  it('matches at or above the threshold', () => {
    const policy = basePolicy({ matchers: [{ type: 'mention_count', value: 5 }] });
    expect(evaluate(baseMessage({ mentionsCount: 5 }), [policy])).toHaveLength(1);
    expect(evaluate(baseMessage({ mentionsCount: 10 }), [policy])).toHaveLength(1);
    expect(evaluate(baseMessage({ mentionsCount: 4 }), [policy])).toHaveLength(0);
  });
});

describe('evaluate: attachment_ext matcher', () => {
  it('matches a listed extension, case-insensitively', () => {
    const message = baseMessage({ attachments: [{ name: 'payload.EXE' }] });
    const policy = basePolicy({ matchers: [{ type: 'attachment_ext', value: ['exe', 'bat'] }] });
    expect(evaluate(message, [policy])).toHaveLength(1);
  });

  it('does not match an unlisted extension', () => {
    const message = baseMessage({ attachments: [{ name: 'photo.png' }] });
    const policy = basePolicy({ matchers: [{ type: 'attachment_ext', value: ['exe'] }] });
    expect(evaluate(message, [policy])).toHaveLength(0);
  });
});

describe('evaluate: ai_category matcher', () => {
  it('never matches deterministically (assistive-only, handled outside the engine)', () => {
    const message = baseMessage({ content: 'anything at all' });
    const policy = basePolicy({ matchers: [{ type: 'ai_category', value: 'harassment' }] });
    expect(evaluate(message, [policy])).toHaveLength(0);
  });
});

describe('evaluate: scope and exemptions', () => {
  it('skips disabled policies', () => {
    const message = baseMessage({ content: 'foo' });
    const policy = basePolicy({ enabled: false, matchers: [{ type: 'keyword', value: 'foo' }] });
    expect(evaluate(message, [policy])).toHaveLength(0);
  });

  it('only applies within scoped channels when channelIds is non-empty', () => {
    const policy = basePolicy({
      channelIds: ['other-channel'],
      matchers: [{ type: 'keyword', value: 'foo' }],
    });
    expect(evaluate(baseMessage({ content: 'foo', channelId: 'c1' }), [policy])).toHaveLength(0);
    expect(evaluate(baseMessage({ content: 'foo', channelId: 'other-channel' }), [policy])).toHaveLength(1);
  });

  it('skips exempt channels regardless of scope', () => {
    const policy = basePolicy({ exemptChannelIds: ['c1'], matchers: [{ type: 'keyword', value: 'foo' }] });
    expect(evaluate(baseMessage({ content: 'foo', channelId: 'c1' }), [policy])).toHaveLength(0);
  });

  it('skips authors with an exempt role', () => {
    const policy = basePolicy({ exemptRoleIds: ['r1'], matchers: [{ type: 'keyword', value: 'foo' }] });
    expect(evaluate(baseMessage({ content: 'foo', authorRoleIds: ['r1'] }), [policy])).toHaveLength(0);
    expect(evaluate(baseMessage({ content: 'foo', authorRoleIds: ['r2'] }), [policy])).toHaveLength(1);
  });

  it('skips every policy when exemptStaffGlobally is set and the author is staff', () => {
    const policy = basePolicy({ matchers: [{ type: 'keyword', value: 'foo' }] });
    const message = baseMessage({ content: 'foo', isStaff: true });
    expect(evaluate(message, [policy], { exemptStaffGlobally: true })).toHaveLength(0);
    expect(evaluate(message, [policy], { exemptStaffGlobally: false })).toHaveLength(1);
  });
});

describe('evaluate: severity ordering', () => {
  it('returns matches highest severity first', () => {
    const message = baseMessage({ content: 'foo bar baz' });
    const low = basePolicy({ id: 'low', severity: 'LOW', matchers: [{ type: 'keyword', value: 'foo' }] });
    const critical = basePolicy({
      id: 'critical',
      severity: 'CRITICAL',
      matchers: [{ type: 'keyword', value: 'baz' }],
    });
    const medium = basePolicy({
      id: 'medium',
      severity: 'MEDIUM',
      matchers: [{ type: 'keyword', value: 'bar' }],
    });

    const matches = evaluate(message, [low, critical, medium]);
    expect(matches.map((m) => m.policyId)).toEqual(['critical', 'medium', 'low']);
  });
});

describe('buildExcerpt', () => {
  it('strips mentions and truncates to the max length', () => {
    const excerpt = buildExcerpt('hey <@123456789012345678> check this out', 20);
    expect(excerpt.length).toBeLessThanOrEqual(20);
    expect(excerpt).not.toContain('<@123456789012345678>');
  });

  it('leaves short, mention-free content untouched', () => {
    expect(buildExcerpt('hello world', 300)).toBe('hello world');
  });
});
