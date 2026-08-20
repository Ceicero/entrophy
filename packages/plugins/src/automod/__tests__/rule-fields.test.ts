import { describe, expect, it } from 'vitest';
import { RULE_FIELD_SPECS, parseRuleFieldValues } from '../commands/rule-fields';
import { attachmentsConfigSchema } from '../schemas';

describe('parseRuleFieldValues', () => {
  it('parses MESSAGE_FREQUENCY fields with defaults for blanks', () => {
    const config = parseRuleFieldValues('MESSAGE_FREQUENCY', { maxMessages: '', windowSeconds: '15' });
    expect(config).toEqual({ type: 'MESSAGE_FREQUENCY', maxMessages: 5, windowSeconds: 15 });
  });

  it('parses boolean and csv fields for INVITE_LINKS', () => {
    const config = parseRuleFieldValues('INVITE_LINKS', {
      allowOwnServerInvites: 'false',
      allowedInviteCodes: 'abc, def ,ghi',
    });
    expect(config).toEqual({
      type: 'INVITE_LINKS',
      allowOwnServerInvites: false,
      allowedInviteCodes: ['abc', 'def', 'ghi'],
    });
  });

  it('throws a friendly error for an out-of-range number', () => {
    expect(() =>
      parseRuleFieldValues('MESSAGE_FREQUENCY', { maxMessages: '9999', windowSeconds: '10' }),
    ).toThrow();
  });

  it('throws for an invalid regex pattern (catastrophic backtracking)', () => {
    expect(() => parseRuleFieldValues('REGEX_FILTER', { pattern: '(a+)+$', flags: 'i' })).toThrow();
  });

  it('parses REGEX_FILTER with a default flag when left blank', () => {
    const config = parseRuleFieldValues('REGEX_FILTER', { pattern: 'hello', flags: '' });
    expect(config).toEqual({ type: 'REGEX_FILTER', pattern: 'hello', flags: 'i' });
  });

  it('requires at least one word for WORD_FILTER', () => {
    expect(() =>
      parseRuleFieldValues('WORD_FILTER', { words: '', wholeWord: 'true', caseSensitive: 'false' }),
    ).toThrow();
  });

  it('keeps a cleared ATTACHMENTS extension list empty instead of restoring the defaults', () => {
    // The "blank box makes a rule that can never match" defect is fixed by the modal prefill below — the box now
    // arrives holding the defaults, so an empty one is a deliberate clear. Substituting the defaults here would
    // make a count-only rule impossible to express, and would re-add exe/bat/... to an existing one the next
    // time a moderator opened `/automod rule edit` and pressed submit.
    const config = parseRuleFieldValues('ATTACHMENTS', { blockedExtensions: '', maxAttachments: '5' });
    expect(config).toEqual({ type: 'ATTACHMENTS', blockedExtensions: [], maxAttachments: 5 });
  });

  it('still honours an explicit ATTACHMENTS extension list', () => {
    const config = parseRuleFieldValues('ATTACHMENTS', { blockedExtensions: 'zip, 7z', maxAttachments: '3' });
    expect(config).toEqual({ type: 'ATTACHMENTS', blockedExtensions: ['zip', '7z'], maxAttachments: 3 });
  });

  it('leaves a genuinely-empty optional list empty (INVITE_LINKS/SCAM_LINKS default to none)', () => {
    const config = parseRuleFieldValues('INVITE_LINKS', {
      allowOwnServerInvites: 'true',
      allowedInviteCodes: '',
    });
    expect(config).toEqual({ type: 'INVITE_LINKS', allowOwnServerInvites: true, allowedInviteCodes: [] });
  });
});

describe('RULE_FIELD_SPECS modal prefill', () => {
  it('prefills the ATTACHMENTS extension list from the schema default at create time', () => {
    const spec = RULE_FIELD_SPECS.ATTACHMENTS.find((field) => field.id === 'blockedExtensions');
    const defaults = attachmentsConfigSchema.parse({ type: 'ATTACHMENTS' }).blockedExtensions;
    // Create-time prefill passes `{}`; the moderator must see what an untouched field will actually produce.
    expect(spec?.stringify({})).toBe(defaults.join(', '));
  });

  it('labels inclusive thresholds as trigger points, not as allowances', () => {
    // "Max mentions = 5" flagged a message with exactly 5 — see "Threshold semantics" in engine/types.ts.
    const inclusive = [
      ['MENTION_SPAM', 'maxMentions'],
      ['DUPLICATE_MESSAGES', 'maxDuplicates'],
      ['CAPS', 'maxCapsPercent'],
      ['REPEATED_CHARS', 'maxRepeats'],
    ] as const;

    for (const [type, id] of inclusive) {
      const spec = RULE_FIELD_SPECS[type].find((field) => field.id === id);
      expect(spec?.label.toLowerCase()).not.toContain('max');
    }
  });
});
