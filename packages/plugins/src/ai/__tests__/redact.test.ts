import { describe, expect, it } from 'vitest';
import { redact, redactEmails, redactMentions, redactPhoneNumbers, redactTokens, redactUrls } from '../redact';

describe('ai redact', () => {
  it('replaces user/role mentions and @everyone/@here with @user', () => {
    expect(redactMentions('hey <@123456789012345678> and <@!223456789012345678>')).toBe('hey @user and @user');
    expect(redactMentions('ping <@&323456789012345678>')).toBe('ping @user');
    expect(redactMentions('@everyone please read, cc @here')).toBe('@user please read, cc @user');
  });

  it('replaces email addresses', () => {
    expect(redactEmails('contact me at jane.doe@example.com please')).toBe('contact me at [email] please');
  });

  it('replaces phone numbers in common formats', () => {
    expect(redactPhoneNumbers('call 555-123-4567 now')).toBe('call [phone] now');
    expect(redactPhoneNumbers('or (555) 123-4567')).toBe('or [phone]');
    expect(redactPhoneNumbers('intl +1 555 123 4567')).toBe('intl [phone]');
  });

  it('replaces URLs but keeps the domain', () => {
    expect(redactUrls('see https://example.com/some/secret/path?x=1 for details')).toBe('see [link: example.com] for details');
    expect(redactUrls('bare https://sub.example.co.uk')).toBe('bare [link: sub.example.co.uk]');
  });

  it('replaces token/key-shaped strings', () => {
    expect(redactTokens('key is sk-abcdefghij1234567890')).toBe('key is [redacted-token]');
    expect(redactTokens('Authorization: Bearer abc123.def456-ghi789')).toBe('Authorization: Bearer [redacted-token]');
    expect(redactTokens('opaque a1b2c3d4e5f6g7h8i9j0k1l2m3n4')).toBe('opaque [redacted-token]');
  });

  it('does not redact ordinary words or short numbers', () => {
    expect(redactTokens('hello world this is a normal sentence')).toBe('hello world this is a normal sentence');
    expect(redactPhoneNumbers('the year 2024 was fine')).toBe('the year 2024 was fine');
  });

  it('composes every pass via redact()', () => {
    const input = 'Hey <@123456789012345678>, email me at me@example.com or call 555-123-4567, see https://example.com/x, key sk-abcdefghij1234567890';
    const out = redact(input);
    expect(out).toContain('@user');
    expect(out).toContain('[email]');
    expect(out).toContain('[phone]');
    expect(out).toContain('[link: example.com]');
    expect(out).toContain('[redacted-token]');
    expect(out).not.toContain('me@example.com');
    expect(out).not.toContain('555-123-4567');
    expect(out).not.toContain('sk-abcdefghij1234567890');
  });
});
