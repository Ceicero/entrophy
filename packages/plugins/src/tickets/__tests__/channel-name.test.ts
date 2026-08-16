import { describe, expect, it } from 'vitest';
import { sanitizeChannelNameFragment, ticketChannelName } from '../channel-name';

describe('sanitizeChannelNameFragment', () => {
  it('lowercases and replaces spaces with dashes', () => {
    expect(sanitizeChannelNameFragment('John Smith')).toBe('john-smith');
  });

  it('strips characters unsafe for a Discord channel name', () => {
    expect(sanitizeChannelNameFragment('user!!!@@@###')).toBe('user');
  });

  it('strips diacritics down to ASCII', () => {
    expect(sanitizeChannelNameFragment('Zoë Müller')).toBe('zoe-muller');
  });

  it('collapses repeated dashes and trims leading/trailing dashes', () => {
    expect(sanitizeChannelNameFragment('  --weird--name--  ')).toBe('weird-name');
  });

  it('returns an empty string for input with nothing safe left', () => {
    expect(sanitizeChannelNameFragment('!!!')).toBe('');
  });
});

describe('ticketChannelName', () => {
  it('builds a ticket-<number>-<username> name', () => {
    expect(ticketChannelName(7, 'brandon')).toBe('ticket-7-brandon');
  });

  it('falls back to "user" when the username sanitizes to nothing', () => {
    expect(ticketChannelName(3, '!!!')).toBe('ticket-3-user');
  });

  it('never exceeds Discord\'s 100-character channel name limit', () => {
    const name = ticketChannelName(123456, 'a'.repeat(200));
    expect(name.length).toBeLessThanOrEqual(100);
    expect(name.startsWith('ticket-123456-')).toBe(true);
  });

  it('is stable/deterministic for the same inputs', () => {
    expect(ticketChannelName(1, 'sam')).toBe(ticketChannelName(1, 'sam'));
  });
});
