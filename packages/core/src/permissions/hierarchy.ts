/** Reasons a moderation-target hierarchy check can fail. */
export type HierarchyReason =
  | 'self'
  | 'bot'
  | 'guild_owner'
  | 'bot_owner'
  | 'target_higher_or_equal_than_actor'
  | 'target_higher_or_equal_than_bot';

/** Minimal plain-data shape needed for hierarchy checks — no discord.js dependency. */
export interface HierarchyMemberLike {
  id: string;
  highestRolePosition: number;
  isBot?: boolean;
}

export interface CheckModerationTargetInput {
  actor: HierarchyMemberLike;
  target: HierarchyMemberLike;
  botMember: HierarchyMemberLike;
  guildOwnerId: string;
  botOwnerIds: string[];
}

export type HierarchyCheckResult = { ok: true } | { ok: false; reason: HierarchyReason };

/**
 * Checks whether `actor` may take a moderation action against `target`. Rejects acting on yourself, the bot,
 * the guild owner, or a bot owner; and rejects targets whose highest role outranks the actor's (unless the
 * actor is the guild owner, who always outranks role position) or the bot's own highest role.
 */
export function checkModerationTarget(input: CheckModerationTargetInput): HierarchyCheckResult {
  const { actor, target, botMember, guildOwnerId, botOwnerIds } = input;

  if (target.id === actor.id) {
    return { ok: false, reason: 'self' };
  }
  if (target.id === botMember.id) {
    return { ok: false, reason: 'bot' };
  }
  if (target.id === guildOwnerId) {
    return { ok: false, reason: 'guild_owner' };
  }
  if (botOwnerIds.includes(target.id)) {
    return { ok: false, reason: 'bot_owner' };
  }
  if (actor.id !== guildOwnerId && target.highestRolePosition >= actor.highestRolePosition) {
    return { ok: false, reason: 'target_higher_or_equal_than_actor' };
  }
  if (target.highestRolePosition >= botMember.highestRolePosition) {
    return { ok: false, reason: 'target_higher_or_equal_than_bot' };
  }

  return { ok: true };
}
