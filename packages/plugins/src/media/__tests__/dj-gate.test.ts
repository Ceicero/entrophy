import { describe, expect, it } from 'vitest';
import { hasDjPermission } from '../dj-gate';

describe('hasDjPermission', () => {
  it('requires the DJ role when one is configured, regardless of staff level', () => {
    expect(
      hasDjPermission({
        djRoleId: 'role-1',
        staffLevel: 'admin',
        memberRoleIds: ['role-2'],
        isAloneInVoiceChannel: true,
      }),
    ).toBe(false);
    expect(
      hasDjPermission({
        djRoleId: 'role-1',
        staffLevel: 'member',
        memberRoleIds: ['role-1'],
        isAloneInVoiceChannel: false,
      }),
    ).toBe(true);
  });

  it('when no DJ role is set, staff (helper+) are allowed', () => {
    expect(
      hasDjPermission({
        djRoleId: null,
        staffLevel: 'helper',
        memberRoleIds: [],
        isAloneInVoiceChannel: false,
      }),
    ).toBe(true);
    expect(
      hasDjPermission({
        djRoleId: null,
        staffLevel: 'moderator',
        memberRoleIds: [],
        isAloneInVoiceChannel: false,
      }),
    ).toBe(true);
  });

  it('when no DJ role is set, a plain member is allowed only if alone in their voice channel', () => {
    expect(
      hasDjPermission({
        djRoleId: null,
        staffLevel: 'member',
        memberRoleIds: [],
        isAloneInVoiceChannel: true,
      }),
    ).toBe(true);
    expect(
      hasDjPermission({
        djRoleId: null,
        staffLevel: 'member',
        memberRoleIds: [],
        isAloneInVoiceChannel: false,
      }),
    ).toBe(false);
  });
});
