import { PermissionFlagsBits } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  cooldownKey,
  evaluateRequirement,
  globalLimiterKey,
  requirementFailureMessage,
} from '../permissions';

const BOT_OWNER_IDS = ['owner-1'];

describe('evaluateRequirement', () => {
  it('passes when no requirement is declared', () => {
    const result = evaluateRequirement({
      requirement: undefined,
      staffLevel: 'member',
      actorPermissionsBitfield: 0n,
      userId: 'user-1',
      botOwnerIds: [],
    });
    expect(result).toEqual({ ok: true });
  });

  it('passes when the requirement declares neither staffLevel nor discordPermissions', () => {
    const result = evaluateRequirement({
      requirement: {},
      staffLevel: 'member',
      actorPermissionsBitfield: 0n,
      userId: 'user-1',
      botOwnerIds: [],
    });
    expect(result).toEqual({ ok: true });
  });

  describe('botOwnerOnly', () => {
    it('rejects a non-owner', () => {
      const result = evaluateRequirement({
        requirement: { botOwnerOnly: true },
        staffLevel: 'owner',
        actorPermissionsBitfield: 0n,
        userId: 'user-1',
        botOwnerIds: BOT_OWNER_IDS,
      });
      expect(result).toEqual({ ok: false, reason: 'bot_owner_only' });
    });

    it('allows a configured bot owner', () => {
      const result = evaluateRequirement({
        requirement: { botOwnerOnly: true },
        staffLevel: 'member',
        actorPermissionsBitfield: 0n,
        userId: 'owner-1',
        botOwnerIds: BOT_OWNER_IDS,
      });
      expect(result).toEqual({ ok: true });
    });

    it('is checked before staffLevel/discordPermissions', () => {
      const result = evaluateRequirement({
        requirement: { botOwnerOnly: true, staffLevel: 'admin' },
        staffLevel: 'owner',
        actorPermissionsBitfield: 0n,
        userId: 'not-an-owner',
        botOwnerIds: BOT_OWNER_IDS,
      });
      expect(result).toEqual({ ok: false, reason: 'bot_owner_only' });
    });
  });

  describe('staffLevel alone', () => {
    it('rejects a member below the required rank', () => {
      const result = evaluateRequirement({
        requirement: { staffLevel: 'moderator' },
        staffLevel: 'helper',
        actorPermissionsBitfield: 0n,
        userId: 'user-1',
        botOwnerIds: [],
      });
      expect(result).toEqual({ ok: false, reason: 'missing_staff_level', level: 'moderator' });
    });

    it('allows a member at exactly the required rank', () => {
      const result = evaluateRequirement({
        requirement: { staffLevel: 'moderator' },
        staffLevel: 'moderator',
        actorPermissionsBitfield: 0n,
        userId: 'user-1',
        botOwnerIds: [],
      });
      expect(result).toEqual({ ok: true });
    });

    it('allows a member above the required rank', () => {
      const result = evaluateRequirement({
        requirement: { staffLevel: 'moderator' },
        staffLevel: 'admin',
        actorPermissionsBitfield: 0n,
        userId: 'user-1',
        botOwnerIds: [],
      });
      expect(result).toEqual({ ok: true });
    });
  });

  describe('discordPermissions alone', () => {
    it('rejects when a required permission is missing', () => {
      const result = evaluateRequirement({
        requirement: { discordPermissions: [PermissionFlagsBits.BanMembers] },
        staffLevel: 'member',
        actorPermissionsBitfield: PermissionFlagsBits.KickMembers,
        userId: 'user-1',
        botOwnerIds: [],
      });
      expect(result).toMatchObject({ ok: false, reason: 'missing_discord_permission' });
    });

    it('requires ALL declared permissions, not any', () => {
      const result = evaluateRequirement({
        requirement: { discordPermissions: [PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers] },
        staffLevel: 'member',
        actorPermissionsBitfield: PermissionFlagsBits.KickMembers,
        userId: 'user-1',
        botOwnerIds: [],
      });
      expect(result.ok).toBe(false);
    });

    it('allows when every required permission is present', () => {
      const result = evaluateRequirement({
        requirement: { discordPermissions: [PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers] },
        staffLevel: 'member',
        actorPermissionsBitfield: PermissionFlagsBits.KickMembers | PermissionFlagsBits.BanMembers,
        userId: 'user-1',
        botOwnerIds: [],
      });
      expect(result).toEqual({ ok: true });
    });
  });

  describe('staffLevel OR discordPermissions (both declared)', () => {
    const requirement = { staffLevel: 'admin' as const, discordPermissions: [PermissionFlagsBits.BanMembers] };

    it('passes when only staffLevel is satisfied', () => {
      const result = evaluateRequirement({
        requirement,
        staffLevel: 'admin',
        actorPermissionsBitfield: 0n,
        userId: 'user-1',
        botOwnerIds: [],
      });
      expect(result).toEqual({ ok: true });
    });

    it('passes when only discordPermissions is satisfied', () => {
      const result = evaluateRequirement({
        requirement,
        staffLevel: 'member',
        actorPermissionsBitfield: PermissionFlagsBits.BanMembers,
        userId: 'user-1',
        botOwnerIds: [],
      });
      expect(result).toEqual({ ok: true });
    });

    it('fails when neither is satisfied', () => {
      const result = evaluateRequirement({
        requirement,
        staffLevel: 'member',
        actorPermissionsBitfield: 0n,
        userId: 'user-1',
        botOwnerIds: [],
      });
      expect(result.ok).toBe(false);
    });
  });
});

describe('requirementFailureMessage', () => {
  const t = (key: string, vars?: Record<string, string | number>) => `${key}${vars ? `:${JSON.stringify(vars)}` : ''}`;

  it('formats bot_owner_only via errors.permission_denied', () => {
    expect(requirementFailureMessage({ ok: false, reason: 'bot_owner_only' }, t)).toBe('errors.permission_denied');
  });

  it('formats missing_staff_level with the required level interpolated', () => {
    expect(requirementFailureMessage({ ok: false, reason: 'missing_staff_level', level: 'admin' }, t)).toBe(
      'errors.missing_staff_level:{"level":"admin"}',
    );
  });

  it('formats missing_discord_permission with the missing permission names interpolated', () => {
    expect(requirementFailureMessage({ ok: false, reason: 'missing_discord_permission', permission: 'Ban Members' }, t)).toBe(
      'errors.missing_discord_permission:{"permission":"Ban Members"}',
    );
  });
});

describe('cooldownKey', () => {
  const ids = { userId: 'u1', guildId: 'g1', channelId: 'c1' };

  it('scopes by user', () => {
    expect(cooldownKey('warn', 'user', ids)).toBe('cmd:warn:user:u1');
  });

  it('scopes by guild', () => {
    expect(cooldownKey('warn', 'guild', ids)).toBe('cmd:warn:guild:g1');
  });

  it('scopes by channel', () => {
    expect(cooldownKey('warn', 'channel', ids)).toBe('cmd:warn:channel:c1');
  });

  it('is stable for the same inputs', () => {
    expect(cooldownKey('ban', 'user', ids)).toBe(cooldownKey('ban', 'user', ids));
  });
});

describe('globalLimiterKey', () => {
  it('namespaces by user id', () => {
    expect(globalLimiterKey('u1')).toBe('global:u1');
  });
});
