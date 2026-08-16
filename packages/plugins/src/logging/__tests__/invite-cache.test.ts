import { describe, expect, it } from 'vitest';
import { diffInviteUses } from '../invite-cache';

describe('diffInviteUses', () => {
  it('returns null when nothing changed', () => {
    const before = [{ code: 'abc', uses: 5 }];
    const after = [{ code: 'abc', uses: 5 }];
    expect(diffInviteUses(before, after)).toBeNull();
  });

  it('detects the invite whose use count went up', () => {
    const before = [
      { code: 'abc', uses: 5 },
      { code: 'def', uses: 2 },
    ];
    const after = [
      { code: 'abc', uses: 5 },
      { code: 'def', uses: 3 },
    ];
    expect(diffInviteUses(before, after)).toEqual({ code: 'def', usesBefore: 2, usesAfter: 3 });
  });

  it('treats a brand-new invite code with uses > 0 as a match (usesBefore defaults to 0)', () => {
    const before = [{ code: 'abc', uses: 5 }];
    const after = [
      { code: 'abc', uses: 5 },
      { code: 'new-invite', uses: 1 },
    ];
    expect(diffInviteUses(before, after)).toEqual({ code: 'new-invite', usesBefore: 0, usesAfter: 1 });
  });

  it('returns null when an invite was deleted (present before, absent after) even though that looks like a "decrease"', () => {
    const before = [{ code: 'abc', uses: 5 }];
    const after: typeof before = [];
    expect(diffInviteUses(before, after)).toBeNull();
  });

  it('picks the invite with the largest delta when more than one increased', () => {
    const before = [
      { code: 'small', uses: 0 },
      { code: 'big', uses: 0 },
    ];
    const after = [
      { code: 'small', uses: 1 },
      { code: 'big', uses: 5 },
    ];
    expect(diffInviteUses(before, after)).toEqual({ code: 'big', usesBefore: 0, usesAfter: 5 });
  });
});
