import { describe, expect, it } from 'vitest';
import { redactText, testRedactionPatterns } from '../redaction';

describe('redactText — default patterns', () => {
  it('redacts an email address', () => {
    expect(redactText('contact me at brandon.simonds@tutamail.com please')).toBe(
      'contact me at [redacted:email] please',
    );
  });

  it('redacts a US-style phone number', () => {
    expect(redactText('call 555-123-4567 now')).toBe('call [redacted:phone] now');
  });

  it('redacts something shaped like a Discord bot token', () => {
    const fakeToken = 'MTIzNDU2Nzg5MDEyMzQ1Njc4.G1a2b3.abcdefghijklmnopqrstuvwxyz012345678';
    expect(redactText(`token leaked: ${fakeToken}`)).toBe('token leaked: [redacted:discord_token]');
  });

  it('redacts a credit-card-shaped digit run', () => {
    expect(redactText('card 4111 1111 1111 1111 expires soon')).toBe(
      'card [redacted:credit_card] expires soon',
    );
  });

  it('redacts an IPv4 address', () => {
    expect(redactText('connect to 192.168.1.42 over VPN')).toBe('connect to [redacted:ipv4] over VPN');
  });

  it('leaves ordinary text untouched', () => {
    expect(redactText('the quick brown fox jumps over the lazy dog')).toBe(
      'the quick brown fox jumps over the lazy dog',
    );
  });
});

describe('redactText — custom patterns', () => {
  it('applies a valid custom regex pattern on top of the defaults', () => {
    expect(redactText('the secret codeword is PINEAPPLE today', ['pineapple'])).toBe(
      'the secret codeword is [redacted:custom1] today',
    );
  });

  it('applies multiple custom patterns, numbered in order', () => {
    const result = redactText('alpha bravo charlie', ['alpha', 'bravo']);
    expect(result).toBe('[redacted:custom1] [redacted:custom2] charlie');
  });

  it('silently skips an unsafe/invalid custom pattern instead of throwing', () => {
    expect(() => redactText('hello world', ['(a+)+b'])).not.toThrow();
    expect(redactText('hello world', ['(a+)+b'])).toBe('hello world');
  });
});

describe('redactText — Discord snowflakes vs credit cards', () => {
  it('leaves a channel mention completely unchanged', () => {
    expect(redactText('<#1539837857747832943>')).toBe('<#1539837857747832943>');
  });

  it('leaves a bare snowflake id completely unchanged', () => {
    expect(redactText('1539837857747832943')).toBe('1539837857747832943');
  });

  it('leaves a user mention unchanged', () => {
    expect(redactText('welcome <@1539837857747832943> to the server')).toBe(
      'welcome <@1539837857747832943> to the server',
    );
  });

  it('leaves a role mention unchanged', () => {
    expect(redactText('pinging <@&1539837857747832943> now')).toBe('pinging <@&1539837857747832943> now');
  });

  it('round-trips the exact production "Channel created" log line unchanged', () => {
    const line = '<#1539837857747832943> (1539837857747832943) was created.';
    expect(redactText(line)).toBe(line);
  });

  it('still redacts a Luhn-valid card number, including spaced and dashed forms', () => {
    expect(redactText('card 4242424242424242 on file')).toBe('card [redacted:credit_card] on file');
    expect(redactText('card 4242 4242 4242 4242 on file')).toBe('card [redacted:credit_card] on file');
    expect(redactText('card 4242-4242-4242-4242 on file')).toBe('card [redacted:credit_card] on file');
  });

  it('redacts only the card when a Luhn-valid card sits next to a bare snowflake', () => {
    expect(redactText('user 1539837857747832943 paid with card 4242424242424242 today')).toBe(
      'user 1539837857747832943 paid with card [redacted:credit_card] today',
    );
  });
});

describe('testRedactionPatterns', () => {
  it('reports which patterns matched and returns the redacted text', () => {
    const result = testRedactionPatterns('email me at a@b.com or call 555-000-1234', []);
    expect(result.redacted).toBe('email me at [redacted:email] or call [redacted:phone]');
    const emailMatch = result.matches.find((m) => m.name === 'email');
    const ipv4Match = result.matches.find((m) => m.name === 'ipv4');
    expect(emailMatch?.matched).toBe(true);
    expect(ipv4Match?.matched).toBe(false);
  });

  it('includes custom patterns in the match report', () => {
    const result = testRedactionPatterns('the launch codeword is banana', ['banana']);
    expect(result.matches.some((m) => m.name === 'custom1' && m.matched)).toBe(true);
    expect(result.redacted).toContain('[redacted:custom1]');
  });
});
