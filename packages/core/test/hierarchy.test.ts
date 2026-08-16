import { describe, expect, it } from 'vitest';
import { checkModerationTarget, type HierarchyMemberLike } from '../src/permissions/hierarchy';

const GUILD_OWNER_ID = 'owner-1';
const BOT_ID = 'bot-1';
const BOT_OWNER_ID = 'bot-owner-1';

function actorOf(id: string, highestRolePosition: number): HierarchyMemberLike {
  return { id, highestRolePosition };
}

const botMember = actorOf(BOT_ID, 50);

describe('checkModerationTarget', () => {
  it('rejects acting on yourself', () => {
    const actor = actorOf('mod-1', 10);
    const result = checkModerationTarget({
      actor,
      target: actor,
      botMember,
      guildOwnerId: GUILD_OWNER_ID,
      botOwnerIds: [],
    });
    expect(result).toEqual({ ok: false, reason: 'self' });
  });

  it('rejects acting on the bot', () => {
    const actor = actorOf('mod-1', 10);
    const result = checkModerationTarget({
      actor,
      target: botMember,
      botMember,
      guildOwnerId: GUILD_OWNER_ID,
      botOwnerIds: [],
    });
    expect(result).toEqual({ ok: false, reason: 'bot' });
  });

  it('rejects acting on the guild owner', () => {
    const actor = actorOf('mod-1', 10);
    const target = actorOf(GUILD_OWNER_ID, 1);
    const result = checkModerationTarget({
      actor,
      target,
      botMember,
      guildOwnerId: GUILD_OWNER_ID,
      botOwnerIds: [],
    });
    expect(result).toEqual({ ok: false, reason: 'guild_owner' });
  });

  it('rejects acting on a bot owner', () => {
    const actor = actorOf('mod-1', 10);
    const target = actorOf(BOT_OWNER_ID, 5);
    const result = checkModerationTarget({
      actor,
      target,
      botMember,
      guildOwnerId: GUILD_OWNER_ID,
      botOwnerIds: [BOT_OWNER_ID],
    });
    expect(result).toEqual({ ok: false, reason: 'bot_owner' });
  });

  it('rejects a target whose highest role is at or above the actor', () => {
    const actor = actorOf('mod-1', 10);
    const targetEqual = actorOf('target-1', 10);
    const targetHigher = actorOf('target-2', 20);

    expect(
      checkModerationTarget({ actor, target: targetEqual, botMember, guildOwnerId: GUILD_OWNER_ID, botOwnerIds: [] }),
    ).toEqual({ ok: false, reason: 'target_higher_or_equal_than_actor' });

    expect(
      checkModerationTarget({ actor, target: targetHigher, botMember, guildOwnerId: GUILD_OWNER_ID, botOwnerIds: [] }),
    ).toEqual({ ok: false, reason: 'target_higher_or_equal_than_actor' });
  });

  it('rejects a target whose highest role is at or above the bot', () => {
    const actor = actorOf(GUILD_OWNER_ID, 5); // owner bypasses the actor-position check
    const target = actorOf('target-1', 60); // >= botMember position (50)

    const result = checkModerationTarget({
      actor,
      target,
      botMember,
      guildOwnerId: GUILD_OWNER_ID,
      botOwnerIds: [],
    });
    expect(result).toEqual({ ok: false, reason: 'target_higher_or_equal_than_bot' });
  });

  it('allows the guild owner to act on a target whose role position outranks typical staff', () => {
    const actor = actorOf(GUILD_OWNER_ID, 1); // owner's own role position is irrelevant
    const target = actorOf('admin-1', 40); // below the bot's position (50), so it can still succeed

    const result = checkModerationTarget({
      actor,
      target,
      botMember,
      guildOwnerId: GUILD_OWNER_ID,
      botOwnerIds: [],
    });
    expect(result).toEqual({ ok: true });
  });

  it('allows a normal moderator to act on a strictly lower target', () => {
    const actor = actorOf('mod-1', 10);
    const target = actorOf('member-1', 1);

    const result = checkModerationTarget({
      actor,
      target,
      botMember,
      guildOwnerId: GUILD_OWNER_ID,
      botOwnerIds: [],
    });
    expect(result).toEqual({ ok: true });
  });
});
