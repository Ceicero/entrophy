import { PermissionFlagsBits } from 'discord-api-types/v10';
import { describe, expect, it } from 'vitest';
import { missingPermissions } from '../src/permissions/discord';

/**
 * Regression guard: Administrator implicitly grants every permission in Discord, but a raw `have & flag`
 * test cannot see that — the other bits are simply absent from the bitfield. Observed live in the hub
 * server, where `/permissions audit` reported "missing Manage Server / Mute Members / Deafen Members"
 * while the bot's own member info read "Administrator (all permissions)".
 *
 * The audit is the visible symptom; `assertBotPermissions` is the damaging one, since it would refuse to
 * run commands the bot could actually execute.
 */
describe('missingPermissions', () => {
  const { Administrator, ManageGuild, BanMembers, MuteMembers, SendMessages } = PermissionFlagsBits;

  it('reports nothing missing when Administrator is held', () => {
    expect(missingPermissions(Administrator, [ManageGuild, BanMembers, MuteMembers])).toEqual([]);
  });

  it('still reports genuinely missing permissions without Administrator', () => {
    const have = SendMessages;

    const missing = missingPermissions(have, [SendMessages, ManageGuild]);

    expect(missing).toHaveLength(1);
    expect(missing[0]).toContain('Manage Server');
  });

  it('reports nothing when every required permission is held outright', () => {
    expect(missingPermissions(SendMessages | ManageGuild, [SendMessages, ManageGuild])).toEqual([]);
  });

  it('treats Administrator combined with other bits the same way', () => {
    expect(missingPermissions(Administrator | SendMessages, [BanMembers])).toEqual([]);
  });

  it('returns everything required when the bitfield is empty', () => {
    expect(missingPermissions(0n, [SendMessages, BanMembers])).toHaveLength(2);
  });
});
