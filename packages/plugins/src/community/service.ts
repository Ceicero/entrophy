// Pure business logic for the community plugin — no discord.js/Prisma imports, so this is unit-testable in
// isolation (ARCHITECTURE.md §13). Commands/components/jobs call into these functions and do the I/O.

export interface PollOptionLike {
  id: string;
  label: string;
  position: number;
}

export interface PollVoteLike {
  optionId: string;
  userId: string;
}

export interface PollOptionTally {
  optionId: string;
  label: string;
  position: number;
  votes: number;
  /** Present only when the poll is not anonymous (ARCHITECTURE.md community spec: "public: voter list on results"). */
  voterIds?: string[];
}

/** Tallies votes per option, ordered by option position. Omits `voterIds` for anonymous polls. */
export function tallyPoll(options: PollOptionLike[], votes: PollVoteLike[], anonymous: boolean): PollOptionTally[] {
  const sorted = [...options].sort((a, b) => a.position - b.position);
  return sorted.map((option) => {
    const optionVotes = votes.filter((v) => v.optionId === option.id);
    const tally: PollOptionTally = { optionId: option.id, label: option.label, position: option.position, votes: optionVotes.length };
    if (!anonymous) {
      tally.voterIds = optionVotes.map((v) => v.userId);
    }
    return tally;
  });
}

/**
 * Decides what a poll vote click should do for `optionId`. Single-select polls replace any existing vote by the
 * user (in this poll) with this one; multi-select polls just toggle this option on/off independently.
 */
export interface PollVoteDecision {
  /** Option ids the user's existing votes should be removed from (before adding, if any). */
  removeOptionIds: string[];
  /** Whether a vote for `optionId` should be added after removal. False means "toggled off". */
  add: boolean;
}

export function decidePollVote(optionId: string, existingVotedOptionIds: string[], multiSelect: boolean): PollVoteDecision {
  const alreadyVotedThisOption = existingVotedOptionIds.includes(optionId);

  if (multiSelect) {
    return { removeOptionIds: alreadyVotedThisOption ? [optionId] : [], add: !alreadyVotedThisOption };
  }

  // Single-select: clicking the currently-voted option removes it; clicking any other option replaces the vote.
  if (alreadyVotedThisOption) {
    return { removeOptionIds: [optionId], add: false };
  }
  return { removeOptionIds: existingVotedOptionIds, add: true };
}

// ---------------------------------------------------------------------------
// Giveaways
// ---------------------------------------------------------------------------

export interface GiveawayEntryLike {
  userId: string;
}

/**
 * Picks up to `n` winners from `entries` without replacement, using `rng(maxExclusive)` to draw a uniform
 * random index in `[0, maxExclusive)` each step (inject `crypto.randomInt` in production, a fixed sequence in
 * tests for determinism).
 */
export function pickWinners<T extends GiveawayEntryLike>(entries: T[], n: number, rng: (maxExclusive: number) => number): T[] {
  const pool = [...entries];
  const winners: T[] = [];
  const count = Math.max(0, Math.min(n, pool.length));

  for (let i = 0; i < count; i++) {
    const index = rng(pool.length);
    const [picked] = pool.splice(index, 1);
    if (picked) winners.push(picked);
  }

  return winners;
}

export type GiveawayEligibilityReason = 'ended' | 'missing_role' | 'account_too_new' | 'below_min_level';

export interface GiveawayEligibilityInput {
  giveaway: {
    ended: boolean;
    requiredRoleIds: string[];
    minAccountAgeDays: number | null;
    minLevel: number | null;
  };
  member: {
    roleIds: string[];
    accountCreatedAt: Date;
    level: number;
  };
  now: Date;
}

export type GiveawayEligibilityResult = { ok: true } | { ok: false; reason: GiveawayEligibilityReason };

/** Checks whether a member may enter a giveaway, in a stable check order (ended, role, account age, level). */
export function checkGiveawayEligibility(input: GiveawayEligibilityInput): GiveawayEligibilityResult {
  const { giveaway, member, now } = input;

  if (giveaway.ended) {
    return { ok: false, reason: 'ended' };
  }

  if (giveaway.requiredRoleIds.length > 0 && !giveaway.requiredRoleIds.some((id) => member.roleIds.includes(id))) {
    return { ok: false, reason: 'missing_role' };
  }

  if (giveaway.minAccountAgeDays !== null) {
    const ageDays = (now.getTime() - member.accountCreatedAt.getTime()) / (24 * 60 * 60 * 1000);
    if (ageDays < giveaway.minAccountAgeDays) {
      return { ok: false, reason: 'account_too_new' };
    }
  }

  if (giveaway.minLevel !== null && member.level < giveaway.minLevel) {
    return { ok: false, reason: 'below_min_level' };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

export type SuggestionVoteDirection = 1 | -1;

export interface SuggestionVoteChange {
  /** New stored vote value for this user on this suggestion; `null` means "no vote" (delete the row). */
  newValue: SuggestionVoteDirection | null;
  upvoteDelta: number;
  downvoteDelta: number;
}

/** Computes the vote-row and counter changes for a suggestion up/down vote click, with toggle-off and switch support. */
export function toggleSuggestionVote(existing: SuggestionVoteDirection | null, direction: SuggestionVoteDirection): SuggestionVoteChange {
  if (existing === direction) {
    // Clicking the same direction again removes the vote.
    return { newValue: null, upvoteDelta: direction === 1 ? -1 : 0, downvoteDelta: direction === -1 ? -1 : 0 };
  }

  if (existing === null) {
    return { newValue: direction, upvoteDelta: direction === 1 ? 1 : 0, downvoteDelta: direction === -1 ? 1 : 0 };
  }

  // Switching from the opposite direction: remove the old vote's count and add the new one's.
  return {
    newValue: direction,
    upvoteDelta: direction === 1 ? 1 : -1,
    downvoteDelta: direction === -1 ? 1 : -1,
  };
}

export type SuggestionStatus = 'PENDING' | 'APPROVED' | 'DENIED' | 'IMPLEMENTED' | 'CONSIDERING';

/** Any status may transition to any other status except itself (a no-op the caller should skip). Staff decisions are never blocked by prior state (they can walk a suggestion back from DENIED, etc). */
export function isValidSuggestionTransition(from: SuggestionStatus, to: SuggestionStatus): boolean {
  return from !== to;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type RsvpStatus = 'GOING' | 'MAYBE' | 'DECLINED';

/** Computes which of an event's configured reminder-minute marks (e.g. `[60, 10]`) still have time to fire before `startsAt`. */
export function upcomingReminderMinutes(reminderMinutes: number[], startsAt: Date, now: Date): number[] {
  return reminderMinutes.filter((minutes) => startsAt.getTime() - minutes * 60_000 > now.getTime());
}
