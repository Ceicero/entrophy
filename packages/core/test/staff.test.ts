import { PermissionFlagsBits } from 'discord-api-types/v10';
import { describe, expect, it } from 'vitest';
import { hasStaffLevel, resolveStaffLevel, type MemberLike } from '../src/permissions/staff';

const GUILD_OWNER_ID = 'owner-1';
const BOT_OWNER_ID = 'bot-owner-1';

const staffRoles = {
  adminRoleIds: ['role-admin'],
  modRoleIds: ['role-mod'],
  helperRoleIds: ['role-helper'],
};

function member(overrides: Partial<MemberLike> = {}): MemberLike {
  return {
    id: 'member-1',
    roleIds: [],
    permissions: 0n,
    highestRolePosition: 1,
    ...overrides,
  };
}

describe('resolveStaffLevel', () => {
  it('resolves the guild owner as owner regardless of roles/permissions', () => {
    const level = resolveStaffLevel({
      member: member({ id: GUILD_OWNER_ID }),
      guildOwnerId: GUILD_OWNER_ID,
      botOwnerIds: [],
      staffRoles,
    });
    expect(level).toBe('owner');
  });

  it('resolves configured admin/mod/helper roles in priority order', () => {
    const admin = resolveStaffLevel({
      member: member({ roleIds: ['role-admin', 'role-helper'] }),
      guildOwnerId: GUILD_OWNER_ID,
      botOwnerIds: [],
      staffRoles,
    });
    expect(admin).toBe('admin');

    const mod = resolveStaffLevel({
      member: member({ roleIds: ['role-mod'] }),
      guildOwnerId: GUILD_OWNER_ID,
      botOwnerIds: [],
      staffRoles,
    });
    expect(mod).toBe('moderator');

    const helper = resolveStaffLevel({
      member: member({ roleIds: ['role-helper'] }),
      guildOwnerId: GUILD_OWNER_ID,
      botOwnerIds: [],
      staffRoles,
    });
    expect(helper).toBe('helper');
  });

  it('falls back to Discord permissions when no configured role matches', () => {
    const admin = resolveStaffLevel({
      member: member({ permissions: PermissionFlagsBits.ManageGuild }),
      guildOwnerId: GUILD_OWNER_ID,
      botOwnerIds: [],
      staffRoles,
    });
    expect(admin).toBe('admin');

    const adminViaAdministrator = resolveStaffLevel({
      member: member({ permissions: PermissionFlagsBits.Administrator }),
      guildOwnerId: GUILD_OWNER_ID,
      botOwnerIds: [],
      staffRoles,
    });
    expect(adminViaAdministrator).toBe('admin');

    const mod = resolveStaffLevel({
      member: member({ permissions: PermissionFlagsBits.BanMembers }),
      guildOwnerId: GUILD_OWNER_ID,
      botOwnerIds: [],
      staffRoles,
    });
    expect(mod).toBe('moderator');
  });

  it('resolves plain members with no roles or relevant permissions as member', () => {
    const level = resolveStaffLevel({
      member: member(),
      guildOwnerId: GUILD_OWNER_ID,
      botOwnerIds: [],
      staffRoles,
    });
    expect(level).toBe('member');
  });

  it('floors bot owners at admin (not owner) unless they are the guild owner', () => {
    const level = resolveStaffLevel({
      member: member({ id: BOT_OWNER_ID }),
      guildOwnerId: GUILD_OWNER_ID,
      botOwnerIds: [BOT_OWNER_ID],
      staffRoles,
    });
    expect(level).toBe('admin');

    const ownerWhoIsAlsoBotOwner = resolveStaffLevel({
      member: member({ id: GUILD_OWNER_ID }),
      guildOwnerId: GUILD_OWNER_ID,
      botOwnerIds: [GUILD_OWNER_ID],
      staffRoles,
    });
    expect(ownerWhoIsAlsoBotOwner).toBe('owner');
  });
});

describe('hasStaffLevel', () => {
  it('compares ranks correctly', () => {
    expect(hasStaffLevel('admin', 'moderator')).toBe(true);
    expect(hasStaffLevel('moderator', 'admin')).toBe(false);
    expect(hasStaffLevel('owner', 'admin')).toBe(true);
    expect(hasStaffLevel('member', 'member')).toBe(true);
  });
});
