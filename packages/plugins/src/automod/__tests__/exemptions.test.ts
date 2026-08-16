import { describe, expect, it } from 'vitest';
import { isExempt, isTrustedDomain } from '../exemptions';

const baseRule = { exemptRoleIds: ['role1'], exemptChannelIds: ['chan1'], exemptUserIds: ['user1'] };

describe('isExempt', () => {
  it('is not exempt by default', () => {
    expect(isExempt(baseRule, { userId: 'u2', channelId: 'c2', roleIds: [], isStaff: false }, true)).toBe(false);
  });

  it('exempts a listed user id', () => {
    expect(isExempt(baseRule, { userId: 'user1', channelId: 'c2', roleIds: [], isStaff: false }, true)).toBe(true);
  });

  it('exempts a listed channel', () => {
    expect(isExempt(baseRule, { userId: 'u2', channelId: 'chan1', roleIds: [], isStaff: false }, true)).toBe(true);
  });

  it('exempts a listed role', () => {
    expect(isExempt(baseRule, { userId: 'u2', channelId: 'c2', roleIds: ['role1'], isStaff: false }, true)).toBe(true);
  });

  it('exempts staff only when exemptStaff is true and the actor is staff', () => {
    expect(isExempt(baseRule, { userId: 'u2', channelId: 'c2', roleIds: [], isStaff: true }, true)).toBe(true);
    expect(isExempt(baseRule, { userId: 'u2', channelId: 'c2', roleIds: [], isStaff: true }, false)).toBe(false);
  });

  it('does not exempt when channelId is null and no other exemption applies', () => {
    expect(isExempt(baseRule, { userId: 'u2', channelId: null, roleIds: [], isStaff: false }, true)).toBe(false);
  });
});

describe('isTrustedDomain', () => {
  it('matches an exact domain', () => {
    expect(isTrustedDomain('example.com', ['example.com'])).toBe(true);
  });

  it('matches a subdomain of a trusted domain', () => {
    expect(isTrustedDomain('cdn.example.com', ['example.com'])).toBe(true);
  });

  it('does not match an unrelated domain', () => {
    expect(isTrustedDomain('evil.com', ['example.com'])).toBe(false);
  });

  it('does not match a domain that merely ends similarly (no dot boundary)', () => {
    expect(isTrustedDomain('notexample.com', ['example.com'])).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isTrustedDomain('Example.COM', ['example.com'])).toBe(true);
  });
});
