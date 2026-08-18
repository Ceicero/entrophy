import { describe, expect, it } from 'vitest';
import { deriveSetupState, formatMemoryMb, formatUptime } from '../format';

const base = {
  setupCompletedAt: null as string | null,
  modRoleIds: [] as string[],
  adminRoleIds: [] as string[],
  modLogChannelId: null as string | null,
};

describe('deriveSetupState', () => {
  it('reports "wizard" whenever setupCompletedAt is set, regardless of the rest', () => {
    expect(deriveSetupState({ ...base, setupCompletedAt: '2026-08-01T00:00:00.000Z' })).toEqual({
      kind: 'wizard',
      completedAt: '2026-08-01T00:00:00.000Z',
    });
  });

  it('reports "configured" when staff roles + a mod-log channel exist without the wizard ever running', () => {
    expect(deriveSetupState({ ...base, modRoleIds: ['1'], modLogChannelId: '9' })).toEqual({
      kind: 'configured',
    });
  });

  it('does NOT count admin roles alone as staff — must agree with the API overview, which only checks modRoleIds', () => {
    expect(deriveSetupState({ ...base, adminRoleIds: ['2'], modLogChannelId: '9' })).toEqual({
      kind: 'incomplete',
      missing: ['modRoles'],
    });
  });

  it('reports "incomplete" with modLogChannel missing when roles exist but no channel', () => {
    expect(deriveSetupState({ ...base, modRoleIds: ['1'] })).toEqual({
      kind: 'incomplete',
      missing: ['modLogChannel'],
    });
  });

  it('reports "incomplete" with modRoles missing when a channel exists but no staff roles', () => {
    expect(deriveSetupState({ ...base, modLogChannelId: '9' })).toEqual({
      kind: 'incomplete',
      missing: ['modRoles'],
    });
  });

  it('lists both when a fresh guild has nothing configured', () => {
    expect(deriveSetupState(base)).toEqual({ kind: 'incomplete', missing: ['modRoles', 'modLogChannel'] });
  });
});

describe('formatting helpers', () => {
  it('formatMemoryMb renders one decimal MB', () => {
    expect(formatMemoryMb(42.3 * 1024 * 1024)).toBe('42.3 MB');
  });

  it('formatUptime picks the two most significant units', () => {
    expect(formatUptime(3 * 86400 + 4 * 3600)).toBe('3d 4h');
    expect(formatUptime(65)).toBe('1m 5s');
    expect(formatUptime(9)).toBe('9s');
  });
});
